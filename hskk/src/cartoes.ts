import { apagaCartao, leEstado, salvaCartoes } from "./armazenamento";
import { srsNovo } from "./srs";
import type { Cartao, Prova, QuestaoRepetir } from "./tipos";

export const idCartao = (prova: string, n: number) => `f:${prova}:${n}`;

export const cartaoExiste = (prova: string, n: number) => !!leEstado().cartoes[idCartao(prova, n)];

/** Manda uma frase do 第一部分 para a revisão espaçada (ouvir o áudio original e repetir). Devolve true se criou agora. */
export function adicionaRevisao(prova: Prova, q: QuestaoRepetir, pct?: number): boolean {
  const id = idCartao(prova.id, q.n);
  if (leEstado().cartoes[id]) return false;
  const c: Cartao = {
    id,
    tipo: "frase",
    criado: Date.now(),
    origem: { prova: prova.id, n: q.n },
    frase: q.frase,
    audio: q.t.s !== undefined && q.t.e !== undefined ? { prova: prova.id, s: q.t.s, e: q.t.e } : null,
    pct,
    srs: srsNovo(),
  };
  salvaCartoes([c]);
  return true;
}

export function removeRevisao(prova: string, n: number) {
  apagaCartao(idCartao(prova, n));
}
