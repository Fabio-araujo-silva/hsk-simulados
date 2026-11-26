import { useEffect, useRef, useState } from "react";
import type { Rotulo } from "../tipos";

/** Quanto você sabia de cada questão do modo prova (marcado na prova e ajustável na correção). */
export const ROTULOS: { id: Rotulo; letra: string; nome: string; dica: string }[] = [
  { id: "fogo", letra: "F", nome: "ponho a mão no fogo", dica: "certeza absoluta" },
  { id: "acho", letra: "S", nome: "acho que sei", dica: "sei, mas não juraria" },
  { id: "gato", letra: "G", nome: "pulo do gato", dica: "resolvi no truque: eliminação, pista, padrão da prova" },
  { id: "nada", letra: "?", nome: "não faço ideia", dica: "chute" },
];
export const rotuloPorId = (id?: Rotulo) => ROTULOS.find((r) => r.id === id);

/** A letra do rótulo (ou um traço apagado); um clique abre o menu para escolher outro ou nenhum. */
export function SeletorRotulo({ valor, onMuda }: { valor?: Rotulo; onMuda: (r: Rotulo | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const atual = rotuloPorId(valor);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const escolhe = (r: Rotulo | null) => {
    onMuda(r);
    setAberto(false);
  };

  return (
    <span className="seletor-rotulo" ref={raiz}>
      <button
        type="button"
        className={`rotulo ${atual ? `r-${atual.id}` : "vazio"}`}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
        title={atual ? `${atual.nome} — clique para mudar` : "Quanto você sabe desta questão?"}
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        {atual ? atual.letra : "·"}
      </button>
      {aberto && (
        <span className="menu-rotulo" role="menu" onClick={(e) => e.stopPropagation()}>
          {ROTULOS.map((r) => (
            <button key={r.id} type="button" role="menuitemradio" aria-checked={valor === r.id} className={valor === r.id ? "atual" : ""} onClick={() => escolhe(valor === r.id ? null : r.id)} title={r.dica}>
              <span className={`rotulo r-${r.id}`}>{r.letra}</span> {r.nome}
            </button>
          ))}
          {atual && (
            <button type="button" role="menuitem" className="nenhum" onClick={() => escolhe(null)}>
              <span className="rotulo vazio">·</span> nenhum
            </button>
          )}
        </span>
      )}
    </span>
  );
}

/** Uma marca só para leitura (letra colorida). */
export function MarcaRotulo({ id }: { id?: Rotulo }) {
  const r = rotuloPorId(id);
  return r ? (
    <span className={`rotulo r-${r.id} so-leitura`} title={r.nome}>
      {r.letra}
    </span>
  ) : null;
}
