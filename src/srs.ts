import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type { CartaoSrs } from "./tipos";

/** Qualquer cartão com estado FSRS (os do HSK e as frases orais do HSKK). */
type ComSrs = { srs: CartaoSrs };

// Revisão espaçada com FSRS (o algoritmo do Anki moderno).
const agendador = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

export const NOTAS: { nota: Grade; rotulo: string; tecla: string }[] = [
  { nota: Rating.Again, rotulo: "De novo", tecla: "1" },
  { nota: Rating.Hard, rotulo: "Difícil", tecla: "2" },
  { nota: Rating.Good, rotulo: "Bom", tecla: "3" },
  { nota: Rating.Easy, rotulo: "Fácil", tecla: "4" },
];

function paraCard(s: CartaoSrs): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
    learning_steps: 0,
  } as Card;
}

function deCard(c: Card): CartaoSrs {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}

export function srsNovo(): CartaoSrs {
  return deCard(createEmptyCard(new Date()));
}

export function revisa<T extends ComSrs>(c: T, nota: Grade, agora = new Date()): T {
  const r = agendador.next(paraCard(c.srs), agora, nota);
  return { ...c, srs: deCard(r.card) };
}

/** Prévia do próximo intervalo de cada nota ("10 min", "3 d"…). */
export function previas(c: ComSrs, agora = new Date()): Record<number, string> {
  const log = agendador.repeat(paraCard(c.srs), agora);
  const out: Record<number, string> = {};
  for (const { nota } of NOTAS) {
    const due = log[nota].card.due.getTime();
    out[nota] = intervalo(due - agora.getTime());
  }
  return out;
}

export function intervalo(ms: number) {
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 31) return `${Math.round(d)} d`;
  const m = d / 30;
  if (m < 12) return `${m.toFixed(m < 3 ? 1 : 0)} m`;
  return `${(d / 365).toFixed(1)} a`;
}

export const ehNovo = (c: ComSrs) => c.srs.state === 0;
export const vencido = (c: ComSrs, agora = Date.now()) => c.srs.due <= agora;
