import { useMemo, useState } from "react";
import { salvaCartoes, useConfig, useEstado } from "../armazenamento";
import { sugereCartoes } from "../cartoes";
import { resumoTentativa, textoResposta } from "../correcao";
import { nomeParte, NOMES_SECAO, regras } from "../dados";
import { CaixaRevisao } from "../componentes/CaixaRevisao";
import { ProvedorLeitura } from "../componentes/Leitura";
import { VisaoQuestao } from "../componentes/Questao";
import { useAudioDaProva, useProvaELexico } from "./Estudo";
import { mudaConfig } from "../armazenamento";

export function PaginaResultado({ tentativaId }: { tentativaId: string }) {
  const t = useEstado((e) => e.tentativas[tentativaId]);
  const todas = useEstado((e) => e.tentativas);
  const { prova, lexico, erro } = useProvaELexico(t?.prova ?? "");
  const audio = useAudioDaProva(prova);
  const cfg = useConfig();
  const [aberta, setAberta] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<"erradas" | "todas">("erradas");
  const [msg, setMsg] = useState<string | null>(null);

  const res = useMemo(() => (prova && t ? resumoTentativa(prova, t) : null), [prova, t]);
  const anteriores = useMemo(() => {
    if (!prova || !t) return [];
    return Object.values(todas)
      .filter((x) => x.prova === t.prova && x.modo === "prova" && x.fim && !x.abandonada && x.id !== t.id)
      .sort((a, b) => (b.fim ?? 0) - (a.fim ?? 0))
      .map((x) => ({ t: x, r: resumoTentativa(prova, x) }));
  }, [todas, prova, t]);

  if (!t) return <div className="erro">Tentativa não encontrada.</div>;
  if (erro) return <div className="erro">{erro}</div>;
  if (!prova || !res) return <div className="carregando">carregando…</div>;

  const erradas = prova.questoes.filter((q) => {
    const r = t.respostas[q.n];
    if (t.semListening && q.secao === "L") return false;
    return !r || !(r.certa || r.manual);
  });
  const lista = filtro === "erradas" ? erradas : prova.questoes.filter((q) => !(t.semListening && q.secao === "L"));

  const adicionaTodas = () => {
    const novos = erradas.flatMap((q) => sugereCartoes(prova, q, lexico, t.consultas?.[q.n] ?? []).filter((s) => !s.existe && s.marcado).map((s) => s.cartao));
    const unicos = Object.values(Object.fromEntries(novos.map((c) => [c.id, c])));
    salvaCartoes(unicos);
    setMsg(`${unicos.length} cartões adicionados à revisão espaçada.`);
  };

  return (
    <ProvedorLeitura lexico={lexico} traducao={cfg.traducao} pinyin={cfg.pinyin} audio={audio}>
      <div className="resultado">
        <h1>
          {prova.id} · {t.modo === "prova" ? "resultado da prova" : "resultado do estudo"}
        </h1>
        <p className="data">{new Date(t.fim ?? t.inicio).toLocaleString("pt-BR")}</p>

        <div className="placar">
          {(["L", "R", "W"] as const).filter((s) => regras(prova.nivel).questoes[s] > 0).map((s) => (
            <div key={s} className="placar-secao">
              <small>{NOMES_SECAO[s]}</small>
              <b>{t.semListening && s === "L" ? "—" : res[s]}</b>
              <span>
                {res.certas[s]}/{regras(prova.nivel).questoes[s]} certas
              </span>
            </div>
          ))}
          <div className={`placar-total ${res.aprovado ? "aprovado" : "reprovado"}`}>
            <small>total</small>
            <b>{res.total}</b>
            <span>{res.aprovado ? `aprovado (≥ ${res.aprovacao})` : `faltam ${res.aprovacao - res.total} p/ ${res.aprovacao}`}</span>
          </div>
        </div>
        <p className="nota-rodape">Nota estimada: cada seção vale 100 pontos, proporcional aos acertos (a nota oficial usa uma escala equalizada, mas fica próxima disso).</p>

        <h2>Por tipo de questão</h2>
        <div className="partes">
          {Object.entries(res.porParte).map(([k, v]) => (
            <div key={k} className="parte-barra">
              <span>{nomeParte(prova.nivel, k)}</span>
              <div className="barra">
                <div className="barra-cheia" style={{ width: `${(v.certas / v.total) * 100}%` }} />
              </div>
              <b>
                {v.certas}/{v.total}
              </b>
            </div>
          ))}
        </div>

        {anteriores.length > 0 && (
          <>
            <h2>Tentativas anteriores desta prova</h2>
            <table className="tabela">
              <thead>
                <tr>
                  <th>data</th>
                  <th>听力</th>
                  <th>阅读</th>
                  <th>书写</th>
                  <th>total</th>
                </tr>
              </thead>
              <tbody>
                {anteriores.map(({ t: x, r }) => (
                  <tr key={x.id}>
                    <td>
                      <a href={`#/resultado/${x.id}`}>{new Date(x.fim!).toLocaleDateString("pt-BR")}</a>
                    </td>
                    <td>{r.L}</td>
                    <td>{r.R}</td>
                    <td>{r.W}</td>
                    <td className={r.aprovado ? "aprovado" : "reprovado"}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="revisar-cabecalho">
          <h2>
            Revisar {filtro === "erradas" ? `as ${erradas.length} erradas` : "todas"}
          </h2>
          <div className="alternadores">
            <button className={filtro === "erradas" ? "pri" : "sec"} onClick={() => setFiltro("erradas")}>
              erradas
            </button>
            <button className={filtro === "todas" ? "pri" : "sec"} onClick={() => setFiltro("todas")}>
              todas
            </button>
            <label className={`chave ${cfg.traducao ? "on" : ""}`}>
              <input type="checkbox" checked={cfg.traducao} onChange={(e) => mudaConfig({ traducao: e.target.checked })} /> Tradução
            </label>
            <label className={`chave ${cfg.pinyin ? "on" : ""}`}>
              <input type="checkbox" checked={cfg.pinyin} onChange={(e) => mudaConfig({ pinyin: e.target.checked })} /> Pinyin
            </label>
          </div>
        </div>
        {erradas.length > 0 && (
          <div className="caixa-revisao">
            <div className="caixa-titulo">Mandar as erradas para a revisão espaçada</div>
            <p>
              Para cada questão errada: refazer a questão, a frase-chave (com o áudio original) e as palavras-chave + as que você consultou.
            </p>
            {msg ? <b>{msg}</b> : (
              <button className="pri" onClick={adicionaTodas}>
                Adicionar todas as {erradas.length} erradas
              </button>
            )}
          </div>
        )}
        <div className="lista-revisar">
          {lista.map((q) => {
            const r = t.respostas[q.n];
            const ok = !!r && (r.certa || r.manual);
            const grupo = q.grupo ? prova.grupos[q.grupo] : undefined;
            return (
              <div key={q.n} className={`item-revisar ${ok ? "ok" : "erro"}`}>
                <button className="item-cabeca" onClick={() => setAberta(aberta === q.n ? null : q.n)}>
                  <span className="numero">{q.n}</span>
                  <span className="parte">{nomeParte(prova.nivel, `${q.secao}${q.parte}`)}</span>
                  <span className="sua zh">sua: {r ? textoResposta(q, grupo, r.valor) : "—"}</span>
                  {!ok && <span className="oficial zh">certa: {textoResposta(q, grupo)}</span>}
                  <span className="seta">{aberta === q.n ? "▲" : "▼"}</span>
                </button>
                {aberta === q.n && (
                  <div className="item-corpo">
                    <VisaoQuestao prova={prova} q={q} valor={r?.valor ?? null} revelado modo="revisao" audio={audio} />
                    <CaixaRevisao prova={prova} q={q} lexico={lexico} consultas={t.consultas?.[q.n] ?? []} errou={!ok} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="acoes">
          <a className="botao sec" href="#/">
            voltar aos simulados
          </a>
          <a className="botao pri" href={`#/estudo/${prova.id}`}>
            estudar esta prova
          </a>
        </div>
      </div>
    </ProvedorLeitura>
  );
}
