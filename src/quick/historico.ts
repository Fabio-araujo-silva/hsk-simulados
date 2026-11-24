import type { ConfigQuick, SessaoQuick } from "../tipos";

// Números do Quick Listen 🔥 tirados das rodadas guardadas: recorde por configuração, sequência de dias e as questões
// que saíram há pouco (para o sorteio não repeti-las).

/** AAAA-MM-DD no fuso do aparelho */
export function diaDe(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const mesmaConfig = (s: SessaoQuick, c: ConfigQuick) => s.nivel === c.nivel && s.tempo === c.tempo;

/** Melhor rodada com as mesmas opções (nível e tempo): só aí a comparação é justa. */
export function recorde(sessoes: SessaoQuick[], c: ConfigQuick, exceto?: string): SessaoQuick | null {
  let melhor: SessaoQuick | null = null;
  for (const s of sessoes) if (s.id !== exceto && mesmaConfig(s, c) && (!melhor || s.pontos > melhor.pontos)) melhor = s;
  return melhor;
}

/**
 * Dias seguidos com pelo menos uma rodada, terminando hoje (ou ontem: a sequência só se perde se passar um dia
 * inteiro sem jogar). `hoje` diz se a rodada de hoje já foi feita.
 */
export function diasSeguidos(sessoes: SessaoQuick[], agora = Date.now()): { dias: number; hoje: boolean } {
  const dias = new Set(sessoes.map((s) => diaDe(s.em)));
  const d = new Date(agora);
  const hoje = dias.has(diaDe(d.getTime()));
  if (!hoje) d.setDate(d.getDate() - 1);
  let n = 0;
  while (dias.has(diaDe(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return { dias: n, hoje };
}

/** Questões ("H31001:26") das últimas rodadas. */
export function recentes(sessoes: SessaoQuick[], rodadas = 30): Set<string> {
  const out = new Set<string>();
  for (const s of [...sessoes].sort((a, b) => b.em - a.em).slice(0, rodadas)) for (const it of s.itens) out.add(`${it.prova}:${it.n}`);
  return out;
}
