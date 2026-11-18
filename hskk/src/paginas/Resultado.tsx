import { useEffect, useState } from "react";
import { ControleAudio, useControleAudio, useTempo } from "../audio";
import { mudaConfig, useConfig, useEstado } from "../armazenamento";
import { ItemGravacao } from "../componentes/ItemGravacao";
import { Frase, ProvedorLeitura } from "../componentes/Leitura";
import { carregaLexico, carregaProva, ehRepetir, formataTempo, NOMES_PARTE, urlPublica } from "../dados";
import { transcreveGravacao } from "../gravacoes";
import type { Lexico, Prova, Questao } from "../tipos";

export function PaginaResultado({ tentativaId }: { tentativaId: string }) {
  const tent = useEstado((e) => e.tentativas[tentativaId]);
  const cfg = useConfig();
  const [prova, setProva] = useState<Prova | null>(null);
  const [lexico, setLexico] = useState<Lexico | null>(null);
  const [lote, setLote] = useState<{ feitos: number; total: number; erro?: string } | null>(null);
  const [mostraTexto, setMostraTexto] = useState(true);

  useEffect(() => {
    if (tent) carregaProva(tent.prova).then(setProva).catch(() => setProva(null));
    carregaLexico().then(setLexico).catch(() => setLexico({}));
  }, [tent?.prova]); // eslint-disable-line react-hooks/exhaustive-deps

  const audio = useControleAudio(prova?.audio ? urlPublica(prova.audio.src) : null);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey) return;
      if (e.key === "t" || e.key === "T") mudaConfig({ traducao: !cfg.traducao });
      if (e.key === "p" || e.key === "P") mudaConfig({ pinyin: !cfg.pinyin });
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [cfg.traducao, cfg.pinyin]);

  if (!tent) return <div className="erro">Tentativa não encontrada (talvez o progresso ainda esteja carregando).</div>;
  if (!prova) return <div className="carregando">carregando…</div>;

  const p1 = prova.questoes.filter(ehRepetir);
  const pcts = p1.map((q) => tent.gravacoes[q.n]?.at(-1)?.pct).filter((x): x is number => x !== undefined);
  const media = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const semTexto = prova.questoes.flatMap((q) => (tent.gravacoes[q.n] ?? []).filter((g) => g.texto === undefined && !g.soNaSessao && g.dur > 0.6).map((g) => ({ q, g })));
  const nGrav = prova.questoes.filter((q) => tent.gravacoes[q.n]?.length).length;

  const transcreveTudo = async () => {
    setLote({ feitos: 0, total: semTexto.length });
    let feitos = 0;
    for (const { q, g } of semTexto) {
      try {
        await transcreveGravacao(tent.id, prova, q, g);
      } catch (e) {
        setLote({ feitos, total: semTexto.length, erro: e instanceof Error ? e.message : String(e) });
        return;
      }
      feitos++;
      setLote({ feitos, total: semTexto.length });
    }
  };

  return (
    <ProvedorLeitura lexico={lexico} traducao={cfg.traducao} pinyin={cfg.pinyin} audio={audio}>
      <div className="resultado">
        <h1>
          {prova.id} · revisão da prova
        </h1>
        <p className="data">
          {new Date(tent.inicio).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}
          {tent.fim ? ` · ${Math.round((tent.fim - tent.inicio) / 60000)} min` : " · em andamento"}
          {tent.semMicrofone && " · feita sem gravar"}
        </p>

        <div className="placar">
          <div>
            <small>gravações</small>
            <b>{nGrav}/14</b>
          </div>
          <div>
            <small>parte 1 · repetição (automático)</small>
            <b>{media !== null ? `${media}%` : "—"}</b>
            <span>{pcts.length < 10 ? `${pcts.length} de 10 frases corrigidas` : "média das 10 frases"}</span>
          </div>
          <div className="placar-largo">
            <small>nota oficial</small>
            <span>
              Não dá para calcular: o HSKK é corrigido por avaliadores ouvindo a gravação (nota de 0 a 100, aprovação com 60) e os critérios por faixa não
              são publicados. O % acima só mede quantos caracteres o reconhecimento de voz entendeu. Veja <a href="#/regras">as regras</a>.
            </span>
          </div>
        </div>

        <div className="acoes">
          {semTexto.length > 0 && (
            <button className="pri" onClick={() => void transcreveTudo()} disabled={!!lote && !lote.erro && lote.feitos < lote.total}>
              transcrever e corrigir tudo ({semTexto.length})
            </button>
          )}
          {lote && (
            <span className="contagem">
              {lote.feitos}/{lote.total} {lote.erro && <span className="erro-inline">— parou: {lote.erro}</span>}
            </span>
          )}
          <label className={`chave ${mostraTexto ? "on" : ""}`}>
            <input type="checkbox" checked={mostraTexto} onChange={(e) => setMostraTexto(e.target.checked)} />
            mostrar o texto das frases
          </label>
          <label className={`chave ${cfg.pinyin ? "on" : ""}`}>
            <input type="checkbox" checked={cfg.pinyin} onChange={(e) => mudaConfig({ pinyin: e.target.checked })} />
            pinyin <kbd>P</kbd>
          </label>
          <a className="botao sec" href={`#/estudo/${prova.id}`}>
            estudar esta prova
          </a>
        </div>
        <p className="aviso">
          Frases do 第一部分 abaixo de {cfg.limiarRevisao}% vão sozinhas para a <a href="#/revisao">revisão espaçada</a> quando são corrigidas.
        </p>

        {tent.notas?.[0] && (
          <div className="bloco">
            <h3>Suas anotações da preparação</h3>
            <pre className="zh notas-salvas">{tent.notas[0]}</pre>
          </div>
        )}

        {[1, 2, 3].map((parte) => (
          <section key={parte} className="bloco">
            <h3>
              {NOMES_PARTE[parte].curto} · <span className="zh">{NOMES_PARTE[parte].zh}</span> <small>{NOMES_PARTE[parte].pt}</small>
            </h3>
            {prova.questoes
              .filter((q) => q.parte === parte)
              .map((q) => (
                <ItemRevisao key={q.n} prova={prova} q={q} tentId={tent.id} audio={audio} mostraTexto={mostraTexto} />
              ))}
          </section>
        ))}
      </div>
    </ProvedorLeitura>
  );
}

function ItemRevisao({ prova, q, tentId, audio, mostraTexto }: { prova: Prova; q: Questao; tentId: string; audio: ControleAudio | null; mostraTexto: boolean }) {
  const g = useEstado((e) => e.tentativas[tentId]?.gravacoes[q.n]?.at(-1));
  const { tocando, trecho } = useTempo(audio);
  const toca = (s: number, e: number) => {
    if (!audio) return;
    if (tocando && trecho?.s === s) audio.pausa();
    else void audio.toca(s, e);
  };
  return (
    <div className="item-revisao-prova">
      <div className="item-cabeca">
        <span className="numero">{q.n}</span>
        {ehRepetir(q) ? (
          <>
            <button className="sec" onClick={() => toca(q.t.s ?? q.t.p, q.t.e ?? q.t.rs)}>
              {tocando && trecho?.s === (q.t.s ?? q.t.p) ? "❚❚" : "▶"} original
            </button>
            {mostraTexto && (
              <span className="frase-media">
                <Frase f={q.frase} fim1={q.t.e} />
                {q.frase.pt && <small className="traducao"> — {q.frase.pt}</small>}
              </span>
            )}
          </>
        ) : q.parte === 2 ? (
          <>
            {q.img && <img className="miniatura" src={urlPublica(q.img)} alt={`figura ${q.n}`} />}
            <a href={`#/estudo/${prova.id}/${q.n}`}>respostas-modelo e vocabulário →</a>
          </>
        ) : (
          <>
            {q.pergunta && (
              <span className="frase-media">
                <Frase f={q.pergunta} />
              </span>
            )}
            <a href={`#/estudo/${prova.id}/${q.n}`}>respostas-modelo →</a>
          </>
        )}
      </div>
      {g ? (
        <ItemGravacao tentId={tentId} prova={prova} q={q} g={g} titulo="sua resposta" />
      ) : (
        <small className="falta">sem gravação{q.t.re - q.t.rs > 0 ? ` (janela de ${formataTempo(q.t.re - q.t.rs)})` : ""}</small>
      )}
    </div>
  );
}
