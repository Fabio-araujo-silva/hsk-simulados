import { useCallback, useEffect, useState } from "react";
import { ControleAudio, useControleAudio, useTempo } from "../audio";
import { adicionaGravacao, mudaConfig, mudaTentativa, tentativaEstudo, useConfig, useEstado } from "../armazenamento";
import { adicionaRevisao, idCartao, removeRevisao } from "../cartoes";
import { BotaoGravar } from "../componentes/Gravador";
import { ItemGravacao } from "../componentes/ItemGravacao";
import { Frase, ProvedorLeitura } from "../componentes/Leitura";
import { carregaLexico, carregaProva, ehRepetir, formataTempo, NOMES_PARTE, TEMPO_FALA, TEMPO_PREPARO_ESTUDO, TEMPO_REPETIR, urlPublica } from "../dados";
import { nomeGravacao, salvaGravacao } from "../gravacoes";
import type { Lexico, Prova, Questao, QuestaoFalar, QuestaoRepetir, Tentativa } from "../tipos";

export function PaginaEstudo({ id, nInicial }: { id: string; nInicial?: number }) {
  const [prova, setProva] = useState<Prova | null>(null);
  const [lexico, setLexico] = useState<Lexico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cfg = useConfig();
  const n = nInicial && nInicial >= 1 && nInicial <= 14 ? nInicial : 1;
  const tent = useEstado((e) => Object.values(e.tentativas).find((t) => t.prova === id && t.modo === "estudo" && !t.arquivada));
  const cartoes = useEstado((e) => e.cartoes);

  useEffect(() => {
    carregaProva(id).then(setProva).catch((e) => setErro(String(e)));
    carregaLexico().then(setLexico).catch(() => setLexico({}));
  }, [id]);

  const audio = useControleAudio(prova?.audio ? urlPublica(prova.audio.src) : null);
  useEffect(() => {
    audio?.velocidade(cfg.velocidade);
  }, [audio, cfg.velocidade]);
  useEffect(() => {
    audio?.pausa();
  }, [n, audio]);

  const vai = useCallback((k: number) => {
    if (k >= 1 && k <= 14) window.location.hash = `/estudo/${id}/${k}`;
  }, [id]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "t" || e.key === "T") mudaConfig({ traducao: !cfg.traducao });
      else if (e.key === "p" || e.key === "P") mudaConfig({ pinyin: !cfg.pinyin });
      else if (e.key === "ArrowRight") vai(n + 1);
      else if (e.key === "ArrowLeft") vai(n - 1);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [cfg.traducao, cfg.pinyin, n, vai]);

  if (erro) return <div className="erro">Não consegui carregar a prova {id}: {erro}</div>;
  if (!prova) return <div className="carregando">carregando…</div>;
  const q = prova.questoes.find((x) => x.n === n);

  const status = (k: number) => {
    const gs = tent?.gravacoes[k] ?? [];
    if (!gs.length) return "";
    const ult = gs[gs.length - 1];
    if (k <= 10) return ult.pct === undefined ? "feita" : ult.pct >= cfg.limiarRevisao ? "certa" : "errada";
    return "certa";
  };

  return (
    <ProvedorLeitura lexico={lexico} traducao={cfg.traducao} pinyin={cfg.pinyin} audio={audio}>
      <div className="estudo">
        <aside className="navegador">
          <div className="nav-titulo">
            <b>{prova.id}</b>
            <small>{prova.titulo} · modo estudo</small>
          </div>
          {[1, 2, 3].map((p) => (
            <div className="nav-secao" key={p}>
              <div className="nav-secao-nome">
                {NOMES_PARTE[p].curto} · <span className="zh">{NOMES_PARTE[p].zh}</span>
              </div>
              <div className="nav-grade">
                {prova.questoes
                  .filter((x) => x.parte === p)
                  .map((x) => (
                    <button key={x.n} className={`nav-n ${status(x.n)} ${x.n === n ? "atual" : ""}`} onClick={() => vai(x.n)} title={`questão ${x.n}`}>
                      {x.n}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="nav-acoes">
            <a className="botao sec" href={`#/prova/${prova.id}`}>
              fazer no modo prova
            </a>
            <a className="link" href="#/regras">
              regras do HSKK
            </a>
          </div>
        </aside>
        <section className="painel">
          <div className="barra-ferramentas">
            <div className="caminho">
              <span className="secao-nome">
                {q ? `${NOMES_PARTE[q.parte].curto} · ${NOMES_PARTE[q.parte].pt}` : ""} <span className="zh">{q ? NOMES_PARTE[q.parte].zh : ""}</span>
              </span>
              <span className="parte">
                questão {n} de 14 · {prova.id}
              </span>
            </div>
            <div className="alternadores">
              <label className={`chave ${cfg.traducao ? "on" : ""}`} title="passe o mouse numa palavra para ver pinyin e tradução">
                <input type="checkbox" checked={cfg.traducao} onChange={(e) => mudaConfig({ traducao: e.target.checked })} />
                tradução <kbd>T</kbd>
              </label>
              <label className={`chave ${cfg.pinyin ? "on" : ""}`}>
                <input type="checkbox" checked={cfg.pinyin} onChange={(e) => mudaConfig({ pinyin: e.target.checked })} />
                pinyin <kbd>P</kbd>
              </label>
            </div>
          </div>
          {q && ehRepetir(q) && (
            <EstudoRepetir key={q.n} prova={prova} q={q} tent={tent} audio={audio} naRevisao={!!cartoes[idCartao(prova.id, q.n)]} />
          )}
          {q && !ehRepetir(q) && <EstudoFalar key={q.n} prova={prova} q={q as QuestaoFalar} tent={tent} />}
          <div className="rodape-questao">
            <button className="sec" onClick={() => vai(n - 1)} disabled={n <= 1}>
              ← anterior
            </button>
            <button className="sec" onClick={() => vai(n + 1)} disabled={n >= 14}>
              próxima →
            </button>
          </div>
          <div className="atalhos">
            atalhos: <kbd>G</kbd> gravar/parar · <kbd>T</kbd> tradução por hover · <kbd>P</kbd> pinyin · <kbd>←</kbd> <kbd>→</kbd> questões
          </div>
        </section>
      </div>
    </ProvedorLeitura>
  );
}

// ------------------------------------------------------------------ 第一部分

async function gravaNoEstudo(prova: Prova, q: Questao, blob: Blob, dur: number, ext: string) {
  const t = tentativaEstudo(prova.id);
  const arquivo = nomeGravacao(t.id, q.n, ext);
  const { soNaSessao } = await salvaGravacao(arquivo, blob);
  adicionaGravacao(t.id, q.n, { arquivo, dur, em: Date.now(), ...(soNaSessao ? { soNaSessao } : {}) });
}

function EstudoRepetir({ prova, q, tent, audio, naRevisao }: { prova: Prova; q: QuestaoRepetir; tent?: Tentativa; audio: ControleAudio | null; naRevisao: boolean }) {
  const cfg = useConfig();
  const gs = tent?.gravacoes[q.n] ?? [];
  const [revelado, setRevelado] = useState(cfg.textoAntes || gs.length > 0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);
  const { tocando } = useTempo(audio);
  const { s, e, p, rs } = q.t;

  const ouve = () => audio && s !== undefined && e !== undefined && void audio.toca(s, e);
  const comoNaProva = () => audio && void audio.toca(p, rs + 0.3);

  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "BUTTON") return;
      if (ev.key === " ") {
        ev.preventDefault();
        if (audio?.tocando) audio.pausa();
        else ouve();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const lista = [...gs].reverse();
  return (
    <div className="estudo-questao">
      <div className="cabecalho-questao">
        <span className="numero">{q.n}</span>
        <span className="instrucao">
          Ouça a frase e repita igualzinho. No exame ela toca <b>uma vez só</b>
          {prova.formato === "bip" ? " e você repete depois do 嘀 (~10 s)" : " e você repete logo em seguida (~7 s)"}.
        </span>
      </div>

      <div className="player-linha">
        <button className="btn-play grande" onClick={() => (tocando ? audio?.pausa() : ouve())} title="ouvir a frase (espaço)">
          {tocando ? "❚❚" : "▶"}
        </button>
        <div className="player-meio">
          <b>Áudio original da prova</b>
          <div className="player-botoes">
            <button onClick={ouve}>só a frase</button>
            <button onClick={comoNaProva}>como na prova (com o número{prova.formato === "bip" ? " e o 嘀" : ""})</button>
            <select value={cfg.velocidade} onChange={(ev) => mudaConfig({ velocidade: Number(ev.target.value) })} title="velocidade">
              {[0.6, 0.75, 0.9, 1].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bloco-texto">
        {revelado ? (
          <>
            <p className="frase-alvo">
              <Frase f={q.frase} fim1={e} />
            </p>
            <p className="py-linha">{q.frase.py.filter(Boolean).join(" ")}</p>
            {q.frase.pt && <p className="traducao">{q.frase.pt}</p>}
          </>
        ) : (
          <button className="link" onClick={() => setRevelado(true)}>
            tente primeiro só de ouvido — mostrar o texto
          </button>
        )}
      </div>

      <BotaoGravar
        limite={TEMPO_REPETIR}
        rotulo="Gravar e repetir"
        onPronto={(blob, dur, ext) => {
          setRevelado(true);
          void gravaNoEstudo(prova, q, blob, dur, ext);
        }}
      />

      {aviso && <div className="aviso">{aviso}</div>}

      {lista.length > 0 && (
        <div className="tentativas">
          <h3>Suas tentativas</h3>
          {(todas ? lista : lista.slice(0, 2)).map((g, i) => (
            <ItemGravacao
              key={g.arquivo}
              tentId={tent!.id}
              prova={prova}
              q={q}
              g={g}
              auto={i === 0}
              titulo={i === 0 ? "última" : undefined}
              onRevisao={() => setAviso(`Ficou abaixo de ${cfg.limiarRevisao}% — a frase foi para a revisão espaçada.`)}
            />
          ))}
          {lista.length > 2 && (
            <button className="link" onClick={() => setTodas(!todas)}>
              {todas ? "mostrar menos" : `ver as ${lista.length} tentativas`}
            </button>
          )}
        </div>
      )}

      <div className="linha-revisao">
        {naRevisao ? (
          <>
            ✓ esta frase está na <a href="#/revisao">revisão espaçada</a>.{" "}
            <button className="link" onClick={() => removeRevisao(prova.id, q.n)}>
              tirar
            </button>
          </>
        ) : (
          <button className="link" onClick={() => adicionaRevisao(prova, q)}>
            + mandar esta frase para a revisão espaçada
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 第二/三部分

function EstudoFalar({ prova, q, tent }: { prova: Prova; q: QuestaoFalar; tent?: Tentativa }) {
  const cfg = useConfig();
  const gs = tent?.gravacoes[q.n] ?? [];
  const [verModelos, setVerModelos] = useState(gs.length > 0);
  const [trad, setTrad] = useState(true);
  const [preparo, setPreparo] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const notas = tent?.notas?.[q.n] ?? "";
  const [rascunho, setRascunho] = useState(notas);

  useEffect(() => {
    if (preparo === null) return;
    const id = window.setInterval(() => setAgora(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [preparo]);
  const restaPreparo = preparo === null ? null : Math.max(0, TEMPO_PREPARO_ESTUDO - (agora - preparo) / 1000);

  const salvaNotas = (txt: string) => {
    const t = tentativaEstudo(prova.id);
    mudaTentativa(t.id, (x) => ({ ...x, notas: { ...(x.notas ?? {}), [q.n]: txt } }));
  };

  const lista = [...gs].reverse();
  return (
    <div className="estudo-questao">
      <div className="cabecalho-questao">
        <span className="numero">{q.n}</span>
        <span className="instrucao">
          {q.parte === 2 ? (
            <>
              Fale sobre a figura por <b>2 minutos</b>: o que está acontecendo, quem são, onde estão, como se sentem, o que aconteceu antes/depois — e
              ligue com a sua experiência.
            </>
          ) : (
            <>
              Responda à pergunta falando por <b>2 minutos</b>: resposta direta, razões com exemplos da sua vida e uma conclusão.
            </>
          )}
        </span>
      </div>

      {q.parte === 2 && q.img && (
        <figure className="figura">
          <img src={urlPublica(q.img)} alt={q.cena ?? `figura da questão ${q.n}`} />
          {q.cena && <figcaption>{q.cena}</figcaption>}
        </figure>
      )}
      {q.parte === 3 && q.pergunta && (
        <div className="pergunta-caderno">
          <p className="frase-alvo">
            <Frase f={q.pergunta} comPinyin />
          </p>
          {q.pergunta.pt && <p className="traducao">{q.pergunta.pt}</p>}
        </div>
      )}

      <div className="preparo-estudo">
        <div className="preparo-topo">
          <b>Preparação</b>
          {restaPreparo === null ? (
            <button className="sec" onClick={() => setPreparo(Date.now())}>
              ⏱ cronômetro de {formataTempo(TEMPO_PREPARO_ESTUDO)}
            </button>
          ) : (
            <span className={`relogio-grav ${restaPreparo < 20 ? "urgente" : ""}`}>
              {restaPreparo > 0 ? `⏱ ${formataTempo(restaPreparo)}` : "⏱ tempo de preparação acabou — grave!"}
              <button className="link" onClick={() => setPreparo(null)}>
                zerar
              </button>
            </span>
          )}
          <small>no exame são 10 min para preparar as 4 questões (≈ 2,5 min cada); dá para anotar no caderno</small>
        </div>
        <textarea
          className="notas-preparo zh"
          placeholder="anotações / tópicos (ex.: 谁？在哪儿？做什么？感觉？我的经历……)"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => rascunho !== notas && salvaNotas(rascunho)}
          rows={3}
        />
      </div>

      <BotaoGravar
        limite={TEMPO_FALA}
        regressivo
        rotulo="Responder (2 min)"
        onInicio={() => setPreparo(null)}
        onPronto={(blob, dur, ext) => {
          setVerModelos(true);
          void gravaNoEstudo(prova, q, blob, dur, ext);
        }}
      />

      {lista.length > 0 && (
        <div className="tentativas">
          <h3>Suas respostas</h3>
          {lista.slice(0, 3).map((g, i) => (
            <ItemGravacao key={g.arquivo} tentId={tent!.id} prova={prova} q={q} g={g} auto={i === 0} titulo={i === 0 ? "última" : undefined} />
          ))}
          <p className="dica-fala">
            Compare com as respostas-modelo: você falou os 2 minutos inteiros? Descreveu o que se vê <i>e</i> deu opinião/experiência? Usou conectivos (因为……所以、虽然……但是、首先……其次……)?
          </p>
        </div>
      )}

      <section className="modelos">
        <div className="modelos-topo">
          <h3>Respostas-modelo</h3>
          <span className="selo-gerado" title="escritas para estudo; não vêm da prova nem do órgão aplicador">
            GERADAS — exemplos, não oficiais
          </span>
          {verModelos && (
            <label className={`chave ${trad ? "on" : ""}`}>
              <input type="checkbox" checked={trad} onChange={(e) => setTrad(e.target.checked)} />
              tradução por frase
            </label>
          )}
        </div>
        {!verModelos ? (
          <p>
            Tente responder antes de ler.{" "}
            <button className="link" onClick={() => setVerModelos(true)}>
              mostrar mesmo assim
            </button>
          </p>
        ) : (
          <>
            {q.modelos.length === 0 && <p className="falta">Ainda sem respostas-modelo para esta questão.</p>}
            {q.modelos.map((m, i) => (
              <div className="modelo" key={i}>
                <div className="modelo-cabeca">
                  <span className="tag">nível {m.nivel}</span>
                  <small>{m.frases.reduce((s, f) => s + [...f.zh].filter((c) => /[㐀-鿿]/.test(c)).length, 0)} caracteres</small>
                </div>
                <div className={`modelo-texto ${trad ? "com-trad" : ""}`}>
                  {m.frases.map((f, k) => (
                    <div className="modelo-frase" key={k}>
                      <Frase f={f} />
                      {trad && f.pt && <div className="modelo-pt">{f.pt}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {cfg.traducao && <small className="dica-hover">passe o mouse nas palavras para ver pinyin e tradução</small>}
          </>
        )}
      </section>

      {verModelos && q.vocab.length > 0 && (
        <section className="vocab">
          <h3>Vocabulário útil</h3>
          <table className="tabela">
            <tbody>
              {q.vocab.map((v) => (
                <tr key={v.w}>
                  <td className="zh grande-zh">{v.w}</td>
                  <td className="py">{v.py}</td>
                  <td>{v.pt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {verModelos && q.estruturas.length > 0 && (
        <section className="estruturas">
          <h3>Estruturas que ajudam</h3>
          {q.estruturas.map((e, i) => (
            <div className="estrutura" key={i}>
              <div>
                <b className="zh">{e.zh}</b> — {e.pt}
              </div>
              {e.ex && (
                <div className="estrutura-ex">
                  <Frase f={e.ex} />
                  {e.ex.pt && <small>{e.ex.pt}</small>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
