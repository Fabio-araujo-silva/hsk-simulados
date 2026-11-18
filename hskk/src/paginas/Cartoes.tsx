import { useMemo, useState } from "react";
import { apagaCartao, useEstado } from "../armazenamento";
import { intervalo } from "../srs";

const ESTADOS = ["novo", "aprendendo", "revisão", "reaprendendo"];

export function PaginaCartoes() {
  const cartoes = useEstado((e) => e.cartoes);
  const [busca, setBusca] = useState("");
  const lista = useMemo(
    () =>
      Object.values(cartoes)
        .filter((c) => !busca || `${c.frase.zh} ${c.frase.pt ?? ""} ${c.origem.prova}`.includes(busca))
        .sort((a, b) => a.srs.due - b.srs.due),
    [cartoes, busca],
  );

  const contagem = useMemo(() => {
    const c = { vencidos: 0, novos: 0 };
    const agora = Date.now();
    for (const x of Object.values(cartoes)) {
      if (x.srs.state === 0) c.novos++;
      else if (x.srs.due <= agora) c.vencidos++;
    }
    return c;
  }, [cartoes]);

  return (
    <div className="pagina-cartoes">
      <h1>Frases na revisão espaçada</h1>
      <p>
        {Object.keys(cartoes).length} frases do 第一部分 · {contagem.novos} novas · {contagem.vencidos} vencidas. Elas entram aqui quando você fica abaixo do
        limiar de acerto (⚙) ou quando você manda na mão.
      </p>
      <div className="filtros">
        <input className="entrada" placeholder="buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <table className="tabela">
        <thead>
          <tr>
            <th>frase</th>
            <th>origem</th>
            <th>acerto</th>
            <th>estado</th>
            <th>próxima</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.id}>
              <td>
                <span className="zh">{c.frase.zh}</span>
                {c.frase.pt && <small className="sub-pt">{c.frase.pt}</small>}
              </td>
              <td>
                <a href={`#/estudo/${c.origem.prova}/${c.origem.n}`}>
                  {c.origem.prova} nº {c.origem.n}
                </a>
              </td>
              <td>{c.pct !== undefined ? `${c.pct}%` : "—"}</td>
              <td>{ESTADOS[c.srs.state] ?? c.srs.state}</td>
              <td>{c.srs.state === 0 ? "—" : c.srs.due <= Date.now() ? "agora" : `em ${intervalo(c.srs.due - Date.now())}`}</td>
              <td>
                <button
                  className="link"
                  onClick={() => {
                    if (confirm("Tirar esta frase da revisão?")) apagaCartao(c.id);
                  }}
                >
                  tirar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
