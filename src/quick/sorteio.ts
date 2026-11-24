import type { Fala, Lexico, Prova, Questao, ResumoProva } from "../tipos";
import { conferePinyin } from "../pinyin";

// Quick Listen 🔥: rodadas curtas de ditado com lacunas. Cada rodada sorteia 5 questões de listening das provas reais
// (o trecho da 1ª leitura do áudio original), mostra o texto em hanzi com 3 palavras faltando, que a pessoa digita
// (hanzi ou pinyin), e pontua as lacunas. Este módulo é só lógica (sem React): sorteio, lacunas, conferência e pontos.

export const ITENS_POR_RODADA = 5;
export const LACUNAS_POR_ITEM = 3;
/** tempo para responder cada áudio (s), contado a partir do fim da 1ª escuta */
export const SEGUNDOS_POR_ITEM = 30;
export const PONTOS_PALAVRA = 100;
/** bônus por segundo que sobrou, quando o áudio sai com todas as lacunas certas */
export const PONTOS_SEGUNDO = 2;
/** bônus do combo: cada áudio perfeito seguido vale 50 a mais que o anterior (0, 50, 100…) */
export const PONTOS_COMBO = 50;

export type NivelQuick = 0 | 1 | 2 | 3;

export interface Lacuna {
  /** posição da fala em `falas` e do token em `falas[fala].f.tk` */
  fala: number;
  tk: number;
  palavra: string;
  py: string;
}

export interface ItemQuick {
  /** chave estável da questão: "H31001:26" */
  chave: string;
  prova: string;
  nivel: number;
  n: number;
  parte: number;
  /** áudio da prova (caminho em public/, passar por urlMidia) */
  src: string;
  /** trecho da 1ª leitura */
  s: number;
  e: number;
  falas: Fala[];
  /** em ordem de aparição no texto */
  lacunas: Lacuna[];
}

// ------------------------------------------------------------------ palavras

const PONTUACAO = /^[\s，。？！、：；“”‘’（）《》…—\-.,!?;:()"'＿·]+$/;
const SO_HANZI = /^[㐀-鿿]+$/;
const TEM_HANZI = /[㐀-鿿]/;

/** partículas: não viram lacuna — quase não se ouvem e não testam vocabulário */
const PARTICULAS = new Set(["的", "了", "吗", "呢", "吧", "啊", "呀", "哦", "嗯", "喂", "着", "过", "地", "得", "么", "啦", "哇", "嘛", "哈"]);
/** palavras fracas: só viram lacuna se faltar coisa melhor */
const FRACAS = new Set([
  "是", "我", "你", "您", "他", "她", "它", "我们", "你们", "他们", "她们", "咱们", "这", "那", "这儿", "那儿", "这个", "那个",
  "很", "也", "都", "不", "没", "在", "有", "和", "就", "还", "一", "个", "们", "把", "被", "给", "对", "跟", "又", "才",
  "两", "二", "几", "多", "太", "真", "最", "要", "会", "能", "去", "来", "说", "好",
]);

/** Peso de um token para virar lacuna (0 = não pode). */
function peso(w: string, lexico: Lexico): number {
  if (!w || PONTUACAO.test(w) || !SO_HANZI.test(w) || PARTICULAS.has(w) || !lexico[w]) return 0;
  if (FRACAS.has(w)) return 1;
  const hsk = lexico[w].hsk ?? 4;
  return 3 + (w.length >= 2 ? 1 : 0) + (hsk >= 2 ? 1 : 0);
}

/** pinyin sem tom, só letras ("bàngōngshì" → "bangongshi"; ü vira u) */
export function semTom(py: string): string {
  return py
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// ------------------------------------------------------------------ sorteio

/** Embaralha (Fisher–Yates) uma cópia. */
export function embaralha<T>(xs: readonly T[], rnd: () => number = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Candidata {
  fala: number;
  tk: number;
  w: string;
  peso: number;
}

/** Tokens que podem virar lacuna: não estão na pergunta lida (问) e aparecem uma vez só no texto todo. */
function candidatas(falas: Fala[], lexico: Lexico): Candidata[] {
  const vezes = new Map<string, number>();
  for (const fa of falas) for (const w of fa.f.tk) vezes.set(w, (vezes.get(w) ?? 0) + 1);
  const out: Candidata[] = [];
  falas.forEach((fa, fi) => {
    if (fa.fal === "问") return;
    fa.f.tk.forEach((w, ti) => {
      const p = peso(w, lexico);
      // a palavra repetida em outro lugar do texto entregaria a lacuna
      if (p > 0 && vezes.get(w) === 1) out.push({ fala: fi, tk: ti, w, peso: p });
    });
  });
  return out;
}

/** palavras no texto todo, no mínimo: as 3 lacunas não podem ser quase o texto inteiro (李[小姐]，[请][坐]) */
const MIN_PALAVRAS = 7;

/** A questão serve para o Quick Listen? (áudio, texto com corpo e pelo menos 3 lacunas boas) */
export function questaoServe(q: Questao, lexico: Lexico): boolean {
  if (q.secao !== "L" || !q.audio || !q.falas?.length) return false;
  if (q.audio.e - q.audio.s > 40) return false;
  if (q.falas.reduce((n, fa) => n + fa.f.tk.filter((w) => !PONTUACAO.test(w)).length, 0) < MIN_PALAVRAS) return false;
  const c = candidatas(q.falas, lexico);
  return c.length >= LACUNAS_POR_ITEM + 1 && c.filter((x) => x.peso >= 3).length >= 2;
}

/**
 * Escolhe as lacunas: primeiro entre as palavras fortes (sorteio ponderado pelo peso, Efraimidis–Spirakis), evitando
 * duas lacunas coladas na mesma fala; as fracas (pronomes, 是, 很…) só completam quando faltam fortes.
 */
export function escolheLacunas(falas: Fala[], lexico: Lexico, rnd: () => number = Math.random): Lacuna[] {
  const cs = candidatas(falas, lexico)
    .map((c) => ({ c, k: Math.pow(rnd() || 1e-9, 1 / c.peso) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.c);
  const ordem = [...cs.filter((c) => c.peso >= 3), ...cs.filter((c) => c.peso < 3)];
  const escolhidas: Candidata[] = [];
  const colada = (c: Candidata) => escolhidas.some((x) => x.fala === c.fala && Math.abs(x.tk - c.tk) <= 1);
  for (const c of ordem) if (escolhidas.length < LACUNAS_POR_ITEM && !colada(c)) escolhidas.push(c);
  for (const c of ordem) if (escolhidas.length < LACUNAS_POR_ITEM && !escolhidas.includes(c)) escolhidas.push(c);
  return escolhidas
    .sort((a, b) => a.fala - b.fala || a.tk - b.tk)
    .map((c) => ({ fala: c.fala, tk: c.tk, palavra: c.w, py: falas[c.fala].f.py[c.tk] || lexico[c.w]?.py || "" }));
}

/** Nível da prova: o do índice; sem ele, o dígito do id (H31001 → 3). O JSON da prova nem sempre traz o campo. */
const nivelDe = (prova: Prova, resumo?: ResumoProva) => resumo?.nivel ?? prova.nivel ?? (Number(prova.id[1]) || 3);

/** Monta o item de uma questão (o trecho do áudio e as lacunas). */
export function montaItem(prova: Prova, q: Questao, lexico: Lexico, rnd: () => number = Math.random, resumo?: ResumoProva): ItemQuick | null {
  if (!prova.audio || !q.audio || !q.falas) return null;
  const lacunas = escolheLacunas(q.falas, lexico, rnd);
  if (lacunas.length < LACUNAS_POR_ITEM) return null;
  return {
    chave: `${prova.id}:${q.n}`,
    prova: prova.id,
    nivel: nivelDe(prova, resumo),
    n: q.n,
    parte: q.parte,
    src: prova.audio.src,
    s: q.audio.s,
    e: q.audio.e,
    falas: q.falas,
    lacunas,
  };
}

/**
 * Sorteia a rodada: provas diferentes (repete só se o nível tiver menos de 5), uma questão de cada, evitando as que
 * saíram nas últimas rodadas (`recentes`). Os itens vão do áudio mais curto ao mais longo (esquenta aos poucos).
 */
export async function montaRodada(o: {
  nivel: NivelQuick;
  indice: ResumoProva[];
  carrega: (id: string) => Promise<Prova>;
  lexico: Lexico;
  recentes: Set<string>;
  rnd?: () => number;
}): Promise<ItemQuick[]> {
  const rnd = o.rnd ?? Math.random;
  const provas = embaralha(
    o.indice.filter((p) => p.temAudio && (o.nivel === 0 || p.nivel === o.nivel)),
    rnd,
  );
  if (!provas.length) throw new Error("nenhuma prova com áudio neste nível");
  const itens: ItemQuick[] = [];
  const vistas = new Set<string>();
  // percorre as provas embaralhadas (dando a volta se precisar) até juntar os 5 itens
  for (let i = 0; itens.length < ITENS_POR_RODADA && i < provas.length * 3; i++) {
    const r = provas[i % provas.length];
    let prova: Prova;
    try {
      prova = await o.carrega(r.id);
    } catch {
      continue;
    }
    const servem = prova.questoes.filter((q) => questaoServe(q, o.lexico) && !vistas.has(`${prova.id}:${q.n}`));
    const novas = servem.filter((q) => !o.recentes.has(`${prova.id}:${q.n}`));
    const lista = novas.length ? novas : servem;
    if (!lista.length) continue;
    const q = lista[Math.floor(rnd() * lista.length)];
    const item = montaItem(prova, q, o.lexico, rnd, r);
    if (!item) continue;
    vistas.add(item.chave);
    itens.push(item);
  }
  if (!itens.length) throw new Error("não encontrei áudios para montar a rodada");
  return itens.sort((a, b) => a.e - a.s - (b.e - b.s));
}

// ------------------------------------------------------------------ conferência

/** Resposta digitada: vale o hanzi exato ou o pinyin (com ou sem tom: no listening o som é o que conta). */
export function confereDigitado(digitado: string, l: Lacuna): boolean {
  const d = digitado.replace(/[\s，。、？！,.?!'’]/g, "");
  if (!d) return false;
  if (TEM_HANZI.test(d)) return d === l.palavra;
  return !!l.py && conferePinyin(d, l.py) !== "errado";
}

// ------------------------------------------------------------------ pontuação

export interface PontosItem {
  certas: number;
  total: number;
  palavras: number;
  tempo: number;
  combo: number;
  pontos: number;
  /** combo depois deste item (áudios perfeitos seguidos) */
  comboDepois: number;
}

/**
 * Pontos de um áudio: 100 por lacuna certa; com todas certas, +2 por segundo que sobrou (com tempo) e o combo 🔥
 * (o 2º perfeito seguido vale +50, o 3º +100…).
 */
export function pontuaItem(certas: number, total: number, restante: number | null, comboAntes: number): PontosItem {
  const perfeito = total > 0 && certas === total;
  const comboDepois = perfeito ? comboAntes + 1 : 0;
  const palavras = certas * PONTOS_PALAVRA;
  const tempo = perfeito && restante !== null ? Math.round(Math.max(0, restante) * PONTOS_SEGUNDO) : 0;
  const combo = perfeito ? PONTOS_COMBO * (comboDepois - 1) : 0;
  return { certas, total, palavras, tempo, combo, pontos: palavras + tempo + combo, comboDepois };
}

/** Rótulo da rodada pelo aproveitamento nas lacunas. */
export function chama(certas: number, total: number): { fogo: string; nome: string } {
  const p = total ? certas / total : 0;
  if (p >= 1) return { fogo: "🔥🔥🔥", nome: "Em chamas!" };
  if (p >= 0.8) return { fogo: "🔥🔥", nome: "Pegando fogo" };
  if (p >= 0.6) return { fogo: "🔥", nome: "Esquentando" };
  if (p >= 0.3) return { fogo: "✨", nome: "Faísca" };
  return { fogo: "💨", nome: "Brasa fria — bora de novo" };
}
