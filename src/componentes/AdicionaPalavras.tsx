import { useMemo, useState } from "react";
import { salvaCartoes, useEstado } from "../armazenamento";
import { cartaoPalavra, idPalavra } from "../cartoes";
import { ehPontuacao } from "./Leitura";
import type { Cartao, Frase, Lexico } from "../tipos";

/**
 * Durante a revisão: "＋ adicionar palavras desta frase" — cada palavra das frases do cartão vira, com um toque,
 * um cartão novo de palavra (com a frase de exemplo). Os cartões vão para a revisão do HSK.
 */
export function AdicionaPalavras({
  frases,
  origem,
  lexico,
  provaAudio,
  ignora,
}: {
  frases: (Frase | null | undefined)[];
  origem: Cartao["origem"];
  lexico: Lexico | null;
  /** prova do HSK cujo áudio tem essas frases (o cartão novo leva o trecho) */
  provaAudio?: string;
  /** palavra do próprio cartão (não aparece na lista) */
  ignora?: string;
}) {
  const cartoes = useEstado((e) => e.cartoes);
  const [aberto, setAberto] = useState(false);
  const [feitas, setFeitas] = useState<string[]>([]);

  // palavras únicas na ordem em que aparecem, cada uma com a 1ª frase onde está e o pinyin dela ali
  const palavras = useMemo(() => {
    const vistas = new Map<string, { w: string; frase: Frase; py: string }>();
    for (const f of frases) {
      if (!f) continue;
      f.tk.forEach((w, i) => {
        if (!w || vistas.has(w) || w === ignora || ehPontuacao(w) || !/[㐀-鿿]/.test(w)) return;
        vistas.set(w, { w, frase: f, py: f.py[i] || lexico?.[w]?.py || "" });
      });
    }
    return [...vistas.values()];
  }, [frases, ignora, lexico]);

  if (!palavras.length) return null;

  const adiciona = (w: string, frase: Frase) => {
    salvaCartoes([cartaoPalavra(w, origem, lexico, frase, provaAudio)]);
    setFeitas((f) => [...f, w]);
  };

  if (!aberto) {
    return (
      <button className="link adiciona-palavras-abre" onClick={() => setAberto(true)}>
        ＋ adicionar palavras desta frase aos cartões
        {feitas.length > 0 && ` (${feitas.length} adicionada${feitas.length > 1 ? "s" : ""})`}
      </button>
    );
  }

  return (
    <div className="adiciona-palavras">
      <div className="adiciona-palavras-topo">
        <span>Toque numa palavra para criar um cartão dela (entra como novo na revisão):</span>
        <button className="link" onClick={() => setAberto(false)} aria-label="fechar">
          fechar
        </button>
      </div>
      <div className="adiciona-palavras-lista">
        {palavras.map(({ w, frase, py }) => {
          const ja = !!cartoes[idPalavra(w)];
          const agora = feitas.includes(w);
          const pt = lexico?.[w]?.pt ?? lexico?.[w]?.en;
          return (
            <button
              key={w}
              className={`chip-palavra${ja ? " ja" : ""}`}
              disabled={ja}
              onClick={() => adiciona(w, frase)}
              title={ja ? (agora ? "adicionada agora" : "já é um cartão") : `adicionar ${w}${pt ? ` (${pt})` : ""}`}
            >
              <span className="zh">{w}</span>
              {py && <small className="chip-py">{py}</small>}
              {pt && <small className="chip-pt">{pt}</small>}
              <small className="chip-estado">{ja ? (agora ? "✓ adicionada" : "✓ já é cartão") : "＋"}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
