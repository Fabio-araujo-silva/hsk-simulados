import type { Lexico, Prova, ResumoProva } from "./tipos";

const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<unknown>>();

function busca<T>(caminho: string): Promise<T> {
  if (!cache.has(caminho)) {
    const p = fetch(BASE + caminho, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(caminho));
    cache.set(caminho, p);
  }
  return cache.get(caminho) as Promise<T>;
}

export const carregaIndice = () => busca<ResumoProva[]>("conteudo/provas/index.json");
export const carregaProva = (id: string) => busca<Prova>(`conteudo/provas/${id}.json`);
export const carregaLexico = () => busca<Lexico>("conteudo/lexico.json");

export const urlPublica = (caminho: string) => BASE + caminho;

/** Pontuação HSK 3: cada seção vale 100; total 300; aprovação com 180. */
export function pontuacao(certas: { L: number; R: number; W: number }) {
  const L = Math.round((certas.L / 40) * 100);
  const R = Math.round((certas.R / 30) * 100);
  const W = Math.round((certas.W / 10) * 100);
  return { L, R, W, total: L + R + W, aprovado: L + R + W >= 180 };
}

export const NOMES_SECAO: Record<string, string> = {
  L: "听力 Compreensão auditiva",
  R: "阅读 Leitura",
  W: "书写 Escrita",
};

export const NOMES_PARTE: Record<string, string> = {
  "L1": "Diálogo ↔ figura",
  "L2": "Certo ou errado",
  "L3": "Diálogo curto",
  "L4": "Diálogo longo",
  "R1": "Pergunta ↔ resposta",
  "R2": "Lacunas (banco de palavras)",
  "R3": "Compreensão de texto",
  "W1": "Ordenar a frase",
  "W2": "Escrever o caractere",
};

export const TEMPO_LEITURA = 30 * 60; // s
export const TEMPO_ESCRITA = 15 * 60; // s
export const TEMPO_FOLHA = 5 * 60; // s para passar respostas do listening

export function formataTempo(seg: number) {
  seg = Math.max(0, Math.round(seg));
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
