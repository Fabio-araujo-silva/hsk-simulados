import { useEffect, useMemo, useRef, useState } from "react";
import { useFilaRevisao } from "../filaRevisao";
import { ControleAudio } from "../audio";
import { contaNovoHoje, hojeChave, salvaCartoes, useConfig, useEstado } from "../armazenamento";
import { confere } from "../correcao";
import { carregaLexico, carregaProva, urlMidia } from "../dados";
import { Frase, ProvedorLeitura } from "../componentes/Leitura";
import { instrucao, VisaoQuestao } from "../componentes/Questao";
import { NOTAS, previas, revisa, ehNovo } from "../srs";
import type { Cartao, Lexico, Prova } from "../tipos";
import { AbasRevisao, type Aba } from "../componentes/AbasRevisao";
import { usePendentes } from "../pendentes";
import { useEstado as useEstadoHskk } from "../hskk/armazenamento";
import { RevisaoOral } from "../hskk/paginas/Revisao";

/**
 * Revisão espaçada do app: a do HSK (leitura e escrita) e, quando houver frases orais do HSKK, uma escolha no topo.
 * Cada parte tem os seus cartões e o seu limite de novos por dia. Sem `aba`, abre na que tem o que revisar.
 */
export function PaginaRevisao({ aba: pedida }: { aba?: Aba }) {
  const pend = usePendentes();
  const temOral = useEstadoHskk((e) => Object.keys(e.cartoes).length > 0);
  const [aba, setAba] = useState<Aba>(() => pedida ?? (pend.hsk === 0 && pend.hskk > 0 ? "hskk" : "hsk"));
  return (
    <>
      {(temOral || aba === "hskk") && (
        <div className="revisao">
          <AbasRevisao aba={aba} muda={setAba} hsk={pend.hsk} hskk={pend.hskk} titulo="para revisar agora" />
        </div>
      )}
      {aba === "hskk" ? (
        <div className="hskk">
          <RevisaoOral />
        </div>
      ) : (
        <RevisaoHsk />
      )}
    </>
  );
}

function RevisaoHsk() {
  const cartoes = useEstado((e) => e.cartoes);
  const novosHoje = useEstado((e) => e.novosHoje[hojeChave()] ?? 0);
  const cfg = useConfig();
  const { fila, atual, proximo, podeAntecipar, antecipa } = useFilaRevisao(cartoes, novosHoje, cfg.novosPorDia);
  const total = Object.keys(cartoes).length;

  if (!total) {
    return (
      <div className="vazio">
        <h1>Revisão espaçada</h1>
        <p>Você ainda não tem cartões. Eles nascem das questões que você erra (ou marca) no modo estudo e no resultado das provas.</p>
        <a className="botao pri" href="#/">
          ir para os simulados
        </a>
      </div>
    );
  }

  if (!atual) {
    return (
      <div className="vazio">
        <h1>Tudo revisado por agora 🎉</h1>
        <p>
          {total} cartões no total.{" "}
          {proximo && `Próxima revisão: ${new Date(proximo).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`}
        </p>
        {podeAntecipar && (
          <button className="sec" onClick={antecipa}>
            revisar os que vencem nos próximos minutos
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="revisao">
      <div className="revisao-topo">
        <span>
          {fila.length} na fila · {fila.filter(ehNovo).length} novos
        </span>
        <a href="#/cartoes">gerenciar cartões</a>
      </div>
      <SessaoCartao key={atual.id + atual.srs.reps + atual.srs.due} cartao={atual} />
    </div>
  );
}

const audios = new Map<string, ControleAudio>();
function audioDe(prova: Prova | null) {
  if (!prova?.audio) return null;
  let a = audios.get(prova.id);
  if (!a) {
    a = new ControleAudio(urlMidia(prova.audio.src));
    audios.set(prova.id, a);
  }
  return a;
}

function SessaoCartao({ cartao }: { cartao: Cartao }) {
  const cfg = useConfig();
  const [prova, setProva] = useState<Prova | null>(null);
  const [lexico, setLexico] = useState<Lexico | null>(null);
  const [virado, setVirado] = useState(false);
  const [valor, setValor] = useState<string | boolean | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const audio = audioDe(prova);
  const prev = useMemo(() => previas(cartao), [cartao]);
  const inicio = useRef(Date.now());

  useEffect(() => {
    carregaProva(cartao.origem.prova).then(setProva).catch(() => setProva(null));
    carregaLexico().then(setLexico).catch(() => setLexico({}));
  }, [cartao.origem.prova]);

  useEffect(() => () => audio?.pausa(), [audio]);

  // toca o áudio da frente automaticamente
  useEffect(() => {
    if (!audio) return;
    if (cartao.tipo === "frase" && cartao.audio) audio.toca(cartao.audio.s, cartao.audio.e);
  }, [audio, cartao]);

  const nota = (n: (typeof NOTAS)[number]["nota"]) => {
    if (ehNovo(cartao)) contaNovoHoje();
    salvaCartoes([revisa(cartao, n)]);
    void inicio;
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA") return;
      if (!virado && (e.key === " " || e.key === "Enter") && cartao.tipo !== "questao") {
        e.preventDefault();
        setVirado(true);
        return;
      }
      if (virado) {
        const n = NOTAS.find((x) => x.tecla === e.key);
        if (n) nota(n.nota);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const q = cartao.tipo === "questao" && prova ? prova.questoes.find((x) => x.n === cartao.origem.n) : undefined;
  const acertou = q && valor !== null ? confere(q, valor) : null;

  return (
    <ProvedorLeitura lexico={lexico} traducao={virado} pinyin={virado && cfg.pinyin} audio={audio}>
      <div className={`cartao-sessao tipo-${cartao.tipo}`}>
        <div className="cartao-origem">
          {cartao.tipo === "questao" ? "questão" : cartao.tipo} · {cartao.origem.prova} nº {cartao.origem.n}
          {ehNovo(cartao) && <span className="tag">novo</span>}
        </div>

        {cartao.tipo === "questao" && (
          <>
            {!prova && <div className="carregando">carregando questão…</div>}
            {q && (
              <>
                <div className="cabecalho-questao">
                  <span className="numero">{q.n}</span>
                  <span className="instrucao">{instrucao(q, prova?.nivel)}</span>
                </div>
                <VisaoQuestao
                  prova={prova!}
                  q={q}
                  valor={valor}
                  revelado={virado}
                  modo="revisao"
                  audio={audio}
                  autoTocar
                  onResponde={
                    virado
                      ? undefined
                      : (v) => {
                          setValor(v);
                          setVirado(true);
                        }
                  }
                />
                {!virado && (
                  <button className="link" onClick={() => setVirado(true)}>
                    não sei — mostrar resposta
                  </button>
                )}
              </>
            )}
          </>
        )}

        {cartao.tipo === "frase" && cartao.frase && (
          <div className="frente-frase">
            {cartao.audio && (
              <button className="btn-play grande" onClick={() => audio?.toca(cartao.audio!.s, cartao.audio!.e)}>
                ▶
              </button>
            )}
            {cartao.audio && !virado && !verTexto ? (
              <button className="link" onClick={() => setVerTexto(true)}>
                entendeu pelo áudio? se precisar, ver o texto
              </button>
            ) : (
              <p className="frase-grande">
                <Frase f={cartao.frase} fim1={cartao.audio?.e} />
              </p>
            )}
            {virado && (
              <>
                <p className="py-linha">{cartao.frase.py.filter(Boolean).join(" ")}</p>
                <p className="traducao">{cartao.frase.pt}</p>
              </>
            )}
          </div>
        )}

        {cartao.tipo === "palavra" && (
          <div className="frente-palavra">
            <div className="palavra-grande zh">{cartao.palavra}</div>
            {cartao.frase && (
              <p className="exemplo">
                <Frase f={cartao.frase} destaque={cartao.palavra} fim1={cartao.audio?.e} />
              </p>
            )}
            {virado && (
              <div className="verso-palavra">
                <div className="py-grande">{cartao.py ?? lexico?.[cartao.palavra ?? ""]?.py}</div>
                <div className="traducao">{lexico?.[cartao.palavra ?? ""]?.pt ?? cartao.pt}</div>
                <div className="botoes-audio">
                  {cartao.audioPalavra && (
                    <button className="sec" onClick={() => audio?.toca(cartao.audioPalavra!.s, cartao.audioPalavra!.e)}>
                      ▶ palavra (áudio da prova)
                    </button>
                  )}
                  {cartao.audio && (
                    <button className="sec" onClick={() => audio?.toca(cartao.audio!.s, cartao.audio!.e)}>
                      ▶ frase
                    </button>
                  )}
                </div>
                {cartao.frase?.pt && <p className="traducao-exemplo">{cartao.frase.pt}</p>}
              </div>
            )}
          </div>
        )}

        {!virado && cartao.tipo !== "questao" && (
          <button className="pri grande" onClick={() => setVirado(true)}>
            mostrar resposta <kbd>espaço</kbd>
          </button>
        )}

        {virado && (
          <div className="notas">
            {acertou === false && <div className="dica-nota">Você errou — o normal aqui é “De novo”.</div>}
            {NOTAS.map((n) => (
              <button key={n.nota} className={`nota nota-${n.nota}`} onClick={() => nota(n.nota)}>
                <b>{n.rotulo}</b>
                <small>
                  {prev[n.nota]} · <kbd>{n.tecla}</kbd>
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </ProvedorLeitura>
  );
}
