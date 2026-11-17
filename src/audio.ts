import { useEffect, useState } from "react";

/**
 * Controla o <audio> da prova: tocar um trecho [s, e], pular para uma palavra,
 * velocidade, e avisar o tempo atual para a legenda "karaokê".
 */
export class ControleAudio {
  el: HTMLAudioElement;
  private limite: number | null = null;
  private raf = 0;
  private ouvintes = new Set<() => void>();
  /** trecho em reprodução (para o realce saber qual leitura está tocando) */
  trecho: { s: number; e: number } | null = null;

  constructor(src: string) {
    this.el = new Audio(src);
    this.el.preload = "auto";
    this.el.addEventListener("play", () => this.loop());
    this.el.addEventListener("pause", () => this.avisa());
    this.el.addEventListener("ended", () => {
      this.limite = null;
      this.avisa();
    });
    this.el.addEventListener("seeked", () => this.avisa());
    this.el.addEventListener("loadedmetadata", () => this.avisa());
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    const passo = () => {
      if (this.limite !== null && this.el.currentTime >= this.limite) {
        this.el.pause();
        this.limite = null;
        this.trecho = null;
      }
      this.avisa();
      if (!this.el.paused) this.raf = requestAnimationFrame(passo);
    };
    this.raf = requestAnimationFrame(passo);
  };

  private avisa() {
    this.ouvintes.forEach((o) => o());
  }

  assina(o: () => void) {
    this.ouvintes.add(o);
    return () => {
      this.ouvintes.delete(o);
    };
  }

  get tempo() {
    return this.el.currentTime;
  }
  get tocando() {
    return !this.el.paused;
  }
  get duracao() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }

  /** Toca de `s` até `e` (ou até o fim, se `e` for null). */
  async toca(s: number, e: number | null = null) {
    this.limite = e;
    this.trecho = e !== null ? { s, e } : null;
    this.el.currentTime = Math.max(0, s);
    try {
      await this.el.play();
    } catch (err) {
      console.warn("áudio bloqueado pelo navegador", err);
    }
  }

  /** Continua de onde parou (respeitando o limite atual). */
  async continua() {
    try {
      await this.el.play();
    } catch (err) {
      console.warn(err);
    }
  }

  pausa() {
    this.el.pause();
  }

  velocidade(v: number) {
    this.el.playbackRate = v;
    this.el.preservesPitch = true;
  }

  destroi() {
    cancelAnimationFrame(this.raf);
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.ouvintes.clear();
  }
}

/** Re-renderiza quando o tempo do áudio muda (no máx. ~20×/s). */
export function useTempo(ctrl: ControleAudio | null | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ctrl) return;
    let ultimo = 0;
    return ctrl.assina(() => {
      const agora = performance.now();
      if (agora - ultimo > 50 || !ctrl.tocando) {
        ultimo = agora;
        setTick((t) => t + 1);
      }
    });
  }, [ctrl]);
  return ctrl ? { tempo: ctrl.tempo, tocando: ctrl.tocando, trecho: ctrl.trecho } : { tempo: 0, tocando: false, trecho: null };
}
