import { useEffect, useState } from "react";
import type { ControleAudio } from "../audio";
import { carregaExemplos, urlMidia } from "../dados";
import type { Exemplo, Exemplos, Fala, Frase as TFrase, ItemExemplo, Prova, Questao } from "../tipos";
import { AudioQuestao } from "./AudioQuestao";
import { Frase, useLeitura } from "./Leitura";

// O exemplo (例如) do início de cada parte, já respondido como no caderno.
// Não é questão: não conta na nota nem aceita resposta.

/** Chave do bloco na folha (a mesma do Exame): o grupo das questões de casar, senão a parte. */
export const chaveBloco = (q: Questao) => (q.grupo && ["imagem", "pareamento", "lacuna"].includes(q.tipo) ? q.grupo : `${q.secao}${q.parte}`);

let memoria: Exemplos | null = null;

export function useExemplos() {
  const [ex, setEx] = useState<Exemplos | null>(memoria);
  useEffect(() => {
    if (memoria) return;
    carregaExemplos()
      .then((e) => {
        memoria = e;
        setEx(e);
      })
      .catch(() => setEx({}));
  }, []);
  return ex;
}

/** O exemplo de um bloco da prova (ou null se a parte não tem / não temos o exemplo). */
export function useExemploDoBloco(prova: Prova, bloco: string): Exemplo | null {
  const ex = useExemplos();
  return ex?.[String(prova.nivel ?? 3)]?.find((e) => e.bloco === bloco) ?? null;
}

/** Segmento do roteiro com o texto falado e o trecho do áudio do exemplo. */
function segmentoDoExemplo(prova: Prova, ex: Exemplo) {
  if (ex.roteiro === undefined) return null;
  return (prova.roteiro ?? []).filter((s) => s.tipo === "exemplo")[ex.roteiro] ?? null;
}

const marcaVF = (v: boolean) => (v ? "√" : "×");

export function BlocoExemplo({
  prova,
  bloco,
  modo,
  audio,
  recolhido,
}: {
  prova: Prova;
  bloco: string;
  modo: "prova" | "estudo";
  audio?: ControleAudio | null;
  /** estudo, no meio do bloco: começa fechado */
  recolhido?: boolean;
}) {
  const ex = useExemploDoBloco(prova, bloco);
  const [aberto, setAberto] = useState(!recolhido);
  useEffect(() => setAberto(!recolhido), [recolhido, bloco]);
  if (!ex) return null;
  const seg = segmentoDoExemplo(prova, ex);
  const trecho = seg && seg.s != null && seg.e != null ? { s: seg.s, e: seg.e } : null;
  const estudo = modo === "estudo";

  return (
    <div className={`exemplo-hsk ${estudo ? "modo-estudo" : ""}`} data-bloco={bloco}>
      <div className="exemplo-cab">
        {estudo ? (
          <button className="exemplo-titulo" onClick={() => setAberto(!aberto)} title={aberto ? "recolher" : "mostrar o exemplo"}>
            <span className="zh">例如</span> · exemplo <span className="exemplo-seta">{aberto ? "▾" : "▸"}</span>
          </button>
        ) : (
          <span className="exemplo-titulo">
            <span className="zh">例如</span> · exemplo
          </span>
        )}
        <span className="exemplo-nota">não conta na nota</span>
      </div>
      {aberto && (
        <>
          {estudo && trecho && audio && <AudioQuestao audio={audio} trecho={trecho} />}
          {ex.itens.map((it, i) => (
            <ItemDoExemplo key={i} it={it} prova={prova} bloco={bloco} falas={seg?.falas ?? []} fim={trecho?.e} estudo={estudo} />
          ))}
        </>
      )}
    </div>
  );
}

function Traducao({ f }: { f?: TFrase | null }) {
  const ctx = useLeitura();
  if (!ctx.traducao || !f?.pt) return null;
  return <div className="exemplo-pt">{f.pt}</div>;
}

function ItemDoExemplo({ it, prova, bloco, falas, fim, estudo }: { it: ItemExemplo; prova: Prova; bloco: string; falas: Fala[]; fim?: number; estudo: boolean }) {
  const inerte = !estudo;
  const img = it.figura ? prova.grupos[bloco]?.imagens?.[it.figura] : undefined;
  const minhas = (it.falas ?? []).map((i) => falas[i]).filter(Boolean);
  const vf = typeof it.resposta === "boolean" ? it.resposta : null;

  return (
    <div className="exemplo-item">
      {img && (
        <div className="exemplo-figura">
          <div className="imagem certa">
            <span className="letra">{it.figura}</span>
            <img src={urlMidia(img)} alt={`figura ${it.figura}`} />
          </div>
        </div>
      )}
      <div className="exemplo-corpo">
        {minhas.length > 0 && (
          <div className="exemplo-falas">
            {minhas.map((f, i) => (
              <div key={i} className={`fala fal-${f.fal ?? "x"}`}>
                {f.fal && <span className="falante">{f.fal === "★" ? "★" : `${f.fal}：`}</span>}
                <Frase f={f.f} fim1={fim} inerte={inerte} />
                {f.fal === "★" && vf !== null && <span className={`exemplo-vf ${vf ? "ok" : "erro"}`}>（{marcaVF(vf)}）</span>}
                <Traducao f={f.f} />
              </div>
            ))}
          </div>
        )}
        {it.texto && (
          <div className="exemplo-texto">
            <Frase f={it.texto} destaque={it.destaque} inerte={inerte} />
            <Traducao f={it.texto} />
          </div>
        )}
        {it.afirmacao && (
          <div className="exemplo-texto">
            <span className="falante">★</span>
            <Frase f={it.afirmacao} inerte={inerte} />
            {vf !== null && <span className={`exemplo-vf ${vf ? "ok" : "erro"}`}>（{marcaVF(vf)}）</span>}
            <Traducao f={it.afirmacao} />
          </div>
        )}
        {it.pergunta && (
          <div className="exemplo-texto">
            <Frase f={it.pergunta} inerte={inerte} />
            <Traducao f={it.pergunta} />
          </div>
        )}
        {it.opcoes && (
          <div className="exemplo-opcoes">
            {Object.entries(it.opcoes).map(([l, f]) => (
              <span key={l} className={`exemplo-opcao ${it.resposta === l ? "certa" : ""}`}>
                <span className="letra">{l}</span> <Frase f={f} inerte={inerte} />
                {it.resposta === l && <b className="exemplo-check"> √</b>}
              </span>
            ))}
          </div>
        )}
        {it.pecas && (
          <div className="exemplo-pecas">
            {it.pecas.map((p, i) => (
              <span key={i} className="exemplo-peca">
                <Frase f={p} inerte={inerte} />
              </span>
            ))}
          </div>
        )}
        {it.pecas && it.frase && (
          <div className="exemplo-texto">
            → <Frase f={it.frase} inerte={inerte} />
            <Traducao f={it.frase} />
          </div>
        )}
        {it.antes !== undefined && it.depois !== undefined && typeof it.resposta === "string" && (
          <div className="exemplo-texto zh">
            {it.antes}
            <span className="exemplo-hanzi">
              <ruby>
                {it.resposta}
                <rt>{it.pinyin}</rt>
              </ruby>
            </span>
            {it.depois}
            <Traducao f={it.frase} />
          </div>
        )}
        {/* resposta solta: figura de casar (letra) ou certo/errado sem ★ (figura do caderno) */}
        {!it.opcoes && !it.afirmacao && !minhas.some((f) => f.fal === "★") && it.resposta !== undefined && !it.pecas && it.antes === undefined && (
          <div className="exemplo-resposta">
            resposta: <b className={it.resposta === false ? "erro" : ""}>{typeof it.resposta === "boolean" ? marcaVF(it.resposta) : it.resposta}</b>
          </div>
        )}
        {/* na prova só aparece quando é a própria resposta (ex.: figuras do exemplo que não estão no app) */}
        {(estudo || it.resposta === undefined) && (
          <div className="exemplo-explica">
            {it.explica}
            {it.conferir && (
              <span className="tag" title="Texto do caderno padrão do HSK que não está nos dados extraídos — falta conferir no PDF">
                a conferir
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
