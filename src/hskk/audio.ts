import { useEffect, useState } from "react";
import { ControleAudio } from "../audio";

// O controle de áudio é o mesmo do HSK (src/audio.ts); aqui só fica o hook que o HSKK usa.

/**
 * Cria o controle de áudio dentro de um efeito (e não com useMemo): no modo de desenvolvimento o React monta,
 * desmonta e monta de novo cada componente — assim o segundo ciclo ganha um áudio novo em vez de um destruído.
 */
export function useControleAudio(src: string | null | undefined) {
  const [audio, setAudio] = useState<ControleAudio | null>(null);
  useEffect(() => {
    if (!src) return;
    const a = new ControleAudio(src);
    setAudio(a);
    return () => {
      a.destroi();
      setAudio(null);
    };
  }, [src]);
  return audio;
}
