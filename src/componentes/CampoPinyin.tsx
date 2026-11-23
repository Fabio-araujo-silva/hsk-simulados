import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { conferePinyin, digitaPinyin, type ResultadoPinyin } from "../pinyin";

const ehToque = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Caixinha para digitar o pinyin de uma palavra em hanzi antes de ver a resposta.
 * Número no fim da sílaba vira o tom (yu3 → yǔ, lv4 → lǜ, ma5 → ma). Enter confere.
 */
export function CampoPinyin({
  esperado,
  onConfere,
  autoFoco,
  compacto,
}: {
  esperado: string | undefined;
  /** chamado ao conferir; `null` = Enter com a caixa vazia (não sei) */
  onConfere?: (r: ResultadoPinyin | null, digitado: string) => void;
  autoFoco?: boolean;
  compacto?: boolean;
}) {
  const [valor, setValor] = useState("");
  const [res, setRes] = useState<ResultadoPinyin | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const cursor = useRef<number | null>(null);

  // no computador já abre com o cursor na caixa; no celular não (o teclado cobriria o cartão)
  useEffect(() => {
    if (autoFoco && !ehToque()) ref.current?.focus({ preventScroll: true });
  }, [autoFoco]);

  // depois de converter "yu3" em "yǔ" o texto encolhe: devolve o cursor para onde ele estava
  useLayoutEffect(() => {
    if (cursor.current !== null && ref.current) {
      ref.current.setSelectionRange(cursor.current, cursor.current);
      cursor.current = null;
    }
  }, [valor]);

  const confere = () => {
    if (res || !esperado) return;
    const v = valor.trim();
    // sai da caixa: as teclas 1–4 voltam a dar a nota do cartão
    ref.current?.blur();
    if (!v) return onConfere?.(null, "");
    const r = conferePinyin(v, esperado);
    setRes(r);
    onConfere?.(r, v);
  };

  if (!esperado) return null;

  return (
    <div className={`campo-pinyin${compacto ? " compacto" : ""}${res ? ` r-${res}` : ""}`}>
      <div className="campo-pinyin-linha">
        <input
          ref={ref}
          className="entrada"
          type="text"
          lang="zh-Latn-pinyin"
          inputMode="text"
          enterKeyHint="done"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={compacto ? "pinyin" : "digite o pinyin (yu3 → yǔ) e Enter"}
          title="número no fim da sílaba vira o tom: yu3 → yǔ, lv4 → lǜ, ma5 → ma"
          aria-label="digite o pinyin"
          value={valor}
          readOnly={!!res}
          onChange={(e) => {
            const d = digitaPinyin(e.target.value, e.target.selectionStart ?? e.target.value.length);
            cursor.current = d.cursor;
            setValor(d.valor);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confere();
            }
          }}
        />
        {!res && (
          <button className="sec" onClick={confere} disabled={!valor.trim()}>
            conferir
          </button>
        )}
      </div>
      {res && (
        <div className="campo-pinyin-res" role="status">
          {res === "certo" && <>✓ certo: {esperado}</>}
          {res === "tons" && (
            <>
              ≈ letras certas, tom errado — você: <b>{valor}</b> · certo: <b>{esperado}</b>
            </>
          )}
          {res === "errado" && (
            <>
              ✗ você: <b>{valor}</b> · certo: <b>{esperado}</b>
            </>
          )}
        </div>
      )}
    </div>
  );
}
