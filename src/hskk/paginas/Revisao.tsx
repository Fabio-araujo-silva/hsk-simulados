import { useEffect, useMemo, useState } from "react";
import { ControleAudio, useTempo } from "../../audio";
import { contaNovoHoje, hojeChave, salvaCartoes, useConfig, useEstado } from "../armazenamento";
import { Comparacao } from "../componentes/Comparacao";
import { BotaoGravar } from "../componentes/Gravador";
import { Frase, ProvedorLeitura } from "../../componentes/Leitura";
import { carregaLexico, carregaProva, TEMPO_REPETIR, urlPublica } from "../dados";
import { salvaGravacao, transcreve } from "../gravacoes";
import { NOTAS, previas, revisa, ehNovo } from "../../srs";
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
    // intercala: 1 nova a cada 3 revisões
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
        <p>
          Ainda não há frases na revisão. Elas entram aqui sozinhas quando você repete uma frase do 第一部分 com menos de {cfg.limiarRevisao}% de acerto
          (no modo estudo ou na revisão de uma prova) — ou quando você manda na mão.
        </p>
        <a className="botao pri" href="#/">
          ir para as provas
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
        {proximo && proximo - agora < ANTECIPA_MS && !antecipar && (
          <button className="sec" onClick={() => setAntecipar(true)}>
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
        <a href="#/cartoes">ver todas as frases</a>
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
    setEstadoTr("transcrevendo");
    setVirado(true);
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
              {estadoTr === "erro" && <small className="falta">não deu para transcrever agora (precisa do servidor local e da chave no .env)</small>}
              {dito !== null && <Comparacao alvo={cartao.frase.zh} dito={dito} limiar={cfg.limiarRevisao} />}
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
