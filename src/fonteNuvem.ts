import { registraFonte, type Fonte } from "./compacta";
import { frasesDaQuestao } from "./correcao";
import { carregaLexico, carregaProva } from "./dados";
import type { Lexico, Prova } from "./tipos";

// De onde o formato compacto da nuvem (src/compacta.ts) tira as frases dos cartões do HSK: das próprias provas
// (public/conteudo/provas) e do léxico, que o site já serve. Só é usado no site público, ao gravar e ao ler a nuvem.

/** provas carregadas (null = a prova não existe mais no site: HTTP 404) */
const provas = new Map<string, Prova | null>();
let lexico: Lexico | null = null;

const fonte: Fonte = {
  frases(id, n) {
    const p = provas.get(id);
    if (p === undefined) return null;
    const q = p?.questoes.find((x) => x.n === n);
    return q && p ? frasesDaQuestao(q, q.grupo ? p.grupos[q.grupo] : undefined) : [];
  },
  verbete(w) {
    if (!lexico) return null;
    const v = lexico[w];
    // como sugereCartoes monta o cartão "palavra"
    return { py: v?.py, pt: v?.pt ?? v?.en };
  },
};

registraFonte("hsk", {
  async carrega(ids) {
    const faltam = ids.filter((id) => !provas.has(id));
    const [lx, ...ps] = await Promise.allSettled([carregaLexico(), ...faltam.map(carregaProva)]);
    ps.forEach((r, i) => {
      if (r.status === "fulfilled") provas.set(faltam[i], r.value);
      else if (String(r.reason).includes("HTTP 404")) provas.set(faltam[i], null);
    });
    if (lx.status === "rejected") throw lx.reason;
    lexico = lx.value;
    // sem rede no meio: quem grava segue com o que carregou (o resto vai inteiro); quem lê falha e tenta depois
    const erro = ps.find((r) => r.status === "rejected" && !String(r.reason).includes("HTTP 404"));
    if (erro?.status === "rejected") throw erro.reason;
    return fonte;
  },
  jaCarregado: () => fonte,
});
