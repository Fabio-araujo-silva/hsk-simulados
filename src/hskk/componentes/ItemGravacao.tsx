import { useEffect, useRef, useState } from "react";
import { useConfig } from "../armazenamento";
import { formataTempo } from "../dados";
import { transcreveGravacao, urlGravacao } from "../gravacoes";
import type { Gravacao, Prova, Questao } from "../tipos";
import { Comparacao } from "./Comparacao";

interface Props {
  tentId: string;
  prova: Prova;
  q: Questao;
  g: Gravacao;
  /** transcrever sozinho se ainda não foi (respeita a configuração) */
  auto?: boolean;
  /** mostra o texto da frase na comparação (no estudo, só depois de você tentar) */
  titulo?: string;
  onRevisao?: () => void;
}

/** Uma gravação sua: player + transcrição (ElevenLabs Scribe) + comparação (第一部分) ou estatísticas (partes 2–3). */
export function ItemGravacao({ tentId, prova, q, g, auto, titulo, onRevisao }: Props) {
  const cfg = useConfig();
  const [estado, setEstado] = useState<"parado" | "transcrevendo" | "erro">("parado");
  const [erro, setErro] = useState("");
  const pedido = useRef(false);
  const url = urlGravacao(g);

  const pede = async () => {
    if (pedido.current) return;
    pedido.current = true;
    setEstado("transcrevendo");
    try {
      const r = await transcreveGravacao(tentId, prova, q, g);
      setEstado("parado");
      if (r.foiParaRevisao) onRevisao?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setEstado("erro");
      pedido.current = false;
    }
  };

  useEffect(() => {
    if (auto && cfg.autoTranscrever && g.texto === undefined && !g.soNaSessao && g.dur > 0.6) void pede();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.arquivo]);

  const nChars = g.texto ? [...g.texto].filter((c) => /[㐀-鿿]/.test(c)).length : 0;
  return (
    <div className="item-gravacao">
      <div className="item-gravacao-topo">
        {titulo && <b>{titulo}</b>}
        <small>
          {new Date(g.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {formataTempo(g.dur)}
        </small>
        {url ? <audio controls preload="none" src={url} /> : <small className="falta">áudio indisponível (gravado sem o servidor local)</small>}
      </div>
      {g.texto !== undefined ? (
        q.parte === 1 ? (
          <>
            <Comparacao alvo={q.frase.zh} dito={g.texto} limiar={cfg.limiarRevisao} />
            <div className="ouvido">
              <small>o reconhecimento entendeu:</small> <span className="zh">{g.texto || "（nada）"}</span>
            </div>
          </>
        ) : (
          <div className="transcricao-fala">
            <small>o que você disse (transcrição automática):</small>
            <p className="zh">{g.texto || "（nada reconhecido）"}</p>
            <small className="estat">
              {nChars} caracteres em {formataTempo(g.dur)}
              {g.dur > 5 && ` · ≈ ${Math.round((nChars / g.dur) * 60)} caracteres/min`}
            </small>
          </div>
        )
      ) : g.soNaSessao ? (
        <small className="falta">sem o servidor local não dá para transcrever</small>
      ) : estado === "transcrevendo" ? (
        <small className="carregando">transcrevendo com o ElevenLabs Scribe…</small>
      ) : (
        <div>
          <button className="sec" onClick={() => void pede()}>
            transcrever e corrigir
          </button>
          {estado === "erro" && <small className="erro-inline"> não deu: {erro}</small>}
        </div>
      )}
    </div>
  );
}
