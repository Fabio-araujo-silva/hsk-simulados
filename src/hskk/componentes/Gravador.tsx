import { useEffect, useRef, useState } from "react";
import { Gravacao, extensaoGravacao, mensagemMic, useMicrofone, useNivel } from "../microfone";
import { formataTempo } from "../dados";

/** Medidor do volume do microfone. */
export function Medidor({ ativo }: { ativo: boolean }) {
  const nivel = useNivel(ativo);
  return (
    <span className="medidor" aria-hidden>
      <span style={{ width: `${Math.round(nivel * 100)}%` }} />
    </span>
  );
}

/** Aviso + botão para liberar o microfone. */
export function AvisoMicrofone() {
  const mic = useMicrofone();
  const msg = mensagemMic(mic.estado);
  if (mic.estado === "pronto") return null;
  return (
    <div className={`aviso-mic ${msg ? "ruim" : ""}`}>
      {msg ?? "O app precisa do microfone para gravar suas respostas (fica tudo no seu computador)."}
      {mic.estado === "inicial" && (
        <button className="sec" onClick={() => void mic.pede()}>
          🎙 liberar microfone
        </button>
      )}
      {mic.estado === "negado" && (
        <button className="link" onClick={() => void mic.pede()}>
          tentar de novo
        </button>
      )}
    </div>
  );
}

interface Props {
  /** duração máxima (s) — para sozinho */
  limite: number;
  onPronto: (blob: Blob, dur: number, ext: string) => void;
  onInicio?: () => void;
  rotulo?: string;
  /** tecla de atalho (padrão: G) */
  atalho?: boolean;
  desabilitado?: boolean;
  /** contagem regressiva grande (partes 2 e 3) */
  regressivo?: boolean;
}

/** Botão de gravar/parar com cronômetro e medidor. Sem microfone, mostra o motivo e não quebra nada. */
export function BotaoGravar({ limite, onPronto, onInicio, rotulo = "Gravar", atalho = true, desabilitado, regressivo }: Props) {
  const mic = useMicrofone();
  const [rec, setRec] = useState<Gravacao | null>(null);
  const [seg, setSeg] = useState(0);
  const recRef = useRef<Gravacao | null>(null);
  recRef.current = rec;

  const para = async () => {
    const r = recRef.current;
    if (!r) return;
    setRec(null);
    const { blob, dur } = await r.para();
    if (blob.size > 0) onPronto(blob, dur, r.ext);
  };

  const inicia = async () => {
    if (recRef.current || desabilitado) return;
    const s = await mic.pede();
    if (!s) return;
    try {
      const g = new Gravacao(s);
      setSeg(0);
      setRec(g);
      onInicio?.();
    } catch (e) {
      console.error("não consegui gravar", e);
    }
  };

  useEffect(() => {
    if (!rec) return;
    const id = window.setInterval(() => {
      setSeg(rec.segundos);
      if (rec.segundos >= limite) void para();
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, limite]);

  // para a gravação se o componente sair da tela
  useEffect(() => () => void recRef.current?.para(), []);

  useEffect(() => {
    if (!atalho) return;
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        if (recRef.current) void para();
        else void inicia();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const msg = mensagemMic(mic.estado);
  const resta = Math.max(0, limite - seg);
  return (
    <div className="gravador">
      {rec ? (
        <>
          <button className="btn-gravar gravando" onClick={() => void para()}>
            ■ Parar {atalho && <kbd>G</kbd>}
          </button>
          <span className={`relogio-grav ${regressivo && resta < 15 ? "urgente" : ""}`}>
            ● {regressivo ? formataTempo(resta) : `${formataTempo(seg)} / ${formataTempo(limite)}`}
          </span>
          <Medidor ativo />
        </>
      ) : (
        <>
          <button className="btn-gravar" onClick={() => void inicia()} disabled={desabilitado || mic.estado === "indisponivel" || mic.estado === "pedindo"}>
            🎙 {rotulo} {atalho && <kbd>G</kbd>}
          </button>
          {mic.estado === "inicial" && <small className="nota-mic">o navegador vai pedir o microfone</small>}
        </>
      )}
      {msg && <div className="aviso-mic ruim">{msg}</div>}
    </div>
  );
}

export const extensao = extensaoGravacao;
