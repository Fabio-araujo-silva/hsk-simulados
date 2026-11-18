// Compara a frase do 第一部分 com o que o reconhecimento de voz (ElevenLabs Scribe) entendeu da sua gravação.
// É uma medida automática e aproximada — não é a nota oficial do HSKK.

const HAN = /[㐀-鿿]/;
const DIGITOS: Record<string, string> = { "0": "零", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九" };

/** Caracteres que soam exatamente iguais e o reconhecimento troca à toa: contam como acerto. */
const HOMOFONOS = ["他她它", "的地得", "在再", "做作", "吗嘛", "已以", "坐座", "象像向", "到道"];
const classe = new Map<string, number>();
HOMOFONOS.forEach((g, i) => [...g].forEach((c) => classe.set(c, i)));
const iguais = (a: string, b: string) => a === b || (classe.has(a) && classe.get(a) === classe.get(b));

export function soHanzi(t: string): string[] {
  const out: string[] = [];
  for (const c of t.normalize("NFKC")) {
    if (HAN.test(c)) out.push(c);
    else if (DIGITOS[c]) out.push(DIGITOS[c]);
  }
  return out;
}

export type TipoItem = "ok" | "falta" | "troca" | "sobra";
export interface ItemComparacao {
  tipo: TipoItem;
  /** caractere da frase (vazio em "sobra") */
  alvo: string;
  /** o que foi ouvido no lugar (troca/sobra) ou igual (ok) */
  ouvido: string;
}

export interface Resultado {
  pct: number;
  itens: ItemComparacao[];
  acertos: number;
  total: number;
}

export function compara(fraseAlvo: string, dito: string): Resultado {
  const A = soHanzi(fraseAlvo);
  const B = soHanzi(dito);
  const n = A.length;
  const m = B.length;
  // LCS
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = iguais(A[i], B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const bruto: ItemComparacao[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && iguais(A[i], B[j])) {
      bruto.push({ tipo: "ok", alvo: A[i], ouvido: B[j] });
      i++;
      j++;
    } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) {
      bruto.push({ tipo: "sobra", alvo: "", ouvido: B[j] });
      j++;
    } else {
      bruto.push({ tipo: "falta", alvo: A[i], ouvido: "" });
      i++;
    }
  }
  // entre dois acertos, emparelha o que faltou com o que sobrou: vira "troca" (você falou outro caractere no lugar)
  const itens: ItemComparacao[] = [];
  let k = 0;
  while (k < bruto.length) {
    if (bruto[k].tipo === "ok") {
      itens.push(bruto[k++]);
      continue;
    }
    const faltas: string[] = [];
    const sobras: string[] = [];
    while (k < bruto.length && bruto[k].tipo !== "ok") {
      if (bruto[k].tipo === "falta") faltas.push(bruto[k].alvo);
      else sobras.push(bruto[k].ouvido);
      k++;
    }
    const pares = Math.min(faltas.length, sobras.length);
    for (let x = 0; x < pares; x++) itens.push({ tipo: "troca", alvo: faltas[x], ouvido: sobras[x] });
    for (let x = pares; x < faltas.length; x++) itens.push({ tipo: "falta", alvo: faltas[x], ouvido: "" });
    for (let x = pares; x < sobras.length; x++) itens.push({ tipo: "sobra", alvo: "", ouvido: sobras[x] });
  }
  const acertos = itens.filter((x) => x.tipo === "ok").length;
  // sobras no meio da frase contam contra; ruído antes/depois (嗯, 啊, repetir o número) não
  const primeiro = itens.findIndex((x) => x.tipo !== "sobra");
  let ultimo = itens.length - 1;
  while (ultimo >= 0 && itens[ultimo].tipo === "sobra") ultimo--;
  const sobrasMeio = itens.slice(Math.max(0, primeiro), ultimo + 1).filter((x) => x.tipo === "sobra").length;
  const pct = n ? Math.round((100 * acertos) / (n + sobrasMeio)) : 0;
  return { pct, itens, acertos, total: n };
}
