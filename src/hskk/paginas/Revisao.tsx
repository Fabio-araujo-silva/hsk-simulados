import { useEffect, useMemo, useState } from "react";
import { useFilaRevisao } from "../../filaRevisao";
import { ControleAudio, useTempo } from "../../audio";
import { contaNovoHoje, hojeChave, salvaCartoes, useConfig, useEstado } from "../armazenamento";
import { Comparacao } from "../componentes/Comparacao";
import { BotaoGravar } from "../componentes/Gravador";
import { Frase, ProvedorLeitura } from "../../componentes/Leitura";
import { AdicionaPalavras } from "../../componentes/AdicionaPalavras";
import { carregaLexico, carregaProva, TEMPO_REPETIR, urlMidia } from "../dados";
import { salvaGravacao, SEM_TRANSCRICAO, transcreve } from "../gravacoes";
import { MODO_PUBLICO } from "../../publico";
import { NOTAS, previas, revisa, ehNovo } from "../../srs";
import type { Cartao, Lexico, Prova } from "../tipos";
import "../hskk.css";

/** Revisão espaçada das frases orais (第一部分) — aparece na página Revisão do app, aba "Oral (HSKK)". */
export function RevisaoOral() {
  const cartoes = useEstado((e) => e.cartoes);
  const novosHoje = useEstado((e) => e.novosHoje[hojeChave()] ?? 0);
  const cfg = useConfig();
  const { fila, atual, proximo, podeAntecipar, antecipa } = useFilaRevisao(cartoes, novosHoje, cfg.novosPorDia);
  const total = Object.keys(cartoes).length;

  if (!total) {
    return (
      <div className="vazio">
        <h1>Revisão espaçada</h1>
        <p>
          Ainda não há frases na revisão. Elas entram aqui sozinhas quando você repete uma frase do 第一部分 com menos de {cfg.limiarRevisao}% de acerto
          (no modo estudo ou na revisão de uma prova) — ou quando você manda na mão.
        </p>
        <a className="botao pri" href="#/hskk">
          ir para as provas do HSKK
        </a>
      </div>
    );
  }

  if (!atual) {
    return (
      <div className="vazio">
        <h1>Tudo revisado por agora 🎉</h1>
        <p>
          {total} frases no total.{" "}
          {proximo && `Próxima revisão: ${new Date(proximo).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`}
        </p>
        {podeAntecipar && (
          <button className="sec" onClick={antecipa}>
            revisar as que vencem nos próximos minutos
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="revisao">
      <div className="revisao-topo">
        <span>
          {fila.length} na fila · {fila.filter(ehNovo).length} novas
        </span>
        <a href="#/hskk/cartoes">ver todas as frases</a>
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

/** Frente: ouvir o áudio original e repetir (dá para gravar e conferir). Verso: texto, pinyin e tradução. */
function SessaoCartao({ cartao }: { cartao: Cartao }) {
  const cfg = useConfig();
  const [prova, setProva] = useState<Prova | null>(null);
  const [lexico, setLexico] = useState<Lexico | null>(null);
  const [virado, setVirado] = useState(false);
  const [dito, setDito] = useState<string | null>(null);
  const [estadoTr, setEstadoTr] = useState<"" | "transcrevendo" | "erro">("");
  const [urlMinha, setUrlMinha] = useState<string | null>(null);
  const audio = audioDe(prova);
  const { tocando } = useTempo(audio);
  const prev = useMemo(() => previas(cartao), [cartao]);

  useEffect(() => {
    carregaProva(cartao.origem.prova).then(setProva).catch(() => setProva(null));
    carregaLexico().then(setLexico).catch(() => setLexico({}));
  }, [cartao.origem.prova]);

  useEffect(() => () => audio?.pausa(), [audio]);
  useEffect(
    () => () => {
      if (urlMinha) URL.revokeObjectURL(urlMinha);
    },
    [urlMinha],
  );

  const ouve = () => {
    if (cartao.audio && audio) void audio.toca(cartao.audio.s, cartao.audio.e);
  };
  // toca o áudio da frente sozinho
  useEffect(() => {
    if (audio && cartao.audio) {
      audio.velocidade(cfg.velocidade);
      void audio.toca(cartao.audio.s, cartao.audio.e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, cartao.id]);

  const nota = (n: (typeof NOTAS)[number]["nota"]) => {
    if (ehNovo(cartao)) contaNovoHoje();
    salvaCartoes([revisa(cartao, n)]);
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA") return;
      if (!virado && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setVirado(true);
        return;
      }
      if (e.key === "r" || e.key === "R") ouve();
      if (virado) {
        const n = NOTAS.find((x) => x.tecla === e.key);
        if (n) nota(n.nota);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const gravou = async (blob: Blob, ext: string) => {
    setUrlMinha(URL.createObjectURL(blob));
    setVirado(true);
    // site público: sem transcrição — você ouve a sua gravação e o original e dá a nota
    if (MODO_PUBLICO) return setEstadoTr("erro");
    setEstadoTr("transcrevendo");
    try {
      const arquivo = `revisao-${cartao.origem.prova}-q${cartao.origem.n}-${Date.now().toString(36)}.${ext}`;
      const { soNaSessao } = await salvaGravacao(arquivo, blob);
      if (soNaSessao) throw new Error("sem o servidor local não dá para transcrever");
      const tr = await transcreve(arquivo);
      setDito(tr.texto);
      setEstadoTr("");
    } catch {
      setEstadoTr("erro");
    }
  };

  return (
    <ProvedorLeitura lexico={lexico} traducao={virado && cfg.traducao} pinyin={virado && cfg.pinyin} audio={audio}>
      <div className="cartao-sessao tipo-frase">
        <div className="cartao-origem">
          frase do 第一部分 · {cartao.origem.prova} nº {cartao.origem.n}
          {cartao.pct !== undefined && ` · entrou com ${cartao.pct}%`}
          {ehNovo(cartao) && <span className="tag">nova</span>}
        </div>
        <div className="frente-frase">
          {cartao.audio && (
            <button className="btn-play grande" onClick={() => (tocando ? audio?.pausa() : ouve())} title="ouvir de novo (R)">
              {tocando ? "❚❚" : "▶"}
            </button>
          )}
          {!virado && <p className="instrucao">Ouça e repita em voz alta, igualzinho. Se quiser, grave para o app conferir.</p>}
          {!virado && <BotaoGravar limite={TEMPO_REPETIR} rotulo="Gravar minha repetição" onPronto={(b, _d, e) => void gravou(b, e)} />}
          {virado && (
            <>
              <p className="frase-grande">
                <Frase f={cartao.frase} fim1={cartao.audio?.e} />
              </p>
              <p className="py-linha">{cartao.frase.py.filter(Boolean).join(" ")}</p>
              <p className="traducao">{cartao.frase.pt}</p>
              {urlMinha && <audio controls src={urlMinha} />}
              {estadoTr === "transcrevendo" && <small className="carregando">transcrevendo…</small>}
              {estadoTr === "erro" && (
                <small className="falta">{MODO_PUBLICO ? `${SEM_TRANSCRICAO}.` : "não deu para transcrever agora (precisa do servidor local e da chave no .env)"}</small>
              )}
              {dito !== null && <Comparacao alvo={cartao.frase.zh} dito={dito} limiar={cfg.limiarRevisao} />}
              {/* as palavras viram cartões da revisão do HSK (leitura e escrita) */}
              <AdicionaPalavras frases={[cartao.frase]} origem={cartao.origem} lexico={lexico} />
            </>
          )}
        </div>

        {!virado && (
          <button className="pri grande" onClick={() => setVirado(true)}>
            mostrar a frase <kbd>espaço</kbd>
          </button>
        )}

        {virado && (
          <div className="notas">
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
