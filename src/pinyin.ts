// Pinyin digitado: número no fim da sílaba vira o tom (yu3 → yǔ) e a resposta é conferida com o pinyin certo.

const TONS: Record<string, string> = {
  a: "āáǎà",
  e: "ēéěè",
  i: "īíǐì",
  o: "ōóǒò",
  u: "ūúǔù",
  ü: "ǖǘǚǜ",
  A: "ĀÁǍÀ",
  E: "ĒÉĚÈ",
  I: "ĪÍǏÌ",
  O: "ŌÓǑÒ",
  U: "ŪÚǓÙ",
  Ü: "ǕǗǙǛ",
};

const VOGAL = /[aeiouüAEIOUÜ]/;

/** Põe o tom (1–4; 5 ou 0 = neutro) na sílaba: na vogal certa do último grupo de vogais. */
function comTom(silaba: string, tom: number): string {
  // "v" e "u:" valem como "ü" (como nos teclados de pinyin)
  const s = silaba.replace(/u:/g, "ü").replace(/U:/g, "Ü").replace(/v/g, "ü").replace(/V/g, "Ü");
  if (tom < 1 || tom > 4) return s;
  // último grupo de vogais (em "nihao" é "ao": o tom vai para a última sílaba)
  let fim = -1;
  for (let i = s.length - 1; i >= 0; i--) {
    if (VOGAL.test(s[i])) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return s; // sem vogal (ex.: "m2", "ng"): deixa como está
  let ini = fim;
  while (ini > 0 && VOGAL.test(s[ini - 1])) ini--;
  const grupo = s.slice(ini, fim + 1);
  // regra: a ou e levam o tom; em "ou", o o; nos outros casos, a última vogal
  let alvo = grupo.search(/[aeAE]/);
  if (alvo < 0) alvo = grupo.search(/o[uU]|O[uU]/i);
  if (alvo < 0) alvo = grupo.length - 1;
  const pos = ini + alvo;
  const v = s[pos];
  return s.slice(0, pos) + TONS[v][tom - 1] + s.slice(pos + 1);
}

/** Troca cada "sílaba + número" pelo pinyin com o tom: "ni3hao3" → "nǐhǎo", "lv4" → "lǜ", "ma5" → "ma". */
export function numeroParaTom(texto: string): string {
  return texto.replace(/([a-zA-ZüÜ:]+)([0-5])/g, (_, silaba: string, n: string) => comTom(silaba, Number(n)));
}

/**
 * Para o campo de texto: converte o que foi digitado mantendo o cursor no lugar certo
 * (o número some, então o cursor recua).
 */
export function digitaPinyin(valor: string, cursor: number): { valor: string; cursor: number } {
  const antes = numeroParaTom(valor.slice(0, cursor));
  const depois = numeroParaTom(valor.slice(cursor));
  return { valor: antes + depois, cursor: antes.length };
}

/** só letras, minúsculas, com os tons em forma composta (ǎ = um caractere); "v" vale como "ü" */
const limpa = (s: string) =>
  numeroParaTom(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/v/g, "ü")
    .replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜ]/g, "");

/** sem tons ("ü" vira "u") */
const semTom = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export type ResultadoPinyin = "certo" | "tons" | "errado";

/**
 * Confere o pinyin digitado. "tons" = as letras batem mas algum tom está errado (ou faltando).
 * O esperado pode ter mais de uma leitura ("hái / huán"): vale qualquer uma.
 */
export function conferePinyin(digitado: string, esperado: string): ResultadoPinyin {
  const d = limpa(digitado);
  if (!d) return "errado";
  const leituras = esperado
    .split(/[/／,，;；|]/)
    .map(limpa)
    .filter(Boolean);
  if (leituras.some((e) => e === d)) return "certo";
  if (leituras.some((e) => semTom(e) === semTom(d))) return "tons";
  return "errado";
}
