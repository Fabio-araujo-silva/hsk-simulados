import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ControleAudio } from "../audio";
import { confere, textoResposta } from "../correcao";
import { urlMidia } from "../dados";
import type { Fala, Frase as TFrase, Grupo, Prova, Questao } from "../tipos";
import { AudioQuestao } from "./AudioQuestao";
import { Frase } from "./Leitura";
import { OuvirSintetico } from "./OuvirSintetico";
import { unidadesFala } from "../falaQuestao";
import { useRiscadas } from "../riscadas";

/** chave do rascunho (alternativas riscadas) da questão em exibição */
const ContextoRisco = createContext<string>("");

export type ModoVisao = "estudo" | "prova" | "revisao";

interface Props {
  prova: Prova;
  q: Questao;
  valor: string | boolean | null;
  /** mostra correção, explicação e transcrição */
  revelado: boolean;
  modo: ModoVisao;
  audio?: ControleAudio | null;
  onResponde?: (v: string | boolean) => void;
  /** modo estudo: mostrar transcrição antes de responder */
  transcricaoAntes?: boolean;
  /** marcar manualmente como correta (ordenar) */
  onMarcaCerta?: () => void;
  autoTocar?: boolean;
}

const INSTRUCOES_1: Record<string, string> = {
  L1: "Ouça e diga se a figura corresponde ao que foi dito (certo ou errado).",
  L2: "Ouça a frase e escolha a figura certa.",
  L3: "Ouça o diálogo e escolha a figura correspondente.",
  L4: "Ouça a frase e a pergunta; escolha a resposta.",
  R1: "A palavra combina com a figura? Certo ou errado.",
  R2: "Escolha a figura que combina com a frase.",
  R3: "Escolha a resposta que combina com a pergunta.",
  R4: "Escolha a palavra que completa a lacuna.",
};

const INSTRUCOES_2: Record<string, string> = {
  L1: "Ouça e diga se a figura corresponde ao que foi dito (certo ou errado).",
  L2: "Ouça o diálogo e escolha a figura correspondente.",
  L3: "Ouça o diálogo e a pergunta; escolha a resposta.",
  L4: "Ouça o diálogo e a pergunta; escolha a resposta.",
  R1: "Escolha a figura que combina com a frase.",
  R2: "Escolha a palavra que completa a lacuna.",
  R3: "Leia a frase e diga se a afirmação marcada com ★ está certa ou errada.",
  R4: "Escolha a frase que combina com esta (resposta / continuação).",
};

const INSTRUCOES: Record<string, string> = {
  L1: "Ouça o diálogo e escolha a figura correspondente.",
  L2: "Ouça e diga se a frase marcada com ★ está certa ou errada.",
  L3: "Ouça o diálogo e a pergunta; escolha a resposta.",
  L4: "Ouça o diálogo e a pergunta; escolha a resposta.",
  R1: "Escolha a frase que combina com esta (resposta / continuação).",
  R2: "Escolha a palavra que completa a lacuna.",
  R3: "Leia o texto e responda.",
  W1: "Monte a frase com as peças (escreva a frase completa).",
  W2: "Escreva o caractere que corresponde ao pinyin.",
};

export function instrucao(q: Questao, nivel: number = 3) {
  const tabela = nivel === 1 ? INSTRUCOES_1 : nivel === 2 ? INSTRUCOES_2 : INSTRUCOES;
  return tabela[`${q.secao}${q.parte}`] ?? "";
}

export function VisaoQuestao(p: Props) {
  const { prova, q, valor, revelado, modo } = p;
  const grupo = q.grupo ? prova.grupos[q.grupo] : undefined;
  const inerte = modo === "prova";
  const certa = revelado ? confere(q, valor) : null;

  const unidades = useMemo(() => (q.secao !== "L" && modo !== "prova" ? unidadesFala(q, grupo, revelado) : []), [q, grupo, revelado, modo]);
  return (
    <ContextoRisco.Provider value={`${prova.id}:${q.n}`}>
    <div className={`questao tipo-${q.tipo}`}>
      {unidades.length > 0 && <OuvirSintetico key={`${prova.id}:${q.n}:${revelado}`} unidades={unidades} />}
      {q.secao === "L" && modo !== "prova" && (
        <AudioQuestao audio={p.audio ?? null} trecho={q.audio} autoTocar={p.autoTocar} />
      )}

      {q.tipo === "imagem" && q.texto && (
        <p className="enunciado grande">
          <Frase f={q.texto} inerte={inerte} />
        </p>
      )}
      {q.tipo === "imagem" && grupo && <Imagens grupo={grupo} q={q} valor={valor} revelado={revelado} onResponde={p.onResponde} />}

      {q.tipo === "imagem-vf" && (
        <div className="figura-vf">
          {q.imagem && <img src={urlMidia(q.imagem)} alt="figura da questão" />}
          {q.palavra && (
            <p className="enunciado grande">
              <Frase f={q.palavra} inerte={inerte} />
            </p>
          )}
          <div className="opcoes opcoes-vf">
            {([true, false] as const).map((v) => (
              <BotaoOpcao key={String(v)} ativo={valor === v} certo={revelado && q.resposta === v} errado={revelado && valor === v && q.resposta !== v} onClick={() => p.onResponde?.(v)} desabilitado={revelado && modo !== "prova"}>
                <span className="letra">{v ? "✓" : "✗"}</span> {v ? "certo (对)" : "errado (错)"}
              </BotaoOpcao>
            ))}
          </div>
        </div>
      )}

      {q.tipo === "imagem-abc" && (
        <div className="imagens">
          {(["A", "B", "C"] as const).map((l) => {
            const cls = ["imagem", valor === l ? "ativa" : "", revelado && q.resposta === l ? "certa" : "", revelado && valor === l && q.resposta !== l ? "errada" : ""].join(" ");
            return (
              <BotaoFigura key={l} letra={l} className={cls} onClick={() => !(revelado && modo !== "prova") && p.onResponde?.(l)}>
                <span className="letra">{l}</span>
                {q.imagens?.[l] ? <img src={urlMidia(q.imagens[l])} alt={`figura ${l}`} loading="lazy" /> : <span>sem figura</span>}
              </BotaoFigura>
            );
          })}
        </div>
      )}

      {q.tipo === "vf" && (
        <>
          {/* HSK 2, leitura 46–50: uma frase impressa e, embaixo, a afirmação ★ sobre ela */}
          {q.secao === "R" && q.texto && (
            <p className="texto-leitura">
              <Frase f={q.texto} inerte={inerte} destaque={revelado ? q.trecho : undefined} />
            </p>
          )}
          <p className="enunciado">
            <span className="estrela">★</span> <Frase f={q.afirmacao} inerte={inerte} />
          </p>
          <div className="opcoes opcoes-vf">
            {([true, false] as const).map((v) => (
              <BotaoOpcao key={String(v)} ativo={valor === v} certo={revelado && q.resposta === v} errado={revelado && valor === v && q.resposta !== v} onClick={() => p.onResponde?.(v)} desabilitado={revelado && modo !== "prova"}>
                <span className="letra">{v ? "✓" : "✗"}</span> {v ? "certo (对)" : "errado (错)"}
              </BotaoOpcao>
            ))}
          </div>
        </>
      )}

      {q.tipo === "abc" && q.secao === "R" && (
        <>
          <p className="texto-leitura">
            <Frase f={q.texto} inerte={inerte} destaque={revelado ? q.trecho : undefined} />
          </p>
          <p className="enunciado">
            <span className="estrela">★</span> <Frase f={q.pergunta} inerte={inerte} />
          </p>
        </>
      )}

      {q.tipo === "abc" && q.opcoes && (
        <div className="opcoes">
          {Object.entries(q.opcoes).map(([l, f]) => (
            <BotaoOpcao key={l} letra={l} ativo={valor === l} certo={revelado && q.resposta === l} errado={revelado && valor === l && q.resposta !== l} onClick={() => p.onResponde?.(l)} desabilitado={revelado && modo !== "prova"}>
              <span className="letra">{l}</span> <Frase f={f} inerte={inerte} />
            </BotaoOpcao>
          ))}
        </div>
      )}

      {q.tipo === "pareamento" && grupo && (
        <>
          <p className="enunciado grande">
            <Frase f={q.texto ?? undefined} inerte={inerte} />
            {!q.texto && q.linhas?.map((l, i) => <Frase key={i} f={l} inerte={inerte} />)}
          </p>
          <div className="opcoes">
            {Object.entries(grupo.opcoes ?? {}).map(([l, f]) => {
              const doExemplo = grupo.exemplo?.resposta === l;
              return (
                <BotaoOpcao key={l} letra={l} ativo={valor === l} certo={revelado && q.resposta === l} errado={revelado && valor === l && q.resposta !== l} onClick={() => p.onResponde?.(l)} desabilitado={(revelado && modo !== "prova") || doExemplo} apagado={doExemplo}>
                  <span className="letra">{l}</span> <Frase f={f} inerte={inerte} />
                  {doExemplo && <span className="tag">exemplo</span>}
                </BotaoOpcao>
              );
            })}
          </div>
        </>
      )}

      {q.tipo === "lacuna" && grupo && (
        <>
          <div className="banco">
            {Object.entries(grupo.opcoes ?? {}).map(([l, f]) => {
              const doExemplo = grupo.exemplo?.resposta === l;
              return (
                <BotaoOpcao key={l} letra={l} compacto ativo={valor === l} certo={revelado && q.resposta === l} errado={revelado && valor === l && q.resposta !== l} onClick={() => p.onResponde?.(l)} desabilitado={(revelado && modo !== "prova") || doExemplo} apagado={doExemplo}>
                  <span className="letra">{l}</span> <Frase f={f} inerte={inerte} />
                </BotaoOpcao>
              );
            })}
          </div>
          <div className="linhas-lacuna">
            {q.linhas?.map((l, i) => (
              <p key={i} className="enunciado">
                <FraseComLacuna f={l} preenchida={revelado ? grupo.opcoes?.[String(q.resposta)]?.zh : valor ? grupo.opcoes?.[String(valor)]?.zh : undefined} certa={revelado} inerte={inerte} semSpoiler={!revelado} />
              </p>
            ))}
          </div>
        </>
      )}

      {q.tipo === "ordenar" && <Ordenar q={q} valor={valor} revelado={revelado} modo={modo} onResponde={p.onResponde} onMarcaCerta={p.onMarcaCerta} />}

      {q.tipo === "hanzi" && <Hanzi q={q} valor={valor} revelado={revelado} modo={modo} onResponde={p.onResponde} />}

      {/* transcrição: depois de responder (ou antes, se o usuário quiser) */}
      {q.secao === "L" && q.falas && modo !== "prova" && (revelado || p.transcricaoAntes) && (
        <Transcricao falas={q.falas} q={q} destaque={revelado ? q.trecho : undefined} semPergunta={!revelado} />
      )}

      {revelado && modo !== "prova" && <Feedback q={q} grupo={grupo} valor={valor} certa={!!certa} />}
    </div>
    </ContextoRisco.Provider>
  );
}

function BotaoOpcao(props: {
  letra?: string;
  ativo: boolean;
  certo?: boolean;
  errado?: boolean;
  desabilitado?: boolean;
  apagado?: boolean;
  compacto?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const chaveRisco = useContext(ContextoRisco);
  const [riscadas, alterna] = useRiscadas(chaveRisco);
  const riscada = !!props.letra && riscadas.has(props.letra);
  const cls = ["opcao", props.ativo ? "ativa" : "", props.certo ? "certa" : "", props.errado ? "errada" : "", props.apagado ? "apagada" : "", props.compacto ? "compacta" : "", riscada ? "riscada" : ""].join(" ");
  return (
    <div
      role="button"
      tabIndex={props.desabilitado ? -1 : 0}
      aria-disabled={props.desabilitado}
      className={cls}
      title={props.letra ? "botão direito: riscar / desriscar (rascunho)" : undefined}
      onContextMenu={(e) => {
        if (!props.letra || !chaveRisco) return;
        e.preventDefault();
        alterna(props.letra);
      }}
      onClick={(e) => {
        // clique numa palavra com tradução não deve responder sem querer se o usuário estiver selecionando texto
        if (props.desabilitado) return;
        if (window.getSelection()?.toString()) return;
        e.stopPropagation();
        props.onClick();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !props.desabilitado) {
          e.preventDefault();
          props.onClick();
        }
      }}
    >
      {props.children}
    </div>
  );
}

function Imagens({ grupo, q, valor, revelado, onResponde }: { grupo: Grupo; q: Questao; valor: string | boolean | null; revelado: boolean; onResponde?: (v: string) => void }) {
  const chaveRisco = useContext(ContextoRisco);
  const [riscadas, alterna] = useRiscadas(chaveRisco);
  const letras = grupo.letras ?? Object.keys(grupo.imagens ?? {});
  return (
    <div className="imagens">
      {letras.map((l) => {
        const src = grupo.imagens?.[l];
        const doExemplo = grupo.exemploUsa === l;
        const cls = ["imagem", valor === l ? "ativa" : "", revelado && q.resposta === l ? "certa" : "", revelado && valor === l && q.resposta !== l ? "errada" : "", doExemplo ? "apagada" : ""].join(" ");
        return (
          <button
            key={l}
            className={`${cls} ${riscadas.has(l) ? "riscada" : ""}`}
            disabled={doExemplo}
            onClick={() => !doExemplo && onResponde?.(l)}
            onContextMenu={(e) => {
              e.preventDefault();
              alterna(l);
            }}
            title="botão direito: riscar / desriscar (rascunho)"
          >
            <span className="letra">{l}</span>
            {src ? <img src={urlMidia(src)} alt={`figura ${l}`} loading="lazy" /> : <span>sem figura</span>}
            {doExemplo && <span className="tag">exemplo</span>}
          </button>
        );
      })}
    </div>
  );
}

function FraseComLacuna({ f, preenchida, certa, inerte, semSpoiler }: { f: TFrase; preenchida?: string; certa: boolean; inerte: boolean; semSpoiler: boolean }) {
  // a lacuna vem como token "（＿＿）"; trocamos visualmente pela palavra escolhida
  const idx = f.tk.findIndex((t) => t.includes("＿"));
  if (idx < 0) return <Frase f={f} inerte={inerte} semSpoiler={semSpoiler} />;
  const antes: TFrase = { ...f, tk: f.tk.slice(0, idx), py: f.py.slice(0, idx), a: undefined, a2: undefined };
  const depois: TFrase = { ...f, tk: f.tk.slice(idx + 1), py: f.py.slice(idx + 1), a: undefined, a2: undefined };
  return (
    <>
      <Frase f={antes} inerte={inerte} semSpoiler={semSpoiler} />
      <span className={`lacuna ${preenchida ? "preenchida" : ""} ${certa ? "correta" : ""}`}>{preenchida ?? "　　"}</span>
      <Frase f={depois} inerte={inerte} semSpoiler={semSpoiler} />
    </>
  );
}

function Ordenar({ q, valor, revelado, modo, onResponde, onMarcaCerta }: { q: Questao; valor: string | boolean | null; revelado: boolean; modo: ModoVisao; onResponde?: (v: string) => void; onMarcaCerta?: () => void }) {
  const [texto, setTexto] = useState(typeof valor === "string" ? valor : "");
  const [usadas, setUsadas] = useState<number[]>([]);
  useEffect(() => {
    setTexto(typeof valor === "string" ? valor : "");
    setUsadas([]);
  }, [q.n, valor]);
  const pecas = q.pecas ?? [];
  const bloqueado = revelado && modo !== "prova";
  const envia = (t: string) => {
    if (modo === "prova") onResponde?.(t);
  };
  return (
    <div className="ordenar">
      <div className="pecas">
        {pecas.map((pc, i) => (
          <button
            key={i}
            className={`peca ${usadas.includes(i) ? "usada" : ""}`}
            disabled={bloqueado || usadas.includes(i)}
            onClick={() => {
              const t = texto + pc.zh;
              setTexto(t);
              setUsadas([...usadas, i]);
              envia(t);
            }}
          >
            <Frase f={pc} inerte={modo === "prova"} />
          </button>
        ))}
      </div>
      <div className="linha-resposta">
        <input
          className="entrada zh"
          value={texto}
          disabled={bloqueado}
          placeholder="clique nas peças ou digite a frase…"
          onChange={(e) => {
            setTexto(e.target.value);
            envia(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && modo !== "prova" && texto.trim()) onResponde?.(texto);
          }}
        />
        {!bloqueado && (
          <button
            className="sec"
            onClick={() => {
              setTexto("");
              setUsadas([]);
              envia("");
            }}
          >
            limpar
          </button>
        )}
        {modo !== "prova" && !bloqueado && (
          <button className="pri" disabled={!texto.trim()} onClick={() => onResponde?.(texto)}>
            verificar
          </button>
        )}
      </div>
      {revelado && modo !== "prova" && !confere(q, valor) && onMarcaCerta && (
        <button className="link" onClick={onMarcaCerta}>
          minha ordem também está correta → contar como certa
        </button>
      )}
    </div>
  );
}

function Hanzi({ q, valor, revelado, modo, onResponde }: { q: Questao; valor: string | boolean | null; revelado: boolean; modo: ModoVisao; onResponde?: (v: string) => void }) {
  const [t, setT] = useState(typeof valor === "string" ? valor : "");
  useEffect(() => setT(typeof valor === "string" ? valor : ""), [q.n, valor]);
  const bloqueado = revelado && modo !== "prova";
  return (
    <div className="hanzi">
      <p className="enunciado grande">
        <span className="zh">{q.antes}</span>
        <span className="caixa-hanzi">
          <span className="py-sobre">{q.pinyin}</span>
          <input
            className={`entrada-hanzi zh ${revelado ? (confere(q, valor) ? "certa" : "errada") : ""}`}
            value={t}
            maxLength={3}
            disabled={bloqueado}
            onChange={(e) => {
              setT(e.target.value);
              if (modo === "prova") onResponde?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && modo !== "prova" && t.trim()) onResponde?.(t.trim());
            }}
          />
        </span>
        <span className="zh">{q.depois}</span>
      </p>
      {modo !== "prova" && !bloqueado && (
        <button className="pri" disabled={!t.trim()} onClick={() => onResponde?.(t.trim())}>
          verificar
        </button>
      )}
      {revelado && modo !== "prova" && q.frase && (
        <p className="frase-completa">
          <Frase f={q.frase} destaque={String(q.resposta)} />
        </p>
      )}
    </div>
  );
}

export function Transcricao({ falas, q, destaque, semPergunta }: { falas: Fala[]; q: Questao; destaque?: string; semPergunta?: boolean }) {
  const fim1 = q.audio?.e;
  const fim2 = q.audio?.e2;
  return (
    <div className="transcricao">
      <div className="rotulo-secao">transcrição do áudio <small>(clique numa palavra para ouvir dali)</small></div>
      {falas
        .filter((f) => !(semPergunta && f.fal === "问"))
        .map((f, i) => (
          <div key={i} className={`fala fal-${f.fal ?? "x"}`}>
            {f.fal && <span className="falante">{f.fal === "★" ? "★" : `${f.fal}：`}</span>}
            <Frase f={f.f} fim1={fim1} fim2={fim2} destaque={destaque} />
          </div>
        ))}
    </div>
  );
}

function Feedback({ q, grupo, valor, certa }: { q: Questao; grupo?: Grupo; valor: string | boolean | null; certa: boolean }) {
  const respostaTxt = useMemo(() => textoResposta(q, grupo), [q, grupo]);
  return (
    <div className={`feedback ${certa ? "ok" : "erro"}`}>
      <div className="feedback-titulo">
        {certa ? "✓ Você acertou" : valor === null || valor === "" ? "Sem resposta" : "✗ Você errou"}
        {!certa && <span className="feedback-certa"> — resposta oficial: <b className="zh">{respostaTxt}</b></span>}
      </div>
      {!certa && valor !== null && valor !== "" && (
        <div className="feedback-sua">
          sua resposta: <span className="zh">{textoResposta(q, grupo, valor)}</span>
        </div>
      )}
      {q.tipo === "ordenar" && q.aceitas && q.aceitas.length > 0 && (
        <div className="feedback-sua">
          também aceitas: <span className="zh">{q.aceitas.join(" / ")}</span>
        </div>
      )}
      {q.explicacao && <p className="explicacao">{q.explicacao}</p>}
    </div>
  );
}


function BotaoFigura({ letra, className, onClick, children }: { letra: string; className: string; onClick: () => void; children: React.ReactNode }) {
  const chaveRisco = useContext(ContextoRisco);
  const [riscadas, alterna] = useRiscadas(chaveRisco);
  return (
    <button
      className={`${className} ${riscadas.has(letra) ? "riscada" : ""}`}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        alterna(letra);
      }}
      title="botão direito: riscar / desriscar (rascunho)"
    >
      {children}
    </button>
  );
}
