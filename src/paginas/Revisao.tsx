import { useEffect, useMemo, useRef, useState } from "react";
import { ControleAudio } from "../audio";
import { contaNovoHoje, hojeChave, salvaCartoes, useConfig, useEstado } from "../armazenamento";
import { confere } from "../correcao";
import { carregaLexico, carregaProva, urlPublica } from "../dados";
import { Frase, ProvedorLeitura } from "../componentes/Leitura";
import { instrucao, VisaoQuestao } from "../componentes/Questao";
import { NOTAS, previas, revisa, ehNovo } from "../srs";
import type { Cartao, Lexico, Prova } from "../tipos";

const ANTECIPA_MS = 20 * 60 * 1000; // aprendendo: pode antecipar até 20 min se não houver mais nada

export function PaginaRevisao() {
  const cartoes = useEstado((e) => e.cartoes);
  const novosHoje = useEstado((e) => e.novosHoje[hojeChave()] ?? 0);
  const cfg = useConfig();
  const [agora, setAgora] = useState(Date.now());
  const [antecipar, setAntecipar] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const fila = useMemo(() => {
    const lista = Object.values(cartoes);
    const limite = antecipar ? agora + ANTECIPA_MS : agora;
    const revisoes = lista.filter((c) => !ehNovo(c) && c.srs.due <= limite).sort((a, b) => a.srs.due - b.srs.due);
    const vagas = Math.max(0, cfg.novosPorDia - novosHoje);
    const novos = lista.filter(ehNovo).sort((a, b) => a.criado - b.criado).slice(0, vagas);
    // intercala: 1 novo a cada 3 revisões
    const out: Cartao[] = [];
    let i = 0;
    let j = 0;
    while (i < revisoes.length || j < novos.length) {
      for (let k = 0; k < 3 && i < revisoes.length; k++) out.push(revisoes[i++]);
      if (j < novos.length) out.push(novos[j++]);
    }
    return out;
  }, [cartoes, agora, antecipar, cfg.novosPorDia, novosHoje]);

  const proximo = useMemo(() => {
    const futuros = Object.values(cartoes).filter((c) => !ehNovo(c) && c.srs.due > agora);
    return futuros.length ? Math.min(...futuros.map((c) => c.srs.due)) : null;
  }, [cartoes, agora]);

  const total = Object.keys(cartoes).length;
  const atual = fila[0];

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
        {proximo && proximo - agora < ANTECIPA_MS && !antecipar && (
          <button className="sec" onClick={() => setAntecipar(true)}>
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
    a = new ControleAudio(urlPublica(prova.audio.src));
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
