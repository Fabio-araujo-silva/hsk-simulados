import { useEffect, useState, useSyncExternalStore } from "react";
import type { TrechoAudio } from "./tipos";

// ------------------------------------------------- áudio bloqueado pelo navegador
// Celular (principalmente iPhone) só deixa tocar som a partir de um toque. Se um play() for recusado, o app mostra
// um aviso com um botão para tocar (componentes/AvisoAudioBloqueado) em vez de ficar mudo sem explicação.
let bloqueado: ControleAudio | null = null;
const ouvintesBloqueio = new Set<() => void>();
function marcaBloqueio(c: ControleAudio | null) {
  if (bloqueado === c) return;
  bloqueado = c;
  ouvintesBloqueio.forEach((o) => o());
}

/** Fecha o aviso de áudio bloqueado sem tocar. */
export const dispensaAvisoBloqueio = () => marcaBloqueio(null);

/** O controle de áudio cujo último play() o navegador recusou (ou null). */
export function useAudioBloqueado() {
  return useSyncExternalStore(
    (o) => {
      ouvintesBloqueio.add(o);
      return () => ouvintesBloqueio.delete(o);
    },
    () => bloqueado,
  );
}

/** Eventos que contam como "o usuário tocou na página" (só neles o iPhone libera o primeiro play de um áudio). */
const GESTOS = ["touchend", "pointerup", "keydown"] as const;

/**
 * Controla o <audio> da prova: tocar um trecho [s, e], pular para uma palavra,
 * velocidade, e avisar o tempo atual para a legenda "karaokê".
 */
export class ControleAudio {
  el: HTMLAudioElement;
  private limite: number | null = null;
  private raf = 0;
  private timer = 0;
  /** posição pedida antes de o arquivo carregar (o iPhone ignora o currentTime nesse momento) */
  private alvoPendente: number | null = null;
  private destravado = false;
  private ouvintes = new Set<() => void>();
  /** trecho em reprodução (para o realce saber qual leitura está tocando) */
  trecho: { s: number; e: number } | null = null;

  constructor(src: string) {
    this.el = new Audio(src);
    this.el.preload = "auto";
    this.el.addEventListener("play", () => {
      this.destravado = true;
      if (bloqueado === this) marcaBloqueio(null);
      this.loop();
      this.agendaLimite();
    });
    this.el.addEventListener("pause", () => {
      window.clearTimeout(this.timer);
      this.avisa();
    });
    this.el.addEventListener("ended", () => {
      this.limite = null;
      this.trecho = null;
      this.avisa();
    });
    this.el.addEventListener("seeked", () => {
      this.agendaLimite();
      this.avisa();
    });
    this.el.addEventListener("ratechange", () => this.agendaLimite());
    // o requestAnimationFrame para com a tela bloqueada ou a aba em segundo plano; o timeupdate e o timer, não
    this.el.addEventListener("timeupdate", () => this.confereLimite());
    this.el.addEventListener("loadedmetadata", () => {
      const alvo = this.alvoPendente;
      this.alvoPendente = null;
      if (alvo !== null && Math.abs(this.el.currentTime - alvo) > 0.25) this.el.currentTime = alvo;
      this.avisa();
    });
    GESTOS.forEach((g) => window.addEventListener(g, this.destrava, { capture: true, passive: true }));
  }

  /**
   * iPhone: um áudio só pode tocar sozinho (tocar ao abrir a questão, começar a prova…) depois de ter tocado uma vez
   * dentro de um toque. No primeiro toque na página, um play+pause instantâneo (sem som) libera este áudio.
   */
  private destrava = () => {
    GESTOS.forEach((g) => window.removeEventListener(g, this.destrava, { capture: true }));
    if (this.destravado || !this.el.paused) return;
    this.destravado = true;
    const p = this.el.play();
    this.el.pause();
    p?.catch(() => {});
  };

  private confereLimite() {
    if (this.limite !== null && this.el.currentTime >= this.limite) {
      this.el.pause();
      this.limite = null;
      this.trecho = null;
    }
  }

  /** Timer até o fim do trecho: garante a parada mesmo sem requestAnimationFrame (tela bloqueada, outra aba). */
  private agendaLimite() {
    window.clearTimeout(this.timer);
    if (this.limite === null || this.el.paused) return;
    const falta = (this.limite - this.el.currentTime) / (this.el.playbackRate || 1);
    this.timer = window.setTimeout(
      () => {
        this.confereLimite();
        this.agendaLimite();
      },
      Math.max(15, falta * 1000),
    );
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    const passo = () => {
      this.confereLimite();
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

  private async play() {
    try {
      await this.el.play();
    } catch (err) {
      const nome = (err as DOMException | undefined)?.name;
      if (nome === "NotAllowedError") marcaBloqueio(this);
      // AbortError = um pause() chegou antes do play terminar (ex.: dois toques rápidos): não é problema
      else if (nome !== "AbortError") console.warn("não consegui tocar o áudio", err);
    }
  }

  /** Toca de `s` até `e` (ou até o fim, se `e` for null). */
  async toca(s: number, e: number | null = null) {
    this.limite = e;
    this.trecho = e !== null ? { s, e } : null;
    const alvo = Math.max(0, s);
    if (this.el.readyState < HTMLMediaElement.HAVE_METADATA) this.alvoPendente = alvo;
    this.el.currentTime = alvo;
    await this.play();
  }

  /**
   * Continua de onde parou. Se o trecho em curso ainda não acabou, para no fim dele; senão toca até `ate`
   * (null = até o fim do áudio). Com `soltaTrecho`, esquece o trecho em curso e vale só o `ate`.
   */
  async continua(ate: number | null = null, soltaTrecho = false) {
    const emCurso = !soltaTrecho && this.limite !== null && this.el.currentTime < this.limite - 0.05;
    if (!emCurso) {
      this.limite = ate;
      this.trecho = ate !== null ? { s: this.el.currentTime, e: ate } : null;
    }
    await this.play();
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
    window.clearTimeout(this.timer);
    GESTOS.forEach((g) => window.removeEventListener(g, this.destrava, { capture: true }));
    if (bloqueado === this) marcaBloqueio(null);
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.ouvintes.clear();
  }
}

/**
 * ▶/❚❚ de uma questão com duas leituras: pausa se é ela que está tocando; se parou no meio, continua até o fim
 * da 2ª leitura (ou da leitura em curso); senão começa a 1ª leitura.
 */
export function alternaTrecho(a: ControleAudio, t: TrechoAudio) {
  const fim = t.e2 ?? t.e;
  const tempo = a.tempo;
  const dentro = tempo >= t.s - 0.3 && tempo <= fim + 0.3;
  if (a.tocando && dentro) a.pausa();
  else if (dentro && tempo < fim - 0.2) void a.continua(fim);
  else void a.toca(t.s, t.e);
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
