import { useMemo } from "react";
import { compara } from "../comparacao";

/** Diferença caractere a caractere entre a frase e o que o reconhecimento entendeu da sua voz. */
export function Comparacao({ alvo, dito, limiar }: { alvo: string; dito: string; limiar: number }) {
  const r = useMemo(() => compara(alvo, dito), [alvo, dito]);
  return (
    <div className="comparacao">
      <div className="comparacao-topo">
        <b className={`pct ${r.pct >= limiar ? "bom" : r.pct >= 50 ? "medio" : "ruim"}`}>{r.pct}%</b>
        <span>
          {r.acertos} de {r.total} caracteres reconhecidos
        </span>
      </div>
      <div className="diff zh" aria-label="comparação">
        {r.itens.map((x, i) =>
          x.tipo === "ok" ? (
            <span key={i} className="d-ok">
              {x.alvo}
            </span>
          ) : x.tipo === "falta" ? (
            <span key={i} className="d-falta" title="faltou (ou não deu para entender)">
              {x.alvo}
            </span>
          ) : x.tipo === "troca" ? (
            <span key={i} className="d-troca" title={`entendi「${x.ouvido}」no lugar de「${x.alvo}」`}>
              {x.alvo}
              <sub>{x.ouvido}</sub>
            </span>
          ) : (
            <span key={i} className="d-sobra" title="a mais">
              {x.ouvido}
            </span>
          ),
        )}
      </div>
      <div className="legenda">
        <span className="d-ok">certo</span> <span className="d-falta">faltou</span> <span className="d-troca">trocado</span>{" "}
        <span className="d-sobra">a mais</span>
      </div>
    </div>
  );
}
