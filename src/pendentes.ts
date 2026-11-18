import { useMemo } from "react";
import { hojeChave, useEstado } from "./armazenamento";
import { useEstado as useEstadoHskk } from "./hskk/armazenamento";
import { pendentesAgora } from "./srs";

/**
 * Cartões para revisar agora em cada parte do app — HSK (leitura e escrita) e HSKK (frases orais), cada um com o
 * seu progresso e o seu limite de novos por dia. É o número do badge "Revisão" (a soma) e das abas da revisão.
 */
export function usePendentes() {
  const cartoes = useEstado((e) => e.cartoes);
  const novosHoje = useEstado((e) => e.novosHoje);
  const novosPorDia = useEstado((e) => e.config.novosPorDia);
  const cartoesHskk = useEstadoHskk((e) => e.cartoes);
  const novosHojeHskk = useEstadoHskk((e) => e.novosHoje);
  const novosPorDiaHskk = useEstadoHskk((e) => e.config.novosPorDia);
  return useMemo(() => {
    const k = hojeChave();
    const agora = Date.now();
    const hsk = pendentesAgora(Object.values(cartoes), novosHoje[k] ?? 0, novosPorDia, agora);
    const hskk = pendentesAgora(Object.values(cartoesHskk), novosHojeHskk[k] ?? 0, novosPorDiaHskk, agora);
    return { hsk, hskk, total: hsk + hskk };
  }, [cartoes, novosHoje, novosPorDia, cartoesHskk, novosHojeHskk, novosPorDiaHskk]);
}
