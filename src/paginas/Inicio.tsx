import { useEffect, useMemo, useState } from "react";
import { mudaConfig, resetaSimulado, useEstado } from "../armazenamento";
import { carregaIndice, formataTempo, pontuacao, REGRAS, regras, secaoDe } from "../dados";
import type { Nivel, ResumoProva, Tentativa } from "../tipos";
import { notaDoEstudo } from "../correcao";
import { CartaoHskk } from "../hskk/componentes/CartaoHskk";
import { BannerQuick } from "../quick/BannerQuick";

const nivelDe = (id: string): Nivel => (Number(id[1]) || 3) as Nivel;

function notaDe(t: Tentativa) {
  const nivel = nivelDe(t.prova);
  const c = { L: 0, R: 0, W: 0 };
  for (const [n, r] of Object.entries(t.respostas)) {
    if (!(r.certa || r.manual)) continue;
    c[secaoDe(nivel, Number(n))]++;
  }
  return pontuacao(c, nivel);
}

function useIndice() {
  const [provas, setProvas] = useState<ResumoProva[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    carregaIndice().then(setProvas).catch((e) => setErro(String(e)));
  }, []);
  return { provas, erro };
}

function usePorProva() {
  const tentativas = useEstado((e) => e.tentativas);
  return useMemo(() => {
    const m: Record<string, Tentativa[]> = {};
    for (const t of Object.values(tentativas)) (m[t.prova] ??= []).push(t);
    for (const k in m) m[k].sort((a, b) => b.inicio - a.inicio);
    return m;
  }, [tentativas]);
}

/** Primeira tela: escolher o nível. */
export function EscolhaNivel() {
  const { provas, erro } = useIndice();
  const porProva = usePorProva();
  const ultimoNivel = useEstado((e) => e.config.nivel);

  if (erro) return <div className="erro">Não consegui carregar a lista de simulados: {erro}</div>;
  if (!provas) return <div className="carregando">carregando…</div>;

  const niveis = Array.from(new Set(provas.map((p) => p.nivel ?? 3))).sort();
  return (
    <div className="escolha-nivel">
      <section className="intro">
        <h1>Simulados oficiais do HSK</h1>
        <p>
          Provas reais já aplicadas (formato HSK 2.0), com o áudio original. No <b>modo prova</b> o tempo corre como no dia do exame; no{" "}
          <b>modo estudo</b> você confere cada questão, ouve o áudio palavra por palavra, traduz passando o mouse e manda o que errou para a
          revisão espaçada. Escolha o nível — ou o <b>HSKK</b>, a prova oral:
        </p>
        <BannerQuick />
      </section>
      <div className="niveis">
        {niveis.map((nv) => {
          const rg = regras(nv);
          const daquele = provas.filter((p) => (p.nivel ?? 3) === nv);
          const feitas = daquele.filter((p) => (porProva[p.id] ?? []).some((t) => t.modo === "prova" && t.fim && !t.abandonada)).length;
          const melhores = daquele
            .map((p) => (porProva[p.id] ?? []).filter((t) => t.modo === "prova" && t.fim && !t.abandonada).map((t) => notaDe(t).total))
            .flat();
          const melhor = melhores.length ? Math.max(...melhores) : null;
          return (
            <a
              key={nv}
              href={`#/nivel/${nv}`}
              className={`cartao-nivel ${ultimoNivel === nv ? "ultimo" : ""}`}
              onClick={() => mudaConfig({ nivel: nv as Nivel })}
            >
              <div className="nivel-topo">
                <span className="nivel-nome">{rg.nome}</span>
                <span className="nivel-zh zh">{nv === 1 ? "一级" : nv === 2 ? "二级" : nv === 3 ? "三级" : `${nv}级`}</span>
              </div>
              <div className="nivel-num">
                <b>{daquele.length}</b> provas reais
              </div>
              <ul>
                {rg.resumo.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="nivel-rodape">
                {feitas > 0 ? (
                  <>
                    {feitas} feita(s) no modo prova · melhor nota{" "}
                    <b className={melhor !== null && melhor >= rg.aprovacao ? "aprovado" : "reprovado"}>
                      {melhor}/{rg.maximo}
                    </b>
                  </>
                ) : (
                  "nenhuma prova feita ainda"
                )}
                {ultimoNivel === nv && <span className="tag">último usado</span>}
              </div>
            </a>
          );
        })}
        <CartaoHskk />
      </div>
      <p className="nota-rodape">
        Regras gerais do HSK 2.0 (níveis 1–6): provas escritas, cada seção vale 100 pontos e a aprovação é com 60% do total. O áudio de cada
        questão é tocado duas vezes. Os níveis 1 e 2 imprimem pinyin no caderno.
      </p>
    </div>
  );
}

/** Lista de provas de um nível. */
export function Inicio({ nivel }: { nivel: Nivel }) {
  const { provas: todas, erro } = useIndice();
  const porProva = usePorProva();
  const rg = regras(nivel);

  useEffect(() => {
    mudaConfig({ nivel });
  }, [nivel]);

  if (erro) return <div className="erro">Não consegui carregar a lista de simulados: {erro}</div>;
  if (!todas) return <div className="carregando">carregando…</div>;
  const provas = todas.filter((p) => (p.nivel ?? 3) === nivel);
  const outros = Object.keys(REGRAS).map(Number).filter((n) => n !== nivel && todas.some((p) => (p.nivel ?? 3) === n));

  return (
    <div className="inicio">
      <section className="intro">
        <div className="trocar-nivel">
          <a href="#/">← níveis</a>
          {outros.map((n) => (
            <a key={n} className="botao sec" href={`#/nivel/${n}`}>
              ir para o {regras(n).nome}
            </a>
          ))}
          <a className="botao sec ql-atalho" href={`#/quick/${nivel}`} title={`5 áudios das provas do ${rg.nome} com 3 palavras faltando em cada`}>
            Quick Listen 🔥
          </a>
        </div>
        <h1>Simulados oficiais do {rg.nome}</h1>
        <ul className="regras-curtas">
          {rg.resumo.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>
      <div className="grade-provas">
        {provas.map((p) => {
          const ts = porProva[p.id] ?? [];
          const exames = ts.filter((t) => t.modo === "prova" && t.fim && !t.abandonada);
          const melhor = exames.reduce<number | null>((m, t) => Math.max(m ?? 0, notaDe(t).total), null);
          const ultimo = exames[0] ? notaDe(exames[0]) : null;
          const estudo = ts.find((t) => t.modo === "estudo" && !t.arquivada);
          const notaEstudo = estudo ? notaDoEstudo(estudo, nivel) : null;
          const feitas = notaEstudo?.feitas ?? 0;
          const acertos = estudo ? Object.values(estudo.respostas).filter((r) => !r.pendente && (r.certa || r.manual)).length : 0;
          const emAndamento = ts.find((t) => t.modo === "prova" && !t.fim && !t.arquivada);
          const podeResetar = Object.keys(estudo?.respostas ?? {}).length > 0 || !!emAndamento;
          const total = rg.questoes.L + rg.questoes.R + rg.questoes.W;
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
                  <b className={melhor !== null ? (melhor >= rg.aprovacao ? "aprovado" : "reprovado") : ""}>{melhor ?? "—"}</b>
                </div>
                <div>
                  <small>última</small>
                  <b>{ultimo ? ultimo.total : "—"}</b>
                </div>
                <div
                  title={
                    notaEstudo && !notaEstudo.vazia
                      ? `Nota do modo estudo, proporcional ao que você já fez (cada seção vale 100 pelo aproveitamento nas questões feitas dela). ` +
                        `${feitas}/${total} feitas, ${acertos} certas` +
                        (notaEstudo.completa ? "." : `; contando as não feitas como erro: ${notaEstudo.absoluta}/${notaEstudo.maximo}.`)
                      : "Ainda sem questões feitas no modo estudo"
                  }
                >
                  <small>estudo</small>
                  {notaEstudo && !notaEstudo.vazia ? (
                    <b className={notaEstudo.proporcional >= rg.aprovacao ? "aprovado" : "reprovado"}>
                      {notaEstudo.completa ? "" : "≈"}
                      {notaEstudo.proporcional}
                      <small>
                        /{rg.maximo} · {feitas}/{total}
                      </small>
                    </b>
                  ) : (
                    <b>
                      0<small>/{total}</small>
                    </b>
                  )}
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
                      `Resetar ${p.id}?\n\nO estudo${emAndamento ? " e a prova em andamento" : ""} recomeçam do zero. Nada é apagado: as respostas antigas ficam arquivadas no histórico, as notas de provas já terminadas continuam no Desempenho e seus cartões de revisão ficam intactos.`,
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
