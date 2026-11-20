import { useEffect, useRef } from "react";
import { useTempo, type ControleAudio } from "../audio";
import { formataTempo } from "../dados";
import type { Prova } from "../tipos";
import { Frase } from "./Leitura";

/** O áudio inteiro da prova com o texto rolando junto (bom para shadowing). */
export function RoteiroCompleto({ prova, audio }: { prova: Prova; audio: ControleAudio | null }) {
  const { tempo, tocando } = useTempo(audio);
  const ativoRef = useRef<HTMLDivElement>(null);
  const segs = prova.roteiro ?? [];
  const questoes = new Map(prova.questoes.map((q) => [q.n, q]));

  // segmento atual
  let atual = -1;
  segs.forEach((s, i) => {
    const ini = s.s ?? (s.n ? questoes.get(s.n)?.audio?.s : undefined);
    if (ini !== undefined && ini <= tempo + 0.05) atual = i;
  });

  useEffect(() => {
    if (tocando) ativoRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [atual, tocando]);

  if (!audio) return <div className="aviso">Esta prova ainda não tem áudio.</div>;

  return (
    <div className="roteiro">
      <div className="roteiro-controles">
        {/* o roteiro é o áudio inteiro: o ▶ não para no fim da última leitura que você ouviu */}
        <button className="btn-play" onClick={() => (tocando ? audio.pausa() : audio.continua(null, true))}>
          {tocando ? "❚❚" : "▶"}
        </button>
        <span>
          {formataTempo(tempo)} / {formataTempo(audio.duracao || prova.audio?.duracao || 0)}
        </span>
        <small>clique em qualquer palavra para ouvir a partir dela · o texto acompanha o áudio</small>
      </div>
      {segs.map((s, i) => {
        const q = s.n ? questoes.get(s.n) : undefined;
        const ini = s.s ?? q?.audio?.s;
        return (
          <div key={i} ref={i === atual ? ativoRef : undefined} className={`seg seg-${s.tipo} ${i === atual ? "atual" : ""}`}>
            {ini !== undefined && (
              <button className="seg-tempo" onClick={() => audio.toca(ini)}>
                {formataTempo(ini)}
              </button>
            )}
            <div className="seg-corpo">
              {s.tipo === "questao" && q && <span className="seg-n">{q.n}.</span>}
              {s.f && <Frase f={s.f} />}
              {(s.falas ?? q?.falas ?? []).map((f, j) => (
                <div key={j} className="fala">
                  {f.fal && <span className="falante">{f.fal === "★" ? "★" : `${f.fal}：`}</span>}
                  <Frase f={f.f} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
