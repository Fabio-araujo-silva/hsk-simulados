import type { Lexico, Prova, Questao, QuestaoFalar, QuestaoRepetir, ResumoProva, TipoFonte } from "./tipos";

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

export const ehRepetir = (q: Questao): q is QuestaoRepetir => q.parte === 1;
export const ehFalar = (q: Questao): q is QuestaoFalar => q.parte !== 1;

export const NOMES_PARTE: Record<number, { zh: string; pt: string; curto: string }> = {
  1: { zh: "听后重复", pt: "Ouvir e repetir", curto: "Parte 1" },
  2: { zh: "看图说话", pt: "Falar sobre a figura", curto: "Parte 2" },
  3: { zh: "回答问题", pt: "Responder à pergunta", curto: "Parte 3" },
};

export const parteDe = (n: number) => (n <= 10 ? 1 : n <= 12 ? 2 : 3);

/** Tempo de resposta no estudo das partes 2 e 3 (como no exame). */
export const TEMPO_FALA = 120;
/** Preparação sugerida por questão no estudo (os 10 min do exame valem para as 4 questões). */
export const TEMPO_PREPARO_ESTUDO = 150;
/** Limite de uma gravação do 第一部分 no estudo. */
export const TEMPO_REPETIR = 15;

export const ROTULO_FONTE: Record<TipoFonte, string> = {
  oficial: "oficial",
  terceiro: "redigitado por terceiros",
  transcrito: "transcrito do áudio",
  frames: "frames de vídeo",
  youtube: "YouTube",
};

export function formataTempo(seg: number) {
  seg = Math.max(0, Math.round(seg));
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
