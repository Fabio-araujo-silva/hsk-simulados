import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arquivaTentativa, leEstado, mudaTentativa, novaTentativa, useConfig, useEstado } from "../armazenamento";
import { useTempo } from "../audio";
import { confere } from "../correcao";
import { formataTempo, nomeParte, NOMES_SECAO, regras, urlPublica } from "../dados";
import { ProvedorLeitura, Frase } from "../componentes/Leitura";
import { VisaoQuestao } from "../componentes/Questao";
import type { Prova, Questao, Tentativa } from "../tipos";
import { useAudioDaProva, useProvaELexico } from "./Estudo";
import { vaiPara } from "../App";
import { useRiscadas } from "../riscadas";

type Etapa = NonNullable<Tentativa["etapa"]>;
const ORDEM: Etapa[] = ["L", "Lfolha", "R", "W", "fim"];
const tempoEtapa = (prova: Prova, etapa: string): number => {
  const t = regras(prova.nivel).tempos;
  return etapa === "Lfolha" ? t.folha : etapa === "R" ? t.R : etapa === "W" ? t.W : 0;
};

function emAndamento(id: string) {
  return Object.values(leEstado().tentativas)
    .filter((t) => t.prova === id && t.modo === "prova" && !t.fim && !t.arquivada)
    .sort((a, b) => b.inicio - a.inicio)[0];
}

export function PaginaExame({ id }: { id: string }) {
  const { prova, erro } = useProvaELexico(id);
  const [tid, setTid] = useState<string | null>(null);
  const pendente = useMemo(() => emAndamento(id), [id]);

  if (erro) return <div className="erro">Não consegui abrir {id}: {erro}</div>;
  if (!prova) return <div className="carregando">carregando {id}…</div>;
  const rg = regras(prova.nivel);
  if (!tid) {
    return (
      <div className="exame-inicio">
        <h1>{prova.id} · modo prova</h1>
        <ul className="regras">
          <li>
            <b>听力 Listening</b> — {rg.questoes.L} questões, ~{prova.audio ? Math.round(prova.audio.duracao / 60) : 35} min de áudio contínuo (cada item é lido duas vezes),
            sem pausa; depois, {Math.round(rg.tempos.folha / 60)} min para revisar as respostas.
          </li>
          <li>
            <b>阅读 Leitura</b> — {rg.questoes.R} questões em {Math.round(rg.tempos.R / 60)} min.
          </li>
          {rg.questoes.W > 0 && (
            <li>
              <b>书写 Escrita</b> — {rg.questoes.W} questões em {Math.round(rg.tempos.W / 60)} min (digite os caracteres com o teclado chinês/pinyin do sistema).
            </li>
          )}
          <li>
            Sem tradução{rg.pinyinNaProva ? " (o pinyin aparece, como no caderno real)" : " e sem pinyin"}. A correção e a nota (de {rg.maximo}, aprovação com{" "}
            {rg.aprovacao}) aparecem no final.
          </li>
          <li>Use fones e um lugar silencioso — como no dia.</li>
        </ul>
        {!prova.audio && <div className="aviso">Esta prova ainda não tem áudio: o listening será pulado e a nota considera só leitura e escrita.</div>}
        <div className="acoes">
          {pendente ? (
            <>
              <button className="pri" onClick={() => setTid(pendente.id)}>
                Continuar a prova em andamento ({etapaNome(pendente.etapa)})
              </button>
              <button
                className="sec"
                onClick={() => {
                  if (!confirm("Começar outra prova do zero? A que está em andamento fica arquivada (não conta na nota, mas não é apagada).")) return;
                  arquivaTentativa(pendente.id);
                  const t = novaTentativa(id, "prova");
                  if (!prova.audio) mudaTentativa(t.id, (x) => ({ ...x, etapa: "R", semListening: true, restante: tempoEtapa(prova, "R") }));
                  setTid(t.id);
                }}
              >
                Começar do zero
              </button>
            </>
          ) : (
            <button
              className="pri grande"
              onClick={() => {
                const t = novaTentativa(id, "prova");
                if (!prova.audio) mudaTentativa(t.id, (x) => ({ ...x, etapa: "R", semListening: true, restante: tempoEtapa(prova, "R") }));
                setTid(t.id);
              }}
            >
              Começar a prova
            </button>
          )}
          <a className="botao link" href="#/">
            voltar
          </a>
        </div>
      </div>
    );
  }
  return <Exame prova={prova} tid={tid} />;
}

function etapaNome(e?: Etapa) {
  return e === "L" ? "listening" : e === "Lfolha" ? "revisão do listening" : e === "R" ? "leitura" : e === "W" ? "escrita" : "fim";
}

function Exame({ prova, tid }: { prova: Prova; tid: string }) {
  const t = useEstado((e) => e.tentativas[tid]);
  const cfg = useConfig();
  const audio = useAudioDaProva(prova);
  const { tempo, tocando } = useTempo(audio);
  const [iniciado, setIniciado] = useState(false);
  const etapa = t?.etapa ?? "L";

  const avanca = useCallback(() => {
    mudaTentativa(tid, (x) => {
      const i = ORDEM.indexOf(x.etapa ?? "L");
      let prox = ORDEM[Math.min(i + 1, ORDEM.length - 1)];
      if (prox === "W" && !regras(prova.nivel).questoes.W) prox = "fim"; // HSK 1/2 não têm escrita
      return { ...x, etapa: prox, etapaInicio: Date.now(), restante: tempoEtapa(prova, prox), ...(prox === "fim" ? { fim: Date.now() } : {}) };
    });
  }, [tid, prova]);

  // fim → resultado
  useEffect(() => {
    if (etapa === "fim") {
      audio?.pausa();
      vaiPara(`/resultado/${tid}`);
    }
  }, [etapa, tid, audio]);

  // listening: tocar a partir da posição salva
  useEffect(() => {
    if (!audio || etapa !== "L" || !iniciado) return;
    audio.velocidade(1);
    audio.toca(t?.audioPos ?? 0, null);
    const fimAudio = () => avanca();
    audio.el.addEventListener("ended", fimAudio);
    return () => {
      audio.el.removeEventListener("ended", fimAudio);
      audio.pausa();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, etapa, iniciado]);

  // salva a posição do áudio a cada ~2 s
  const ultimoSalvo = useRef(0);
  useEffect(() => {
    if (etapa === "L" && tocando && Math.abs(tempo - ultimoSalvo.current) > 2) {
      ultimoSalvo.current = tempo;
      mudaTentativa(tid, (x) => ({ ...x, audioPos: tempo }));
    }
  }, [tempo, tocando, etapa, tid]);

  // cronômetro das etapas com tempo fixo (só corre com a aba aberta)
  useEffect(() => {
    if (etapa === "L" || etapa === "fim" || !iniciado) return;
    const id = window.setInterval(() => {
      mudaTentativa(tid, (x) => ({ ...x, restante: Math.max(0, (x.restante ?? tempoEtapa(prova, etapa)) - 1) }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [etapa, tid, iniciado, prova]);

  useEffect(() => {
    if (etapa !== "L" && etapa !== "fim" && t?.restante === 0) avanca();
  }, [t?.restante, etapa, avanca]);

  const responde = useCallback(
    (q: Questao, v: string | boolean) => {
      mudaTentativa(tid, (x) => ({ ...x, respostas: { ...x.respostas, [q.n]: { valor: v, certa: confere(q, v), em: Date.now() } } }));
    },
    [tid],
  );

  // questão tocando agora (listening)
  const tocandoN = useMemo(() => {
    if (etapa !== "L") return null;
    let n: number | null = null;
    for (const q of prova.questoes) if (q.audio && q.audio.s <= tempo + 0.1) n = q.n;
    return n;
  }, [tempo, etapa, prova]);

  if (!t) return null;

  if (!iniciado) {
    return (
      <div className="exame-inicio">
        <h1>{prova.id}</h1>
        <p>
          Etapa: <b>{etapaNome(etapa)}</b>
          {etapa === "L" && t.audioPos ? ` (áudio em ${formataTempo(t.audioPos)})` : ""}
          {etapa !== "L" && t.restante !== undefined ? ` · ${formataTempo(t.restante)} restantes` : ""}
        </p>
        <button className="pri grande" onClick={() => setIniciado(true)}>
          {t.audioPos || etapa !== "L" ? "Continuar" : "Iniciar — o áudio começa agora"}
        </button>
      </div>
    );
  }

  const secao = etapa === "L" || etapa === "Lfolha" ? "L" : etapa === "R" ? "R" : "W";
  const questoes = prova.questoes.filter((q) => q.secao === secao);
  const respondidas = questoes.filter((q) => {
    const v = t.respostas[q.n]?.valor;
    return v !== undefined && v !== null && v !== "";
  }).length;
  const restante = etapa === "L" ? Math.max(0, (audio?.duracao || prova.audio?.duracao || 0) - tempo) : t.restante ?? 0;

  return (
    <ProvedorLeitura lexico={null} traducao={false} pinyin={false} pinyinFixo={regras(prova.nivel).pinyinNaProva} audio={null}>
      <div className="exame">
        <header className="exame-topo">
          <b>{prova.id}</b>
          <span className="secao-nome">{NOMES_SECAO[secao]}</span>
          {etapa === "Lfolha" && <span className="tag">5 min para conferir o listening</span>}
          <span className={`relogio ${restante < 60 && etapa !== "L" ? "urgente" : ""}`}>{formataTempo(restante)}</span>
          <span className="contagem">
            {respondidas}/{questoes.length} respondidas
          </span>
          {etapa === "L" && cfg.pausarProva && (
            <button className="sec" onClick={() => (tocando ? audio?.pausa() : audio?.continua())}>
              {tocando ? "pausar" : "continuar"}
            </button>
          )}
          {etapa === "L" && tocandoN && <span className="tocando">♪ tocando: questão {tocandoN}</span>}
          <button
            className="sec"
            onClick={() => {
              const ultimaEtapa = etapa === "W" || (etapa === "R" && !regras(prova.nivel).questoes.W);
              const msg = etapa === "L" ? "Pular o resto do áudio e ir para a revisão do listening?" : ultimaEtapa ? "Entregar a prova?" : "Encerrar esta seção e seguir?";
              if (confirm(msg)) {
                if (etapa === "L") audio?.pausa();
                avanca();
              }
            }}
          >
            {etapa === "W" || (etapa === "R" && !regras(prova.nivel).questoes.W) ? "entregar prova" : "encerrar seção →"}
          </button>
        </header>
        <FolhaProva prova={prova} questoes={questoes} t={t} responde={responde} tocandoN={tocandoN} />
      </div>
    </ProvedorLeitura>
  );
}

/** A seção como no caderno: grupos (figuras, banco de palavras) aparecem uma vez só. */
function FolhaProva({ prova, questoes, t, responde, tocandoN }: { prova: Prova; questoes: Questao[]; t: Tentativa; responde: (q: Questao, v: string | boolean) => void; tocandoN: number | null }) {
  const refs = useRef<Record<number, HTMLDivElement | null>>({});
  useEffect(() => {
    if (tocandoN) refs.current[tocandoN]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [tocandoN]);

  const blocos: { chave: string; parte: string; grupo?: string; qs: Questao[] }[] = [];
  for (const q of questoes) {
    const chave = q.grupo && ["imagem", "pareamento", "lacuna"].includes(q.tipo) ? q.grupo : `${q.secao}${q.parte}`;
    const ult = blocos[blocos.length - 1];
    if (ult && ult.chave === chave) ult.qs.push(q);
    else blocos.push({ chave, parte: `${q.secao}${q.parte}`, grupo: q.grupo, qs: [q] });
  }

  return (
    <div className="folha">
      {blocos.map((b) => {
        const grupo = b.grupo ? prova.grupos[b.grupo] : undefined;
        const agrupado = grupo && ["imagem", "pareamento", "lacuna"].includes(b.qs[0].tipo);
        return (
          <section key={b.chave} className="bloco">
            <h3>
              {nomeParte(prova.nivel, b.parte)} <small>({b.qs[0].n}–{b.qs[b.qs.length - 1].n})</small>
            </h3>
            {agrupado && grupo && <CabecalhoGrupo grupo={grupo} tipo={b.qs[0].tipo} chave={`${prova.id}:${b.grupo}`} />}
            {b.qs.map((q) => (
              <div key={q.n} ref={(el) => (refs.current[q.n] = el)} className={`item-folha ${tocandoN === q.n ? "tocando" : ""}`}>
                <span className="numero">{q.n}</span>
                {agrupado && grupo ? (
                  <LinhaGrupo q={q} grupo={grupo} chave={`${prova.id}:${q.n}`} valor={t.respostas[q.n]?.valor ?? null} onResponde={(v) => responde(q, v)} />
                ) : (
                  <VisaoQuestao prova={prova} q={q} valor={t.respostas[q.n]?.valor ?? null} revelado={false} modo="prova" onResponde={(v) => responde(q, v)} />
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function CabecalhoGrupo({ grupo, tipo, chave }: { grupo: NonNullable<Prova["grupos"][string]>; tipo: string; chave: string }) {
  const [riscadas, alterna] = useRiscadas(chave);
  const risca = (l: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    alterna(l);
  };
  if (tipo === "imagem") {
    return (
      <div className="imagens pequenas">
        {(grupo.letras ?? []).map((l) => (
          <div key={l} className={`imagem ${grupo.exemploUsa === l ? "apagada" : ""} ${riscadas.has(l) ? "riscada" : ""}`} onContextMenu={risca(l)} title="botão direito: riscar (rascunho)">
            <span className="letra">{l}</span>
            {grupo.imagens?.[l] && <img src={urlPublica(grupo.imagens[l])} alt={l} />}
            {grupo.exemploUsa === l && <span className="tag">exemplo</span>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={tipo === "lacuna" ? "banco" : "lista-opcoes"}>
      {Object.entries(grupo.opcoes ?? {}).map(([l, f]) => (
        <div key={l} className={`opcao estatica ${grupo.exemplo?.resposta === l ? "apagada" : ""} ${riscadas.has(l) ? "riscada" : ""}`} onContextMenu={risca(l)} title="botão direito: riscar (rascunho)">
          <span className="letra">{l}</span> <Frase f={f} inerte />
        </div>
      ))}
      {grupo.exemplo && (
        <div className="exemplo-grupo">
          exemplo: <Frase f={grupo.exemplo.texto} inerte /> → {grupo.exemplo.resposta}
        </div>
      )}
    </div>
  );
}

function LinhaGrupo({ q, grupo, chave, valor, onResponde }: { q: Questao; grupo: NonNullable<Prova["grupos"][string]>; chave: string; valor: string | boolean | null; onResponde: (v: string) => void }) {
  const [riscadas, alterna] = useRiscadas(chave);
  const letras = q.tipo === "imagem" ? grupo.letras ?? [] : Object.keys(grupo.opcoes ?? {});
  const doExemplo = q.tipo === "imagem" ? grupo.exemploUsa : grupo.exemplo?.resposta;
  return (
    <div className="linha-grupo">
      {(q.tipo !== "imagem" || q.texto) && (
        <div className="linha-texto">
          {q.texto && <Frase f={q.texto} inerte />}
          {q.linhas?.map((l, i) => (
            <div key={i}>
              <Frase f={l} inerte />
            </div>
          ))}
        </div>
      )}
      <div className="bolhas">
        {letras.map((l) => (
          <button
            key={l}
            className={`bolha ${valor === l ? "ativa" : ""} ${riscadas.has(l) ? "riscada" : ""}`}
            disabled={l === doExemplo}
            onClick={() => onResponde(l)}
            onContextMenu={(e) => {
              e.preventDefault();
              alterna(l);
            }}
            title="botão direito: riscar (rascunho)"
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
