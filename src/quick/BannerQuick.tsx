import { useMemo } from "react";
import { CONFIG_QUICK_PADRAO, useEstado } from "../armazenamento";
import { diasSeguidos, recorde } from "./historico";
import { ITENS_POR_RODADA, LACUNAS_POR_ITEM, SEGUNDOS_POR_ITEM } from "./sorteio";
import "./quick.css";

/** Chamada do Quick Listen 🔥 na escolha de nível: sequência de dias e recorde nas opções atuais. */
export function BannerQuick() {
  const sessoesObj = useEstado((e) => e.quick.sessoes);
  const cfgQuick = useEstado((e) => e.config.quick);
  const sessoes = useMemo(() => Object.values(sessoesObj), [sessoesObj]);
  const seq = diasSeguidos(sessoes);
  const rec = recorde(sessoes, { ...CONFIG_QUICK_PADRAO, ...cfgQuick });
  return (
    <a href="#/quick" className="ql-banner">
      <span className="ql-banner-fogo" aria-hidden>
        🔥
      </span>
      <span className="ql-banner-texto">
        <b>Quick Listen</b>
        <span>
          {ITENS_POR_RODADA} áudios das provas reais · {LACUNAS_POR_ITEM} palavras faltando em cada · {SEGUNDOS_POR_ITEM} s para responder (ou sem
          tempo)
        </span>
      </span>
      <span className="ql-banner-stats">
        {seq.dias > 0 ? (
          <>
            <b>🔥 {seq.dias}</b> {seq.dias === 1 ? "dia seguido" : "dias seguidos"}
          </>
        ) : sessoes.length ? (
          "volte à sequência hoje"
        ) : (
          "comece a sua sequência"
        )}
        {rec && (
          <>
            {" · "}recorde <b>{rec.pontos}</b>
          </>
        )}
      </span>
      <span className="ql-banner-ir">Jogar →</span>
    </a>
  );
}
