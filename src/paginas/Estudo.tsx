import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControleAudio } from "../audio";
import { leEstado, mudaConfig, mudaTentativa, novaTentativa, resetaSimulado, useConfig, useEstado } from "../armazenamento";
import { confere, notaDoEstudo } from "../correcao";
import { carregaLexico, carregaProva, nomeParte, NOMES_SECAO, regras, urlMidia } from "../dados";
import { CaixaRevisao } from "../componentes/CaixaRevisao";
import { BlocoExemplo, chaveBloco } from "../componentes/Exemplo";
import { ProvedorLeitura } from "../componentes/Leitura";
import { instrucao, VisaoQuestao } from "../componentes/Questao";
import { RoteiroCompleto } from "../componentes/RoteiroCompleto";
import type { Lexico, Prova, Questao, Tentativa } from "../tipos";

export function useProvaELexico(id: string) {
  const [prova, setProva] = useState<Prova | null>(null);
  const [lexico, setLexico] = useState<Lexico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    carregaProva(id).then(setProva).catch((e) => setErro(String(e)));
    carregaLexico().then(setLexico).catch(() => setLexico({}));
  }, [id]);
  return { prova, lexico, erro };
}

export function useAudioDaProva(prova: Prova | null) {
  const [audio, setAudio] = useState<ControleAudio | null>(null);
  useEffect(() => {
    if (!prova?.audio) return;
    const a = new ControleAudio(urlMidia(prova.audio.src));
    setAudio(a);
    return () => a.destroi();
  }, [prova]);
  return audio;
}

function tentativaDeEstudo(id: string): Tentativa {
  const existentes = Object.values(leEstado().tentativas)
    .filter((t) => t.prova === id && t.modo === "estudo" && !t.fim && !t.arquivada)
    .sort((a, b) => b.inicio - a.inicio);
  return existentes[0] ?? novaTentativa(id, "estudo");
}

export function PaginaEstudo({ id, nInicial }: { id: string; nInicial?: number }) {
  const { prova, lexico, erro } = useProvaELexico(id);
  const audio = useAudioDaProva(prova);
  const cfg = useConfig();
  const [tid, setTid] = useState(() => tentativaDeEstudo(id).id);
  const tentativa = useEstado((e) => e.tentativas[tid]);
  const [n, setN] = useState<number>(() => {
    if (nInicial) return nInicial;
    const t = leEstado().tentativas[tid];
    for (let i = 1; i <= 100; i++) if (!t?.respostas[i]) return i;
    return 1;
  });
  const [verRoteiro, setVerRoteiro] = useState(false);
  const [caixaFechada, setCaixaFechada] = useState<Record<number, boolean>>({});
  const [caixaAberta, setCaixaAberta] = useState<Record<number, boolean>>({});
  const topoRef = useRef<HTMLDivElement>(null);

  const q = prova?.questoes.find((x) => x.n === n);
  const resposta = tentativa?.respostas[n];

  // número que não existe na prova (ex.: todas respondidas → "a próxima" seria a 81; ou um /n inválido na URL):
  // vai para a primeira não respondida, ou para a 1ª questão se a prova já foi toda feita
  useEffect(() => {
    if (!prova || q || !prova.questoes.length) return;
    const t = leEstado().tentativas[tid];
    setN((prova.questoes.find((x) => !t?.respostas[x.n]) ?? prova.questoes[0]).n);
  }, [prova, q, tid]);

  // ---- correção por blocos: questões que dividem as mesmas alternativas (um grupo, ex.: 41–45)
  // só mostram certo/errado quando o bloco inteiro foi respondido e você manda corrigir.
  const porBlocos = cfg.porBlocos !== false;
  const blocoDe = useCallback(
    (x: Questao | undefined) => (porBlocos && x?.grupo && prova?.grupos[x.grupo] ? x.grupo : null),
    [porBlocos, prova],
  );
  const visivel = useCallback(
    (x: Questao) => {
      const g = blocoDe(x);
      return !g || !!tentativa?.blocosCorrigidos?.[g];
    },
    [blocoDe, tentativa],
  );
  const bloco = blocoDe(q);
  const nsBloco = bloco && prova ? prova.grupos[bloco].questoes : [];
  const blocoCorrigido = !!bloco && !!tentativa?.blocosCorrigidos?.[bloco];
  const faltamBloco = nsBloco.filter((m) => !tentativa?.respostas[m]).length;
  const revelado = !!resposta && (!q || visivel(q));

  // tentativas de antes do modo por blocos: blocos que já tinham respostas contam como corrigidos
  useEffect(() => {
    if (!prova || !tentativa || tentativa.blocosCorrigidos) return;
    const corr: Record<string, boolean> = {};
    for (const [g, gr] of Object.entries(prova.grupos)) if (gr.questoes.some((m) => tentativa.respostas[m])) corr[g] = true;
    mudaTentativa(tid, (t) => ({ ...t, blocosCorrigidos: { ...corr, ...(t.blocosCorrigidos ?? {}) } }));
  }, [prova, tentativa, tid]);

  // correção por blocos desligada em ⚙: nada fica pendente
  useEffect(() => {
    if (porBlocos || !tentativa || !Object.values(tentativa.respostas).some((r) => r.pendente)) return;
    mudaTentativa(tid, (t) => ({
      ...t,
      respostas: Object.fromEntries(Object.entries(t.respostas).map(([k, r]) => [k, r.pendente ? { ...r, pendente: undefined } : r])),
    }));
  }, [porBlocos, tentativa, tid]);

  const corrigeBloco = useCallback(() => {
    if (!bloco) return;
    mudaTentativa(tid, (t) => {
      const respostas = { ...t.respostas };
      for (const m of nsBloco) if (respostas[m]?.pendente) respostas[m] = { ...respostas[m], pendente: undefined };
      return { ...t, respostas, blocosCorrigidos: { ...(t.blocosCorrigidos ?? {}), [bloco]: true } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloco, tid, nsBloco.join(",")]);

  const responde = useCallback(
    (v: string | boolean) => {
      if (!q) return;
      const certa = confere(q, v);
      // bloco ainda aberto: a resposta fica "pendente" (fora das notas) até o bloco ser corrigido
      const g = porBlocos && q.grupo && prova?.grupos[q.grupo] ? q.grupo : null;
      mudaTentativa(tid, (t) => {
        const pendente = !!g && !t.blocosCorrigidos?.[g];
        return { ...t, respostas: { ...t.respostas, [q.n]: { valor: v, certa, em: Date.now(), ...(pendente ? { pendente: true } : {}) } } };
      });
    },
    [q, tid, porBlocos, prova],
  );

  const marcaCerta = useCallback(() => {
    if (!q) return;
    mudaTentativa(tid, (t) => ({ ...t, respostas: { ...t.respostas, [q.n]: { ...t.respostas[q.n], manual: true } } }));
  }, [q, tid]);

  const refaz = () => {
    if (!q) return;
    // num bloco, refazer recomeça o bloco inteiro (senão as outras respostas entregariam a que sobrou)
    const ns = bloco ? nsBloco : [q.n];
    mudaTentativa(tid, (t) => {
      const resto = { ...t.respostas };
      for (const m of ns) delete resto[m];
      const corr = { ...(t.blocosCorrigidos ?? {}) };
      if (bloco) delete corr[bloco];
      return { ...t, respostas: resto, blocosCorrigidos: corr };
    });
    setCaixaFechada((c) => ({ ...c, ...Object.fromEntries(ns.map((m) => [m, false])) }));
    if (bloco && nsBloco[0] !== q.n) vai(nsBloco[0]);
  };

  const consultou = useCallback(
    (w: string) => {
      if (!q) return;
      mudaTentativa(tid, (t) => {
        const atual = t.consultas?.[q.n] ?? [];
        if (atual.includes(w)) return t;
        return { ...t, consultas: { ...(t.consultas ?? {}), [q.n]: [...atual, w] } };
      });
    },
    [q, tid],
  );

  const ultima = prova?.questoes.length ?? 80;
  const vai = useCallback(
    (novo: number) => {
      if (novo < 1 || novo > ultima) return;
      audio?.pausa();
      setN(novo);
      history.replaceState(null, "", `#/estudo/${id}/${novo}`);
      topoRef.current?.scrollIntoView({ block: "start" });
    },
    [audio, id, ultima],
  );

  // atalhos de teclado
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") vai(n + 1);
      else if (e.key === "ArrowLeft") vai(n - 1);
      else if (e.key === "Enter" && bloco && !blocoCorrigido && faltamBloco === 0) corrigeBloco();
      else if (e.key === "Enter" && resposta) vai(n + 1);
      else if (e.key.toLowerCase() === "t") mudaConfig({ traducao: !cfg.traducao });
      else if (e.key.toLowerCase() === "p") mudaConfig({ pinyin: !cfg.pinyin });
      else if (e.key === " " && audio && q?.audio) {
        e.preventDefault();
        if (audio.tocando) audio.pausa();
        else audio.toca(q.audio.s, q.audio.e);
      } else if (!revelado && q) {
        const k = e.key.toUpperCase();
        const ehVF = q.tipo === "vf" || q.tipo === "imagem-vf";
        if (ehVF && (k === "V" || k === "C" || k === "1")) responde(true);
        else if (ehVF && (k === "F" || k === "X" || k === "E" || k === "2")) responde(false);
        else if (q.tipo === "imagem-abc" && /^[ABC]$/.test(k)) responde(k);
        else if (["imagem", "abc", "pareamento", "lacuna"].includes(q.tipo) && /^[A-F]$/.test(k)) {
          const grupo = q.grupo ? prova?.grupos[q.grupo] : undefined;
          const validas = q.opcoes ? Object.keys(q.opcoes) : grupo?.letras ?? Object.keys(grupo?.opcoes ?? {});
          const doExemplo = grupo?.exemploUsa ?? grupo?.exemplo?.resposta;
          if (validas.includes(k) && k !== doExemplo) responde(k);
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [n, revelado, resposta, bloco, blocoCorrigido, faltamBloco, corrigeBloco, cfg.traducao, cfg.pinyin, audio, q, responde, vai, prova]);

  const resumo = useMemo(() => {
    if (!prova || !tentativa) return null;
    const r = prova.questoes.filter((x) => tentativa.respostas[x.n] && visivel(x)).map((x) => tentativa.respostas[x.n]);
    return { feitas: Object.keys(tentativa.respostas).length, certas: r.filter((x) => x.certa || x.manual).length };
  }, [prova, tentativa, visivel]);
  const nota = useMemo(() => (prova && tentativa ? notaDoEstudo(tentativa, prova.nivel ?? 3) : null), [prova, tentativa]);

  if (erro) return <div className="erro">Não consegui abrir {id}: {erro}</div>;
  if (!prova || !tentativa || !q) return <div className="carregando">carregando {id}…</div>;

  const errou = revelado && !(resposta!.certa || resposta!.manual);
  const mostraCaixa = revelado && ((errou && !caixaFechada[n]) || caixaAberta[n]);
  const consultas = tentativa.consultas?.[n] ?? [];
  // exemplo (例如) do bloco: aberto na 1ª questão do bloco, recolhido nas outras
  const chaveExemplo = chaveBloco(q);
  const inicioDoBloco = prova.questoes.find((x) => chaveBloco(x) === chaveExemplo)?.n === q.n;

  return (
    <ProvedorLeitura lexico={lexico} traducao={cfg.traducao} pinyin={cfg.pinyin || (regras(prova.nivel).pinyinNaProva && cfg.pinyinHsk1 !== false)} audio={audio} consultou={consultou}>
      <div className="estudo" ref={topoRef}>
        <aside className="navegador">
          <div className="nav-titulo">
            <b>{prova.id}</b> · estudo
            {resumo && (
              <small>
                {resumo.feitas}/{prova.questoes.length} feitas · {resumo.certas} certas
              </small>
            )}
            {nota && !nota.vazia && (
              <div
                className="nota-estudo"
                title={
                  `Nota proporcional: cada seção vale 100 pelo seu aproveitamento nas questões que você já fez dela` +
                  (nota.completa ? "." : ` (seções ainda não começadas entram com a média das outras). Contando as não feitas como erro: ${nota.absoluta}/${nota.maximo}.`) +
                  ` Aprovação: ${nota.aprovacao}.`
                }
              >
                <b className={nota.proporcional >= nota.aprovacao ? "aprovado" : "reprovado"}>
                  {nota.completa ? "" : "≈"}
                  {nota.proporcional}/{nota.maximo}
                </b>{" "}
                <span>pontos{nota.completa ? "" : " no ritmo atual"}</span>
                <small>
                  {(["L", "R", "W"] as const)
                    .filter((s) => s in nota.porSecao)
                    .map((s) => `${NOMES_SECAO[s].split(" ")[0]} ${nota.porSecao[s] ?? "—"}`)
                    .join(" · ")}
                </small>
              </div>
            )}
          </div>
          {(["L", "R", "W"] as const).filter((s) => regras(prova.nivel).questoes[s] > 0).map((s) => (
            <div key={s} className="nav-secao">
              <div className="nav-secao-nome">{NOMES_SECAO[s]}</div>
              <div className="nav-grade">
                {prova.questoes
                  .filter((x) => x.secao === s)
                  .map((x) => {
                    const r = tentativa.respostas[x.n];
                    const st = !r ? "" : !visivel(x) ? "pendente" : r.certa || r.manual ? "certa" : "errada";
                    return (
                      <button key={x.n} className={`nav-n ${st} ${x.n === n ? "atual" : ""}`} onClick={() => vai(x.n)} title={nomeParte(prova.nivel, `${x.secao}${x.parte}`)}>
                        {x.n}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          <div className="nav-acoes">
            {prova.audio && (
              <button className="sec" onClick={() => setVerRoteiro(!verRoteiro)}>
                {verRoteiro ? "← voltar às questões" : "♪ áudio completo + texto"}
              </button>
            )}
            <button
              className="link"
              onClick={() => {
                const msg =
                  "Resetar o estudo deste simulado e começar do zero?\n\n" +
                  "As respostas atuais ficam arquivadas no histórico, e seus cartões de revisão e notas de provas continuam intactos.";
                if (!confirm(msg)) return;
                resetaSimulado(id, ["estudo"]);
                const nova = novaTentativa(id, "estudo");
                setTid(nova.id);
                vai(1);
              }}
            >
              ⟲ resetar este simulado (estudo)
            </button>
          </div>
        </aside>

        <section className="painel">
          <div className="barra-ferramentas">
            <div className="caminho">
              <span className="secao-nome">{NOMES_SECAO[q.secao]}</span>
              <span className="parte">
                parte {q.parte} · {nomeParte(prova.nivel, `${q.secao}${q.parte}`)}
              </span>
            </div>
            <div className="alternadores">
              <label className={`chave ${cfg.traducao ? "on" : ""}`} title="atalho: T">
                <input type="checkbox" checked={cfg.traducao} onChange={(e) => mudaConfig({ traducao: e.target.checked })} />
                Tradução <kbd>T</kbd>
              </label>
              <label className={`chave ${cfg.pinyin ? "on" : ""}`} title="atalho: P">
                <input type="checkbox" checked={cfg.pinyin} onChange={(e) => mudaConfig({ pinyin: e.target.checked })} />
                Pinyin <kbd>P</kbd>
              </label>
              {q.secao === "L" && (
                <label className={`chave ${cfg.transcricaoAntes ? "on" : ""}`} title="mostrar o texto do áudio antes de responder">
                  <input type="checkbox" checked={cfg.transcricaoAntes} onChange={(e) => mudaConfig({ transcricaoAntes: e.target.checked })} />
                  Texto antes
                </label>
              )}
            </div>
          </div>

          {verRoteiro && prova.roteiro ? (
            <RoteiroCompleto prova={prova} audio={audio} />
          ) : (
            <>
              <BlocoExemplo key={chaveExemplo} prova={prova} bloco={chaveExemplo} modo="estudo" audio={audio} recolhido={!inicioDoBloco} />
              <div className="cabecalho-questao">
                <span className="numero">{q.n}</span>
                <span className="instrucao">{instrucao(q, prova.nivel)}</span>
              </div>
              {bloco && (
                <div className={`barra-bloco ${blocoCorrigido ? "corrigido" : ""}`}>
                  <span className="bloco-nome">
                    bloco {nsBloco[0]}–{nsBloco[nsBloco.length - 1]}
                  </span>
                  <span className="bloco-itens">
                    {nsBloco.map((m) => {
                      const r = tentativa.respostas[m];
                      const st = !r ? "" : !blocoCorrigido ? "pendente" : r.certa || r.manual ? "certa" : "errada";
                      const marca = !r ? "" : r.valor === true ? "✓" : r.valor === false ? "✗" : String(r.valor);
                      return (
                        <button key={m} className={`nav-n ${st} ${m === n ? "atual" : ""}`} onClick={() => vai(m)}>
                          {m}
                          {marca && <small> {marca}</small>}
                        </button>
                      );
                    })}
                  </span>
                  {blocoCorrigido ? (
                    <span className="bloco-placar">
                      {nsBloco.filter((m) => tentativa.respostas[m]?.certa || tentativa.respostas[m]?.manual).length}/{nsBloco.length} certas
                    </span>
                  ) : (
                    <button className="pri" disabled={faltamBloco > 0} onClick={corrigeBloco} title="atalho: Enter (com o bloco todo respondido)">
                      {faltamBloco > 0 ? `faltam ${faltamBloco} para corrigir` : "corrigir bloco"}
                    </button>
                  )}
                </div>
              )}
              <VisaoQuestao
                key={q.n}
                prova={prova}
                q={q}
                valor={resposta?.valor ?? null}
                revelado={revelado}
                modo="estudo"
                audio={audio}
                onResponde={revelado ? undefined : responde}
                transcricaoAntes={cfg.transcricaoAntes}
                onMarcaCerta={marcaCerta}
                autoTocar={cfg.tocarSozinho && !revelado}
              />
              {mostraCaixa && (
                <CaixaRevisao
                  prova={prova}
                  q={q}
                  lexico={lexico}
                  consultas={consultas}
                  errou={errou}
                  aoFechar={() => {
                    setCaixaFechada((c) => ({ ...c, [n]: true }));
                    setCaixaAberta((c) => ({ ...c, [n]: false }));
                  }}
                />
              )}
              <div className="rodape-questao">
                <button className="sec" onClick={() => vai(n - 1)} disabled={n <= 1}>
                  ← anterior
                </button>
                {revelado && (
                  <>
                    <button className="link" onClick={refaz}>
                      {bloco ? "refazer bloco" : "refazer"}
                    </button>
                    {!mostraCaixa && (
                      <button className="link" onClick={() => setCaixaAberta((c) => ({ ...c, [n]: true }))}>
                        + revisão espaçada
                      </button>
                    )}
                  </>
                )}
                <button className={resposta ? "pri" : "sec"} onClick={() => vai(n + 1)} disabled={n >= ultima}>
                  próxima →
                </button>
              </div>
              <p className="atalhos">
                atalhos: <kbd>←</kbd>/<kbd>→</kbd> navegar · <kbd>A</kbd>–<kbd>F</kbd> responder · <kbd>V</kbd>/<kbd>F</kbd> certo/errado · <kbd>espaço</kbd> tocar · <kbd>Enter</kbd> próxima
              </p>
            </>
          )}
        </section>
      </div>
    </ProvedorLeitura>
  );
}
