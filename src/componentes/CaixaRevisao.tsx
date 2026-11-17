import { useMemo, useState } from "react";
import { salvaCartoes, useEstado } from "../armazenamento";
import { sugereCartoes } from "../cartoes";
import type { Lexico, Prova, Questao } from "../tipos";

/** "Quer adicionar à revisão espaçada?" com os cartões sugeridos para a questão. */
export function CaixaRevisao({ prova, q, lexico, consultas, errou, aoFechar }: { prova: Prova; q: Questao; lexico: Lexico | null; consultas: string[]; errou: boolean; aoFechar?: () => void }) {
  const cartoes = useEstado((e) => e.cartoes);
  const sugestoes = useMemo(() => sugereCartoes(prova, q, lexico, consultas), [prova, q, lexico, consultas, cartoes]);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [feito, setFeito] = useState<number | null>(null);

  const novas = sugestoes.filter((s) => !s.existe);
  const estaMarcado = (id: string, padrao: boolean) => marcados[id] ?? padrao;

  if (feito !== null) {
    return (
      <div className="caixa-revisao feita">
        ✓ {feito} cartão(ões) adicionados à revisão espaçada.
      </div>
    );
  }
  if (!novas.length) {
    return <div className="caixa-revisao feita">Esta questão já está na sua revisão espaçada.</div>;
  }

  const adiciona = (todos?: boolean) => {
    const escolhidos = novas.filter((s) => todos || estaMarcado(s.cartao.id, s.marcado)).map((s) => s.cartao);
    salvaCartoes(escolhidos);
    setFeito(escolhidos.length);
  };

  return (
    <div className="caixa-revisao">
      <div className="caixa-titulo">{errou ? "Errou — quer adicionar à revisão espaçada?" : "Adicionar à revisão espaçada"}</div>
      <ul>
        {sugestoes.map((s) => (
          <li key={s.cartao.id} className={s.existe ? "existe" : ""}>
            <label>
              <input type="checkbox" disabled={s.existe} checked={s.existe || estaMarcado(s.cartao.id, s.marcado)} onChange={(e) => setMarcados({ ...marcados, [s.cartao.id]: e.target.checked })} />
              <span className={`tipo-cartao t-${s.cartao.tipo}`}>{s.cartao.tipo === "questao" ? "questão" : s.cartao.tipo}</span>
              <span className={s.cartao.tipo === "questao" ? "" : "zh"}>{s.rotulo}</span>
              <small>{s.existe ? "já está na revisão" : s.detalhe}</small>
            </label>
          </li>
        ))}
      </ul>
      <div className="caixa-botoes">
        <button className="pri" onClick={() => adiciona()}>
          Adicionar selecionados
        </button>
        {aoFechar && (
          <button className="sec" onClick={aoFechar}>
            Agora não
          </button>
        )}
      </div>
    </div>
  );
}
