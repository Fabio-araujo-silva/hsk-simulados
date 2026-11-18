import { useEffect, useMemo, useState } from "react";
import { resetaSimulado, useConfig, useEstado } from "../armazenamento";
import { carregaIndice, formataTempo, ROTULO_FONTE } from "../dados";
import type { ResumoProva, Tentativa } from "../tipos";

/** média do % da parte 1 (última gravação corrigida de cada frase) */
function mediaP1(t: Tentativa) {
  const ps: number[] = [];
  for (let n = 1; n <= 10; n++) {
    const p = t.gravacoes[n]?.at(-1)?.pct;
    if (p !== undefined) ps.push(p);
  }
  return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
}

export function Inicio() {
  const [provas, setProvas] = useState<ResumoProva[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tentativas = useEstado((e) => e.tentativas);
  const cfg = useConfig();

  useEffect(() => {
    carregaIndice().then(setProvas).catch((e) => setErro(String(e)));
  }, []);

  const porProva = useMemo(() => {
    const m: Record<string, Tentativa[]> = {};
    for (const t of Object.values(tentativas)) (m[t.prova] ??= []).push(t);
    for (const k in m) m[k].sort((a, b) => b.inicio - a.inicio);
    return m;
  }, [tentativas]);

  if (erro) return <div className="erro">Não consegui carregar a lista de provas: {erro}</div>;
  if (!provas) return <div className="carregando">carregando…</div>;

  return (
    <div className="inicio">
      <section className="intro">
        <h1>
          HSKK 中级 <span className="zh">汉语水平口语考试（中级）</span>
        </h1>
        <p>
          A <b>prova oral intermediária</b> do HSK: você fala num microfone e a gravação é corrigida depois. São 14 questões em ~21–23 min:{" "}
          <b>repetir 10 frases</b>, <b>falar 2 min sobre 2 figuras</b> e <b>responder 2 perguntas</b> (2 min cada), com 10 min de preparação para as
          4 últimas. Nota de 0 a 100, aprovação com <b>60</b>. <a href="#/regras">Regras completas →</a>
        </p>
        <p>
          No <b>modo prova</b> o áudio original corre como no dia e sua voz é gravada em cada resposta; no fim você ouve tudo ao lado do original. No{" "}
          <b>modo estudo</b> você treina questão por questão, com texto, pinyin, tradução por hover, correção automática da repetição e
          respostas-modelo.
        </p>
      </section>
      <div className="grade-provas">
        {provas.map((p) => {
          const ts = porProva[p.id] ?? [];
          const exames = ts.filter((t) => t.modo === "prova" && t.fim && !t.abandonada);
          const estudo = ts.find((t) => t.modo === "estudo" && !t.arquivada);
          const feitas = estudo ? Object.keys(estudo.gravacoes).filter((n) => estudo.gravacoes[Number(n)]?.length).length : 0;
          const media = estudo ? mediaP1(estudo) : null;
          const emAndamento = ts.find((t) => t.modo === "prova" && !t.fim && !t.arquivada);
          const ultimaProva = exames[0];
          return (
            <article key={p.id} className="cartao-prova">
              <header>
                <h2>{p.id}</h2>
                <span className="origem">{p.titulo}</span>
              </header>
              <div className="infos">
                <span className={p.fontes.caderno === "oficial" ? "ok" : "falta"} title="题本: figuras e perguntas">
                  caderno: {ROTULO_FONTE[p.fontes.caderno]}
                </span>
                <span className={p.fontes.roteiro === "oficial" ? "ok" : "falta"} title="texto das 10 frases do 第一部分">
                  frases: {ROTULO_FONTE[p.fontes.roteiro]}
                </span>
                <span className={p.fontes.audio === "oficial" ? "ok" : "falta"}>
                  ♪ áudio {ROTULO_FONTE[p.fontes.audio]} {p.duracaoAudio ? formataTempo(p.duracaoAudio) : ""}
                </span>
                <span className="neutro">{p.formato === "bip" ? "formato atual (嘀)" : "formato antigo (sem 嘀)"}</span>
              </div>
              <div className="stats">
                <div>
                  <small>provas feitas</small>
                  <b>{exames.length}</b>
                </div>
                <div>
                  <small>estudo</small>
                  <b>{feitas}/14</b>
                </div>
                <div>
                  <small>parte 1 (estudo)</small>
                  <b className={media !== null ? (media >= cfg.limiarRevisao ? "aprovado" : "reprovado") : ""}>{media !== null ? `${media}%` : "—"}</b>
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
              {exames.length > 0 && (
                <div className="historico">
                  provas:{" "}
                  {exames.slice(0, 5).map((t, i) => (
                    <a key={t.id} href={`#/resultado/${t.id}`}>
                      {new Date(t.inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      {i < Math.min(exames.length, 5) - 1 ? ", " : ""}
                    </a>
                  ))}
                  {ultimaProva && mediaP1(ultimaProva) !== null && <small> · última: parte 1 {mediaP1(ultimaProva)}%</small>}
                </div>
              )}
              {(feitas > 0 || emAndamento) && (
                <button
                  className="link resetar"
                  onClick={() => {
                    const ok = confirm(
                      `Resetar ${p.id}?\n\nO estudo${emAndamento ? " e a prova em andamento" : ""} recomeçam do zero. Nada é apagado: as gravações antigas ficam arquivadas, as provas terminadas continuam no histórico e as frases da revisão ficam intactas.`,
                    );
                    if (ok) resetaSimulado(p.id);
                  }}
                >
                  ⟲ resetar
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
