import type { Lexico, Nivel, PalavraVocab, Prova, ResumoProva, Secao } from "./tipos";
import { MIDIA_URL } from "./publico";

const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<unknown>>();

/** Busca um JSON de public/ (uma vez só por caminho; também usado pelo HSKK). */
export function busca<T>(caminho: string): Promise<T> {
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
/** palavras do HSK 1 a 3 da aba Vocabulário (scripts/vocabulario.py) */
export const carregaVocabulario = () => busca<PalavraVocab[]>("conteudo/vocabulario.json");

/** Arquivo de public/ servido junto com o site (JSON do conteúdo, voz sintética em tts/…). */
export const urlPublica = (caminho: string) => BASE + caminho;

/** Pastas pesadas (~550 MB) que no site público ficam no bucket de mídia — o deploy da Vercel não comporta. */
const PASTAS_MIDIA = /^(audio|img|hskk\/audio|hskk\/img)\//;

/**
 * Áudio original e figuras das provas (os caminhos dos JSON: audio/…, img/…, hskk/audio/…, hskk/img/…).
 * Com VITE_MIDIA_URL vêm do bucket (Cloudflare R2, enviado por scripts/publica_midia.mjs); sem ela, de public/.
 */
export const urlMidia = (caminho: string) => (MIDIA_URL && PASTAS_MIDIA.test(caminho) ? `${MIDIA_URL}/${caminho}` : BASE + caminho);

// ------------------------------------------------------------------ regras por nível

export interface RegrasNivel {
  nome: string;
  /** questões por seção */
  questoes: Record<Secao, number>;
  /** tempos fixos (s): passar o listening para a folha, leitura, escrita */
  tempos: { folha: number; R: number; W: number };
  /** pontuação máxima (100 por seção) e mínima para aprovação */
  maximo: number;
  aprovacao: number;
  /** o caderno real imprime pinyin sobre os caracteres */
  pinyinNaProva: boolean;
  /** resumo das regras para a tela inicial */
  resumo: string[];
}

export const REGRAS: Record<number, RegrasNivel> = {
  1: {
    nome: "HSK 1",
    questoes: { L: 20, R: 20, W: 0 },
    tempos: { folha: 3 * 60, R: 17 * 60, W: 0 },
    maximo: 200,
    aprovacao: 120,
    pinyinNaProva: true,
    resumo: [
      "40 questões em ~40 min: 听力 20 (≈15 min de áudio, cada item lido duas vezes) + 阅读 20 (17 min).",
      "O caderno traz pinyin sobre os caracteres.",
      "Cada seção vale 100 pontos: total 200, aprovação com 120.",
      "Vocabulário: 150 palavras.",
    ],
  },
  2: {
    nome: "HSK 2",
    questoes: { L: 35, R: 25, W: 0 },
    tempos: { folha: 3 * 60, R: 22 * 60, W: 0 },
    maximo: 200,
    aprovacao: 120,
    pinyinNaProva: true,
    resumo: [
      "60 questões em ~50 min: 听力 35 (≈25 min de áudio, cada item lido duas vezes) + 阅读 25 (22 min).",
      "O caderno traz pinyin sobre os caracteres.",
      "Cada seção vale 100 pontos: total 200, aprovação com 120.",
      "Vocabulário: 300 palavras.",
    ],
  },
  3: {
    nome: "HSK 3",
    questoes: { L: 40, R: 30, W: 10 },
    tempos: { folha: 5 * 60, R: 30 * 60, W: 15 * 60 },
    maximo: 300,
    aprovacao: 180,
    pinyinNaProva: false,
    resumo: [
      "80 questões em ~90 min: 听力 40 (≈35 min de áudio, cada item lido duas vezes) + 阅读 30 (30 min) + 书写 10 (15 min).",
      "Sem pinyin no caderno (só nas questões 76–80, para escrever o caractere).",
      "Cada seção vale 100 pontos: total 300, aprovação com 180.",
      "Vocabulário: 600 palavras.",
    ],
  },
};

export const regras = (nivel: Nivel | number | undefined) => REGRAS[nivel ?? 3] ?? REGRAS[3];

/** Seção de uma questão pelo número (para resumos sem carregar a prova). */
export function secaoDe(nivel: Nivel | number, n: number): Secao {
  const q = regras(nivel).questoes;
  if (n <= q.L) return "L";
  if (n <= q.L + q.R) return "R";
  return "W";
}

/** Nota estimada: cada seção vale 100, proporcional aos acertos. */
export function pontuacao(certas: { L: number; R: number; W: number }, nivel: Nivel | number = 3) {
  const rg = regras(nivel);
  const sec = (s: Secao) => (rg.questoes[s] ? Math.round((certas[s] / rg.questoes[s]) * 100) : 0);
  const L = sec("L");
  const R = sec("R");
  const W = sec("W");
  const total = L + R + W;
  return { L, R, W, total, maximo: rg.maximo, aprovacao: rg.aprovacao, aprovado: total >= rg.aprovacao };
}

export const NOMES_SECAO: Record<string, string> = {
  L: "听力 Compreensão auditiva",
  R: "阅读 Leitura",
  W: "书写 Escrita",
};

const PARTES: Record<number, Record<string, string>> = {
  1: {
    L1: "Figura: certo ou errado",
    L2: "Escolher a figura (A/B/C)",
    L3: "Diálogo ↔ figura",
    L4: "Pergunta (A/B/C)",
    R1: "Figura × palavra: certo ou errado",
    R2: "Frase ↔ figura",
    R3: "Pergunta ↔ resposta",
    R4: "Lacunas (banco de palavras)",
  },
  2: {
    L1: "Figura: certo ou errado",
    L2: "Diálogo ↔ figura",
    L3: "Diálogo curto (A/B/C)",
    L4: "Diálogo longo (A/B/C)",
    R1: "Frase ↔ figura",
    R2: "Lacunas (banco de palavras)",
    R3: "Frase e ★: certo ou errado",
    R4: "Pergunta ↔ resposta",
  },
  3: {
    L1: "Diálogo ↔ figura",
    L2: "Certo ou errado",
    L3: "Diálogo curto",
    L4: "Diálogo longo",
    R1: "Pergunta ↔ resposta",
    R2: "Lacunas (banco de palavras)",
    R3: "Compreensão de texto",
    W1: "Ordenar a frase",
    W2: "Escrever o caractere",
  },
};

/** Nome da parte ("L1", "R2"…) no nível dado. */
export const nomeParte = (nivel: Nivel | number | undefined, chave: string) => PARTES[nivel ?? 3]?.[chave] ?? chave;

export function formataTempo(seg: number) {
  seg = Math.max(0, Math.round(seg));
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
