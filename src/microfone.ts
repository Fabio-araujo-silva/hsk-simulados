import { useEffect, useState, useSyncExternalStore } from "react";

// Microfone compartilhado pelo app inteiro: pede a permissão uma vez e reaproveita o mesmo stream.
// Se o navegador não tiver MediaRecorder, ou a permissão for negada, o app continua funcionando sem gravar.

export type EstadoMic = "inicial" | "pedindo" | "pronto" | "negado" | "indisponivel";

let stream: MediaStream | null = null;
let estado: EstadoMic = typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof MediaRecorder !== "undefined" ? "inicial" : "indisponivel";
let erroMic = "";
const ouvintes = new Set<() => void>();
const muda = (e: EstadoMic) => {
  estado = e;
  ouvintes.forEach((o) => o());
};

export async function pedeMicrofone(): Promise<MediaStream | null> {
  if (stream && stream.getAudioTracks().some((t) => t.readyState === "live")) return stream;
  if (estado === "indisponivel") return null;
  muda("pedindo");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    muda("pronto");
    return stream;
  } catch (e) {
    erroMic = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    stream = null;
    muda(e instanceof DOMException && (e.name === "NotFoundError" || e.name === "NotSupportedError") ? "indisponivel" : "negado");
    return null;
  }
}

export function useMicrofone() {
  const e = useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => estado,
  );
  return { estado: e, erro: erroMic, pede: pedeMicrofone };
}

/** Explicação para o usuário quando não dá para gravar. */
export function mensagemMic(e: EstadoMic): string | null {
  if (e === "negado") return "O navegador não deixou usar o microfone. Libere a permissão no ícone do cadeado na barra de endereço e recarregue a página.";
  if (e === "indisponivel")
    return "Não achei microfone (ou este navegador não grava áudio). Dá para continuar sem gravar — use Chrome, Edge ou Firefox com um microfone ligado para gravar.";
  return null;
}

function tipoSuportado(): { mime: string; ext: string } {
  const opcoes = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/mp4", ext: "mp4" },
  ];
  for (const o of opcoes) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(o.mime)) return o;
  return { mime: "", ext: "webm" };
}

export const extensaoGravacao = () => tipoSuportado().ext;

/** Uma gravação. `para()` devolve o áudio e a duração (s). */
export class Gravacao {
  private rec: MediaRecorder;
  private partes: Blob[] = [];
  private inicio = performance.now();
  private pausadoEm: number | null = null;
  private pausado = 0;
  private fim: Promise<Blob>;
  readonly ext: string;

  constructor(s: MediaStream) {
    const t = tipoSuportado();
    this.ext = t.ext;
    this.rec = t.mime ? new MediaRecorder(s, { mimeType: t.mime }) : new MediaRecorder(s);
    this.fim = new Promise((ok) => {
      this.rec.ondataavailable = (ev) => ev.data.size && this.partes.push(ev.data);
      this.rec.onstop = () => ok(new Blob(this.partes, { type: this.rec.mimeType || t.mime || "audio/webm" }));
    });
    this.rec.start(1000);
  }

  get segundos() {
    const agora = this.pausadoEm ?? performance.now();
    return (agora - this.inicio - this.pausado) / 1000;
  }

  pausa() {
    if (this.rec.state === "recording") {
      this.rec.pause();
      this.pausadoEm = performance.now();
    }
  }

  continua() {
    if (this.rec.state === "paused") {
      this.rec.resume();
      if (this.pausadoEm) this.pausado += performance.now() - this.pausadoEm;
      this.pausadoEm = null;
    }
  }

  async para(): Promise<{ blob: Blob; dur: number }> {
    const dur = this.segundos;
    if (this.rec.state !== "inactive") this.rec.stop();
    return { blob: await this.fim, dur: Math.round(dur * 10) / 10 };
  }
}

/** Nível do microfone (0–1), para o medidor que mostra que a voz está chegando. */
export function useNivel(ativo: boolean) {
  const [nivel, setNivel] = useState(0);
  useEffect(() => {
    if (!ativo || !stream) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let ultimo = 0;
      const passo = (t: number) => {
        an.getByteTimeDomainData(buf);
        let pico = 0;
        for (const v of buf) pico = Math.max(pico, Math.abs(v - 128));
        if (t - ultimo > 80) {
          ultimo = t;
          setNivel(Math.min(1, pico / 70));
        }
        raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
    } catch {
      /* sem medidor: tudo bem */
    }
    return () => {
      cancelAnimationFrame(raf);
      void ctx?.close();
      setNivel(0);
    };
  }, [ativo]);
  return nivel;
}
