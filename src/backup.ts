/**
 * O HSK 1–3 e o HSKK têm cada um o seu progresso, com o mesmo formato de arquivo.
 * O backup leva a parte de origem ("parte") para que a restauração recuse o arquivo da outra parte
 * (senão as provas orais iriam parar no progresso do HSK, e vice-versa).
 */
export type Parte = "hsk" | "hskk";

const NOME: Record<Parte, string> = { hsk: "HSK 1–3", hskk: "HSKK" };
const SECAO: Record<Parte, string> = { hsk: "Backup (HSK 1–3)", hskk: "HSKK (prova oral)" };

/** Provas do HSKK: H81xxx (中级) e a amostra YANGTI. */
const provaDoHskk = (id: string) => /^H8/.test(id) || id === "YANGTI";

type Bruto = {
  parte?: unknown;
  tentativas?: Record<string, { prova?: unknown }>;
  cartoes?: Record<string, { origem?: { prova?: unknown } }>;
  vocab?: { marcas?: Record<string, unknown> };
};

/** De qual parte é o backup: o campo "parte" ou, nos backups antigos sem ele, as provas que ele contém. */
export function parteDoBackup(b: Bruto): Parte | "misto" | null {
  if (b.parte === "hsk" || b.parte === "hskk") return b.parte;
  let hsk = 0;
  let hskk = 0;
  const conta = (prova: unknown) => {
    if (typeof prova !== "string") return;
    if (provaDoHskk(prova)) hskk++;
    else hsk++;
  };
  for (const t of Object.values(b.tentativas ?? {})) conta(t?.prova);
  for (const c of Object.values(b.cartoes ?? {})) conta(c?.origem?.prova);
  if (Object.keys(b.vocab?.marcas ?? {}).length) hsk++;
  if (hsk && hskk) return "misto";
  return hskk ? "hskk" : hsk ? "hsk" : null;
}

/** Lê o JSON de um backup e confere que ele é da parte certa (lança um erro explicando onde restaurá-lo). */
export function leBackup(json: string, esperada: Parte): Record<string, unknown> {
  const b = JSON.parse(json) as Bruto & Record<string, unknown>;
  if (!b || typeof b !== "object") throw new Error("arquivo de backup inválido");
  const parte = parteDoBackup(b);
  if (parte === "misto") throw new Error("este arquivo mistura provas do HSK 1–3 e do HSKK — não dá para saber de qual parte ele é");
  if (parte && parte !== esperada)
    throw new Error(`este é um backup do ${NOME[parte]}, não do ${NOME[esperada]} — restaure na seção “${SECAO[parte]}”`);
  const estado: Record<string, unknown> = { ...b };
  delete estado.parte;
  return estado;
}
