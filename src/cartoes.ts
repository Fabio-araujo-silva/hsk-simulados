import { leEstado } from "./armazenamento";
import { frasesDaQuestao } from "./correcao";
import { ehPontuacao } from "./componentes/Leitura";
import { srsNovo } from "./srs";
import type { Cartao, Frase, Lexico, Prova, Questao } from "./tipos";

export interface Sugestao {
  cartao: Cartao;
  rotulo: string;
  detalhe: string;
  marcado: boolean;
  existe: boolean;
}

function trechoDe(f: Frase, prova: string, leitura: "a" | "a2" = "a") {
  const tempos = (f[leitura] ?? []).filter(Boolean) as [number, number][];
  if (!tempos.length) return null;
  return { prova, s: Math.max(0, tempos[0][0] - 0.15), e: tempos[tempos.length - 1][1] + 0.35 };
}

function trechoPalavra(f: Frase, w: string, prova: string) {
  const i = f.tk.indexOf(w);
  const t = i >= 0 ? f.a?.[i] ?? f.a2?.[i] : null;
  return t ? { prova, s: Math.max(0, t[0] - 0.08), e: t[1] + 0.15 } : null;
}

function base(prova: Prova, q: Questao) {
  return { criado: Date.now(), origem: { prova: prova.id, n: q.n }, srs: srsNovo() };
}

/** Sugere cartões úteis para uma questão (errada ou marcada para revisar). */
export function sugereCartoes(prova: Prova, q: Questao, lexico: Lexico | null, consultas: string[] = []): Sugestao[] {
  const existentes = leEstado().cartoes;
  const grupo = q.grupo ? prova.grupos[q.grupo] : undefined;
  const frases = frasesDaQuestao(q, grupo);
  const out: Sugestao[] = [];

  // 1) refazer a própria questão mais tarde
  const idQ = `q:${prova.id}:${q.n}`;
  out.push({
    cartao: { id: idQ, tipo: "questao", ...base(prova, q) },
    rotulo: `Refazer a questão ${q.n}`,
    detalhe: "a questão real volta na revisão, no intervalo certo",
    marcado: true,
    existe: !!existentes[idQ],
  });

  // 2) frase-chave (a que justifica a resposta), com o áudio original
  let chave: Frase | undefined;
  if (q.trecho) chave = frases.find((f) => f.zh.includes(q.trecho!));
  if (!chave && q.tipo === "hanzi") chave = q.frase;
  if (!chave && q.tipo === "ordenar" && q.frase) chave = q.frase;
  if (chave && chave.tk.length > 1) {
    const id = `f:${chave.zh}`;
    out.push({
      cartao: { id, tipo: "frase", ...base(prova, q), frase: chave, audio: trechoDe(chave, prova.id) },
      rotulo: "Frase-chave",
      detalhe: chave.zh,
      marcado: true,
      existe: !!existentes[id],
    });
  }

  // 3) palavras: as da explicação + as que você consultou no hover
  const vistas = new Set<string>();
  const candidatas = [...(q.palavras ?? []), ...consultas];
  for (const w of candidatas) {
    if (!w || vistas.has(w) || ehPontuacao(w)) continue;
    vistas.add(w);
    const v = lexico?.[w];
    const exemplo = frases.find((f) => f.tk.includes(w)) ?? frases.find((f) => f.zh.includes(w));
    const id = `p:${w}`;
    const consultada = consultas.includes(w);
    out.push({
      cartao: {
        id,
        tipo: "palavra",
        ...base(prova, q),
        palavra: w,
        py: v?.py,
        pt: v?.pt ?? v?.en,
        frase: exemplo,
        audio: exemplo ? trechoDe(exemplo, prova.id) : null,
        audioPalavra: exemplo ? trechoPalavra(exemplo, w, prova.id) : null,
      },
      rotulo: w,
      detalhe: `${v?.py ?? ""} ${v?.pt ?? v?.en ?? ""}${consultada ? " · você consultou" : ""}`.trim(),
      marcado: (q.palavras ?? []).includes(w) || consultada,
      existe: !!existentes[id],
    });
  }
  return out;
}
