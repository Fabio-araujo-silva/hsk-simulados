import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControleAudio } from "../audio";
import { leEstado, mudaConfig, mudaTentativa, novaTentativa, resetaSimulado, useConfig, useEstado } from "../armazenamento";
import { confere } from "../correcao";
import { carregaLexico, carregaProva, NOMES_PARTE, NOMES_SECAO, urlPublica } from "../dados";
import { CaixaRevisao } from "../componentes/CaixaRevisao";
import { ProvedorLeitura } from "../componentes/Leitura";
import { instrucao, VisaoQuestao } from "../componentes/Questao";
import { RoteiroCompleto } from "../componentes/RoteiroCompleto";
import type { Lexico, Prova, Tentativa } from "../tipos";

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
    const a = new ControleAudio(urlPublica(prova.audio.src));
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
    for (let i = 1; i <= 80; i++) if (!t?.respostas[i]) return i;
    return 1;
  });
  const [verRoteiro, setVerRoteiro] = useState(false);
  const [caixaFechada, setCaixaFechada] = useState<Record<number, boolean>>({});
  const [caixaAberta, setCaixaAberta] = useState<Record<number, boolean>>({});
  const topoRef = useRef<HTMLDivElement>(null);

  const q = prova?.questoes.find((x) => x.n === n);
  const resposta = tentativa?.respostas[n];
  const revelado = !!resposta;

  const responde = useCallback(
    (v: string | boolean) => {
      if (!q) return;
      const certa = confere(q, v);
      mudaTentativa(tid, (t) => ({ ...t, respostas: { ...t.respostas, [q.n]: { valor: v, certa, em: Date.now() } } }));
    },
    [q, tid],
  );

  const marcaCerta = useCallback(() => {
    if (!q) return;
    mudaTentativa(tid, (t) => ({ ...t, respostas: { ...t.respostas, [q.n]: { ...t.respostas[q.n], manual: true } } }));
  }, [q, tid]);

  const refaz = () => {
    if (!q) return;
    mudaTentativa(tid, (t) => {
      const { [q.n]: _, ...resto } = t.respostas;
      return { ...t, respostas: resto };
    });
    setCaixaFechada((c) => ({ ...c, [q.n]: false }));
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

  const vai = useCallback(
    (novo: number) => {
      if (novo < 1 || novo > 80) return;
      audio?.pausa();
      setN(novo);
      history.replaceState(null, "", `#/estudo/${id}/${novo}`);
      topoRef.current?.scrollIntoView({ block: "start" });
    },
    [audio, id],
  );

  // atalhos de teclado
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") vai(n + 1);
      else if (e.key === "ArrowLeft") vai(n - 1);
      else if (e.key === "Enter" && revelado) vai(n + 1);
      else if (e.key.toLowerCase() === "t") mudaConfig({ traducao: !cfg.traducao });
      else if (e.key.toLowerCase() === "p") mudaConfig({ pinyin: !cfg.pinyin });
      else if (e.key === " " && audio && q?.audio) {
        e.preventDefault();
        if (audio.tocando) audio.pausa();
        else audio.toca(q.audio.s, q.audio.e);
      } else if (!revelado && q) {
        const k = e.key.toUpperCase();
        if (q.tipo === "vf" && (k === "V" || k === "C" || k === "1")) responde(true);
        else if (q.tipo === "vf" && (k === "F" || k === "X" || k === "E" || k === "2")) responde(false);
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
  }, [n, revelado, cfg.traducao, cfg.pinyin, audio, q, responde, vai, prova]);

  const resumo = useMemo(() => {
    if (!prova || !tentativa) return null;
    const r = Object.values(tentativa.respostas);
    return { feitas: r.length, certas: r.filter((x) => x.certa || x.manual).length };
  }, [prova, tentativa]);

  if (erro) return <div className="erro">Não consegui abrir {id}: {erro}</div>;
  if (!prova || !tentativa || !q) return <div className="carregando">carregando {id}…</div>;

  const errou = revelado && !(resposta!.certa || resposta!.manual);
  const mostraCaixa = revelado && ((errou && !caixaFechada[n]) || caixaAberta[n]);
  const consultas = tentativa.consultas?.[n] ?? [];

  return (
    <ProvedorLeitura lexico={lexico} traducao={cfg.traducao} pinyin={cfg.pinyin} audio={audio} consultou={consultou}>
      <div className="estudo" ref={topoRef}>
        <aside className="navegador">
          <div className="nav-titulo">
            <b>{prova.id}</b> · estudo
            {resumo && (
              <small>
                {resumo.feitas}/80 feitas · {resumo.certas} certas
              </small>
            )}
          </div>
          {(["L", "R", "W"] as const).map((s) => (
            <div key={s} className="nav-secao">
              <div className="nav-secao-nome">{NOMES_SECAO[s]}</div>
              <div className="nav-grade">
                {prova.questoes
                  .filter((x) => x.secao === s)
                  .map((x) => {
                    const r = tentativa.respostas[x.n];
                    const st = !r ? "" : r.certa || r.manual ? "certa" : "errada";
                    return (
                      <button key={x.n} className={`nav-n ${st} ${x.n === n ? "atual" : ""}`} onClick={() => vai(x.n)} title={NOMES_PARTE[`${x.secao}${x.parte}`]}>
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
                parte {q.parte} · {NOMES_PARTE[`${q.secao}${q.parte}`]}
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
              <div className="cabecalho-questao">
                <span className="numero">{q.n}</span>
                <span className="instrucao">{instrucao(q)}</span>
              </div>
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
                      refazer
                    </button>
                    {!mostraCaixa && (
                      <button className="link" onClick={() => setCaixaAberta((c) => ({ ...c, [n]: true }))}>
                        + revisão espaçada
                      </button>
                    )}
                  </>
                )}
                <button className={revelado ? "pri" : "sec"} onClick={() => vai(n + 1)} disabled={n >= 80}>
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
