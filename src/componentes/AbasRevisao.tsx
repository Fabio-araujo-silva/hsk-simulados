/** Qual revisão/cartões mostrar: os do HSK (leitura e escrita) ou as frases orais do HSKK. */
export type Aba = "hsk" | "hskk";

/** Escolha "Leitura e escrita (HSK) | Oral (HSKK)" no topo das páginas Revisão e Cartões. */
export function AbasRevisao({ aba, muda, hsk, hskk, titulo }: { aba: Aba; muda: (a: Aba) => void; hsk: number; hskk: number; titulo: string }) {
  const botao = (a: Aba, rotulo: string, n: number) => (
    <button role="tab" aria-selected={aba === a} className={aba === a ? "pri" : "sec"} onClick={() => muda(a)} title={`${n} ${titulo}`}>
      {rotulo}
      {n > 0 && <span className="tag">{n}</span>}
    </button>
  );
  return (
    <div className="filtros" role="tablist">
      {botao("hsk", "Leitura e escrita (HSK)", hsk)}
      {botao("hskk", "Oral (HSKK)", hskk)}
    </div>
  );
}
