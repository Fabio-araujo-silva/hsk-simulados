import { atualizaGravacao, leEstado } from "./armazenamento";
import { compara } from "./comparacao";
import { adicionaRevisao } from "./cartoes";
import type { Gravacao, Prova, Questao } from "./tipos";

// Gravações e transcrição, sempre pelo servidor local (vite.config.ts → servidor/gravacoes.ts, rotas /api/hskk/…).
// A chave da ElevenLabs fica no servidor; o navegador só manda o nome do arquivo.
// Sem servidor (site estático), a gravação fica só nesta aba (URL temporária) e não dá para transcrever.

const BASE = import.meta.env.BASE_URL;
const locais = new Map<string, string>();

export async function salvaGravacao(nome: string, blob: Blob): Promise<{ soNaSessao: boolean }> {
  try {
    const r = await fetch(`${BASE}api/hskk/gravacoes/${encodeURIComponent(nome)}`, { method: "PUT", body: blob, headers: { "Content-Type": blob.type || "audio/webm" } });
    const tipo = r.headers.get("content-type") ?? "";
    if (r.ok && tipo.includes("json")) {
      const antigo = locais.get(nome);
      if (antigo) URL.revokeObjectURL(antigo);
      locais.delete(nome);
      return { soNaSessao: false };
    }
  } catch {
    /* sem servidor */
  }
  locais.set(nome, URL.createObjectURL(blob));
  return { soNaSessao: true };
}

export function urlGravacao(g: Gravacao) {
  return locais.get(g.arquivo) ?? (g.soNaSessao ? null : `${BASE}api/hskk/gravacoes/${encodeURIComponent(g.arquivo)}`);
}

export interface Transcricao {
  texto: string;
  palavras: { t: string; s: number; e: number }[];
}

const pendentes = new Map<string, Promise<Transcricao>>();

export async function transcreve(arquivo: string): Promise<Transcricao> {
  if (!pendentes.has(arquivo)) {
    const p = (async () => {
      const r = await fetch(`${BASE}api/hskk/transcreve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo }) });
      const tipo = r.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) throw new Error("a transcrição precisa do servidor local (npm run dev)");
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro ?? `HTTP ${r.status}`);
      return d as Transcricao;
    })();
    pendentes.set(arquivo, p);
    p.finally(() => pendentes.delete(arquivo));
  }
  return pendentes.get(arquivo)!;
}

/**
 * Transcreve uma gravação já salva e guarda o resultado na tentativa.
 * No 第一部分 calcula o % e, se ficou abaixo do limiar, manda a frase para a revisão espaçada.
 * Devolve `true` se a frase foi para a revisão agora.
 */
export async function transcreveGravacao(tentId: string, prova: Prova, q: Questao, g: Gravacao): Promise<{ texto: string; pct?: number; foiParaRevisao: boolean }> {
  const tr = await transcreve(g.arquivo);
  const parcial: Partial<Gravacao> = { texto: tr.texto };
  let foiParaRevisao = false;
  if (q.parte === 1) {
    parcial.pct = compara(q.frase.zh, tr.texto).pct;
    if (parcial.pct < leEstado().config.limiarRevisao) foiParaRevisao = adicionaRevisao(prova, q, parcial.pct);
  }
  atualizaGravacao(tentId, q.n, g.arquivo, parcial);
  return { texto: tr.texto, pct: parcial.pct, foiParaRevisao };
}

/** Nome do arquivo de uma gravação nova. */
export const nomeGravacao = (tentId: string, n: number, ext: string) => `${tentId}-q${n}-${Date.now().toString(36)}.${ext}`;
