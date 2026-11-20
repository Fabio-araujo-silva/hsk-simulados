import { useEffect } from "react";
import { alternaTrecho, useTempo, type ControleAudio } from "../audio";
import { mudaConfig, useConfig } from "../armazenamento";
import { formataTempo } from "../dados";
import type { TrechoAudio } from "../tipos";

/** Player de um trecho da prova (as duas leituras de uma questão). */
export function AudioQuestao({ audio, trecho, autoTocar }: { audio: ControleAudio | null; trecho?: TrechoAudio | null; autoTocar?: boolean }) {
  const { tempo, tocando } = useTempo(audio);
  const cfg = useConfig();

  useEffect(() => {
    audio?.velocidade(cfg.velocidade);
  }, [audio, cfg.velocidade]);

  // (o áudio chega um instante depois da prova: sem `audio` aqui, a 1ª questão aberta não tocaria sozinha)
  useEffect(() => {
    if (autoTocar && audio && trecho) audio.toca(trecho.s, trecho.e);
    return () => audio?.pausa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trecho?.s, audio]);

  if (!audio || !trecho) {
    return <div className="aviso">Sem áudio alinhado para esta questão — use a transcrição.</div>;
  }
  const fim = trecho.e2 ?? trecho.e;
  const dentro = tempo >= trecho.s - 0.3 && tempo <= fim + 0.3;
  const prog = dentro ? (tempo - trecho.s) / Math.max(0.1, fim - trecho.s) : 0;
  const naSegunda = trecho.s2 !== undefined && tempo >= trecho.s2 - 0.2;
  // o áudio é um só para a página (exemplo + questão): este player só "está tocando" se o trecho dele está
  const meu = tocando && dentro;

  return (
    <div className="player">
      <button className="btn-play" onClick={() => alternaTrecho(audio, trecho)} title="Espaço">
        {meu ? "❚❚" : "▶"}
      </button>
      <div className="player-meio">
        <div className="player-botoes">
          <button onClick={() => audio.toca(trecho.s, trecho.e)} className={dentro && !naSegunda && tocando ? "on" : ""}>
            1ª leitura
          </button>
          {trecho.s2 !== undefined && (
            <button onClick={() => audio.toca(trecho.s2!, trecho.e2 ?? null)} className={naSegunda && tocando ? "on" : ""}>
              2ª leitura
            </button>
          )}
          <button onClick={() => audio.toca(trecho.s, fim)}>as duas</button>
          <select value={cfg.velocidade} onChange={(e) => mudaConfig({ velocidade: Number(e.target.value) })} title="velocidade">
            {[0.6, 0.75, 0.9, 1, 1.15].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </div>
        <div
          className="barra"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const t = trecho.s + ((e.clientX - r.left) / r.width) * (fim - trecho.s);
            audio.toca(t, fim);
          }}
        >
          <div className="barra-cheia" style={{ width: `${Math.min(100, Math.max(0, prog * 100))}%` }} />
          {trecho.s2 !== undefined && <div className="barra-marca" style={{ left: `${((trecho.s2 - trecho.s) / (fim - trecho.s)) * 100}%` }} />}
        </div>
      </div>
      <span className="player-tempo">{dentro ? formataTempo(tempo - trecho.s) : "0:00"} / {formataTempo(fim - trecho.s)}</span>
    </div>
  );
}
