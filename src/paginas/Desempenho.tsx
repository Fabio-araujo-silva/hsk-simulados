import { useEffect, useMemo, useState } from "react";
import { useEstado } from "../armazenamento";
import { resumoTentativa } from "../correcao";
import { carregaIndice, carregaProva, nomeParte, regras } from "../dados";
import type { Prova } from "../tipos";

/** Notas de todas as provas feitas + aproveitamento por tipo de questão. */
export function PaginaDesempenho() {
  const tentativas = useEstado((e) => e.tentativas);
  const [provas, setProvas] = useState<Record<string, Prova>>({});

  const ids = useMemo(() => Array.from(new Set(Object.values(tentativas).map((t) => t.prova))), [tentativas]);
  useEffect(() => {
    carregaIndice()
      .then((idx) => Promise.all(idx.filter((p) => ids.includes(p.id)).map((p) => carregaProva(p.id))))
      .then((ps) => setProvas(Object.fromEntries(ps.map((p) => [p.id, p]))))
      .catch(() => {});
  }, [ids]);

  const exames = useMemo(
    () =>
      Object.values(tentativas)
        .filter((t) => t.modo === "prova" && t.fim && !t.abandonada && provas[t.prova])
        .sort((a, b) => (a.fim ?? 0) - (b.fim ?? 0))
        .map((t) => ({ t, r: resumoTentativa(provas[t.prova], t) })),
    [tentativas, provas],
  );

  // aproveitamento por parte (todas as respostas, estudo + prova)
  const porParte = useMemo(() => {
    const acc: Record<string, { certas: number; total: number }> = {};
    for (const t of Object.values(tentativas)) {
      const p = provas[t.prova];
      if (!p) continue;
      for (const q of p.questoes) {
        const r = t.respostas[q.n];
        if (!r) continue;
        const k = `${p.nivel ?? 3}:${q.secao}${q.parte}`;
        acc[k] ??= { certas: 0, total: 0 };
        acc[k].total++;
        if (r.certa || r.manual) acc[k].certas++;
      }
    }
    return Object.entries(acc).sort((a, b) => a[1].certas / a[1].total - b[1].certas / b[1].total);
  }, [tentativas, provas]);

  if (!Object.keys(tentativas).length) {
    return (
      <div className="vazio">
        <h1>Desempenho</h1>
        <p>Faça um simulado (modo prova) para ver sua evolução aqui.</p>
      </div>
    );
  }

  return (
    <div className="desempenho">
      <h1>Desempenho</h1>
      <h2>Notas no modo prova</h2>
      {exames.length === 0 ? (
        <p>Nenhuma prova completa ainda.</p>
      ) : (
        <>
          <div className="grafico-notas" role="img" aria-label="evolução das notas">
            <div className="linha-180" style={{ bottom: "60%" }} title="aprovação (60% dos pontos)">
              <span>60%</span>
            </div>
            {exames.map(({ t, r }) => (
              <a key={t.id} href={`#/resultado/${t.id}`} className="coluna" title={`${t.prova} · ${r.total}`}>
                <div className={`barra-v ${r.aprovado ? "aprovado" : "reprovado"}`} style={{ height: `${(r.total / r.maximo) * 100}%` }}>
                  <span>{r.total}</span>
                </div>
                <small>{t.prova.replace("H3", "")}</small>
              </a>
            ))}
          </div>
          <table className="tabela">
            <thead>
              <tr>
                <th>data</th>
                <th>prova</th>
                <th>听力</th>
                <th>阅读</th>
                <th>书写</th>
                <th>total</th>
              </tr>
            </thead>
            <tbody>
              {[...exames].reverse().map(({ t, r }) => (
                <tr key={t.id}>
                  <td>
                    <a href={`#/resultado/${t.id}`}>{new Date(t.fim!).toLocaleDateString("pt-BR")}</a>
                  </td>
                  <td>{t.prova}</td>
                  <td>{t.semListening ? "—" : r.L}</td>
                  <td>{r.R}</td>
                  <td>{regras(provas[t.prova].nivel).questoes.W ? r.W : "—"}</td>
                  <td className={r.aprovado ? "aprovado" : "reprovado"}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Onde você mais erra (estudo + provas)</h2>
      <div className="partes">
        {porParte.map(([k, v]) => (
          <div key={k} className="parte-barra">
            <span>
              HSK {k.split(":")[0]} · {nomeParte(Number(k.split(":")[0]), k.split(":")[1])}
            </span>
            <div className="barra">
              <div className="barra-cheia" style={{ width: `${(v.certas / v.total) * 100}%` }} />
            </div>
            <b>{Math.round((v.certas / v.total) * 100)}%</b>
            <small>
              {v.certas}/{v.total}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
