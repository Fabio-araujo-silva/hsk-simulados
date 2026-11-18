import { useMemo, useState } from "react";
import { apagaCartao, useEstado } from "../armazenamento";
import { intervalo } from "../srs";
import type { Cartao } from "../tipos";
import { AbasRevisao, type Aba } from "../componentes/AbasRevisao";
import { useEstado as useEstadoHskk } from "../hskk/armazenamento";
import { CartoesOrais } from "../hskk/paginas/Cartoes";

const ESTADOS = ["novo", "aprendendo", "revisão", "reaprendendo"];

/** Cartões do HSK e, quando houver, as frases orais do HSKK (escolha no topo). Sem `aba`, abre na que tem cartões. */
export function PaginaCartoes({ aba: pedida }: { aba?: Aba }) {
  const nHsk = useEstado((e) => Object.keys(e.cartoes).length);
  const nOral = useEstadoHskk((e) => Object.keys(e.cartoes).length);
  const [aba, setAba] = useState<Aba>(() => pedida ?? (nHsk === 0 && nOral > 0 ? "hskk" : "hsk"));
  return (
    <div className="pagina-cartoes">
      <h1>Cartões de revisão</h1>
      {(nOral > 0 || aba === "hskk") && <AbasRevisao aba={aba} muda={setAba} hsk={nHsk} hskk={nOral} titulo="cartões" />}
      {aba === "hskk" ? (
        <div className="hskk">
          <CartoesOrais />
        </div>
      ) : (
        <CartoesHsk />
      )}
    </div>
  );
}

function CartoesHsk() {
  const cartoes = useEstado((e) => e.cartoes);
  const [filtro, setFiltro] = useState<"todos" | Cartao["tipo"]>("todos");
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    return Object.values(cartoes)
      .filter((c) => filtro === "todos" || c.tipo === filtro)
      .filter((c) => !busca || `${c.palavra ?? ""} ${c.frase?.zh ?? ""} ${c.pt ?? ""} ${c.origem.prova}`.includes(busca))
      .sort((a, b) => a.srs.due - b.srs.due);
  }, [cartoes, filtro, busca]);

  const contagem = useMemo(() => {
    const c = { questao: 0, frase: 0, palavra: 0, vencidos: 0, novos: 0 };
    const agora = Date.now();
    for (const x of Object.values(cartoes)) {
      c[x.tipo]++;
      if (x.srs.state === 0) c.novos++;
      else if (x.srs.due <= agora) c.vencidos++;
    }
    return c;
  }, [cartoes]);

  return (
    <>
      <p>
        {Object.keys(cartoes).length} cartões · {contagem.questao} questões · {contagem.frase} frases · {contagem.palavra} palavras · {contagem.novos} novos ·{" "}
        {contagem.vencidos} vencidos
      </p>
      <div className="filtros">
        {(["todos", "questao", "frase", "palavra"] as const).map((f) => (
          <button key={f} className={filtro === f ? "pri" : "sec"} onClick={() => setFiltro(f)}>
            {f === "questao" ? "questões" : f === "todos" ? "todos" : `${f}s`}
          </button>
        ))}
        <input className="entrada" placeholder="buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <table className="tabela">
        <thead>
          <tr>
            <th>tipo</th>
            <th>conteúdo</th>
            <th>origem</th>
            <th>estado</th>
            <th>próxima</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.id}>
              <td>{c.tipo === "questao" ? "questão" : c.tipo}</td>
              <td className="zh">
                {c.tipo === "palavra" ? (
                  <>
                    {c.palavra} <small>{c.py} {c.pt}</small>
                  </>
                ) : c.tipo === "frase" ? (
                  c.frase?.zh
                ) : (
                  `questão ${c.origem.n}`
                )}
              </td>
              <td>
                <a href={`#/estudo/${c.origem.prova}/${c.origem.n}`}>
                  {c.origem.prova} nº {c.origem.n}
                </a>
              </td>
              <td>{ESTADOS[c.srs.state] ?? c.srs.state}</td>
              <td>{c.srs.state === 0 ? "—" : c.srs.due <= Date.now() ? "agora" : `em ${intervalo(c.srs.due - Date.now())}`}</td>
              <td>
                <button
                  className="link"
                  onClick={() => {
                    if (confirm("Apagar este cartão?")) apagaCartao(c.id);
                  }}
                >
                  apagar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
