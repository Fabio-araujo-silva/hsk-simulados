import { useEffect, useMemo, useState } from "react";
import { useEstado } from "../armazenamento";
import { carregaIndice, mediaParte1, provasFeitas } from "../dados";
import type { ResumoProva } from "../tipos";

/** Cartão do HSKK na escolha de nível (mesmo estilo dos cartões HSK 1–3), levando a #/hskk. */
export function CartaoHskk() {
  const [provas, setProvas] = useState<ResumoProva[] | null>(null);
  const tentativas = useEstado((e) => e.tentativas);

  useEffect(() => {
    carregaIndice()
      .then(setProvas)
      .catch(() => setProvas([]));
  }, []);

  const { exames, estudadas } = useMemo(() => {
    const ts = Object.values(tentativas);
    const estudo = ts.filter((t) => t.modo === "estudo" && !t.arquivada && Object.values(t.gravacoes).some((gs) => gs.length));
    return { exames: provasFeitas(ts), estudadas: new Set(estudo.map((t) => t.prova)).size };
  }, [tentativas]);
  const p1 = exames[0] ? mediaParte1(exames[0]) : null;

  return (
    <a href="#/hskk" className="cartao-nivel">
      <div className="nivel-topo">
        <span className="nivel-nome">
          HSKK <span className="zh">中级</span>
        </span>
        <span className="nivel-zh zh">口语</span>
      </div>
      <div className="nivel-num">
        <b>{provas ? provas.length : "…"}</b> provas reais · prova oral
      </div>
      <ul>
        <li>14 questões em ~21–23 min: repetir 10 frases, falar 2 min sobre 2 figuras e responder 2 perguntas.</li>
        <li>Você fala no microfone: a gravação é transcrita (ElevenLabs Scribe) e comparada com o original; respostas-modelo nas partes 2 e 3.</li>
        <li>Nota de 0 a 100, aprovação com 60 (avaliadores ouvem a gravação).</li>
      </ul>
      <div className="nivel-rodape">
        {exames.length > 0 ? (
          <>
            {exames.length} feita(s) no modo prova
            {p1 !== null && (
              <>
                {" "}
                · última: parte 1 <b>{p1}%</b>
              </>
            )}
          </>
        ) : estudadas > 0 ? (
          `estudo começado em ${estudadas} prova(s)`
        ) : (
          "nenhuma prova feita ainda"
        )}
      </div>
    </a>
  );
}
