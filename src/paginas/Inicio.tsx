import { useEffect, useMemo, useState } from "react";
import { resetaSimulado, useEstado } from "../armazenamento";
import { carregaIndice, formataTempo, pontuacao } from "../dados";
import type { ResumoProva, Tentativa } from "../tipos";

function notaDe(t: Tentativa) {
  const c = { L: 0, R: 0, W: 0 };
  for (const [n, r] of Object.entries(t.respostas)) {
    if (!(r.certa || r.manual)) continue;
    const k = Number(n);
    if (k <= 40) c.L++;
    else if (k <= 70) c.R++;
    else c.W++;
  }
  return pontuacao(c);
}

export function Inicio() {
  const [provas, setProvas] = useState<ResumoProva[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tentativas = useEstado((e) => e.tentativas);

  useEffect(() => {
    carregaIndice().then(setProvas).catch((e) => setErro(String(e)));
  }, []);

  const porProva = useMemo(() => {
    const m: Record<string, Tentativa[]> = {};
    for (const t of Object.values(tentativas)) (m[t.prova] ??= []).push(t);
    for (const k in m) m[k].sort((a, b) => b.inicio - a.inicio);
    return m;
  }, [tentativas]);

  if (erro) return <div className="erro">Não consegui carregar a lista de simulados: {erro}</div>;
  if (!provas) return <div className="carregando">carregando…</div>;

  return (
    <div className="inicio">
      <section className="intro">
        <h1>Simulados oficiais do HSK 3</h1>
        <p>
          Provas reais aplicadas pelo Hanban/CTI (formato HSK 2.0): 40 de compreensão auditiva, 30 de leitura e 10 de escrita.
          Aprovação: <b>180 de 300</b>. No <b>modo prova</b> o tempo corre como no dia do exame e não há tradução; no <b>modo
          estudo</b> você confere cada questão, ouve o áudio original palavra por palavra e manda o que errou para a revisão espaçada.
        </p>
      </section>
      <div className="grade-provas">
        {provas.map((p) => {
          const ts = porProva[p.id] ?? [];
          const exames = ts.filter((t) => t.modo === "prova" && t.fim && !t.abandonada);
          const melhor = exames.reduce<number | null>((m, t) => Math.max(m ?? 0, notaDe(t).total), null);
          const ultimo = exames[0] ? notaDe(exames[0]) : null;
          const estudo = ts.find((t) => t.modo === "estudo" && !t.arquivada);
          const feitas = estudo ? Object.keys(estudo.respostas).length : 0;
          const acertos = estudo ? Object.values(estudo.respostas).filter((r) => r.certa || r.manual).length : 0;
          const emAndamento = ts.find((t) => t.modo === "prova" && !t.fim && !t.arquivada);
          const podeResetar = feitas > 0 || !!emAndamento;
          return (
            <article key={p.id} className="cartao-prova">
              <header>
                <h2>{p.id}</h2>
                <span className="origem">{p.titulo}</span>
              </header>
              <div className="infos">
                {p.temAudio ? <span className="ok">♪ áudio original {p.duracaoAudio ? formataTempo(p.duracaoAudio) : ""}</span> : <span className="falta">sem áudio</span>}
                {p.temAlinhamento && <span className="ok">palavra a palavra</span>}
                {p.transcricao === "audio" && (
                  <span className="falta" title="Esta prova não tem o 听力材料 oficial publicado; o texto do áudio foi transcrito do áudio original e revisado.">
                    texto do áudio transcrito
                  </span>
                )}
              </div>
              <div className="stats">
                <div>
                  <small>melhor prova</small>
                  <b className={melhor !== null ? (melhor >= 180 ? "aprovado" : "reprovado") : ""}>{melhor ?? "—"}</b>
                </div>
                <div>
                  <small>última</small>
                  <b>{ultimo ? ultimo.total : "—"}</b>
                </div>
                <div>
                  <small>estudo</small>
                  <b>
                    {feitas}/80{feitas > 0 && <small> · {Math.round((acertos / feitas) * 100)}%</small>}
                  </b>
                </div>
              </div>
              <div className="acoes">
                <a className="botao sec" href={`#/estudo/${p.id}`}>
                  Modo estudo
                </a>
                <a className="botao pri" href={`#/prova/${p.id}`}>
                  {emAndamento ? "Continuar prova" : "Modo prova"}
                </a>
              </div>
              {podeResetar && (
                <button
                  className="link resetar"
                  onClick={() => {
                    const ok = confirm(
                      `Resetar ${p.id}?

O estudo${emAndamento ? " e a prova em andamento" : ""} recomeçam do zero. Nada é apagado: as respostas antigas ficam arquivadas no histórico, as notas de provas já terminadas continuam no Desempenho e seus cartões de revisão ficam intactos.`,
                    );
                    if (ok) resetaSimulado(p.id);
                  }}
                >
                  ⟲ resetar simulado
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
