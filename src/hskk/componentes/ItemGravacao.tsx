import { useEffect, useRef, useState } from "react";
import { atualizaGravacao, useConfig } from "../armazenamento";
import { adicionaRevisao } from "../cartoes";
import { formataTempo } from "../dados";
import { SEM_TRANSCRICAO, transcreveGravacao, urlGravacao } from "../gravacoes";
import type { Autoavaliacao, Gravacao, Prova, Questao } from "../tipos";
import { MODO_PUBLICO } from "../../publico";

/** Sem transcrição, quem avalia a repetição do 第一部分 é você: "quase" e "longe" mandam a frase para a revisão. */
const AUTOAVALIACOES: { v: Autoavaliacao; rotulo: string }[] = [
  { v: "tudo", rotulo: "repeti tudo" },
  { v: "quase", rotulo: "faltou um pouco" },
  { v: "longe", rotulo: "faltou bastante" },
];
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
        {url ? (
          <audio controls preload="none" src={url} />
        ) : (
          <small className="falta">{MODO_PUBLICO ? "áudio indisponível (a gravação fica só enquanto a aba está aberta)" : "áudio indisponível (gravado sem o servidor local)"}</small>
        )}
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
      ) : g.soNaSessao && !MODO_PUBLICO ? (
        // versão local sem o servidor (site estático, ou o envio da gravação falhou): como sempre foi
        <small className="falta">{SEM_TRANSCRICAO}</small>
      ) : g.soNaSessao ? (
        // site público: sem transcrição automática, a pessoa compara de ouvido e diz como foi (parte 1 → revisão)
        <div className="autoavaliacao">
          <small className="falta">{SEM_TRANSCRICAO}</small>
          {q.parte === 1 && (
            <div className="acoes">
              <small>como foi?</small>
              {AUTOAVALIACOES.map((a) => (
                <button
                  key={a.v}
                  className={`chip ${g.autoavaliacao === a.v ? "on" : ""}`}
                  onClick={() => {
                    atualizaGravacao(tentId, q.n, g.arquivo, { autoavaliacao: a.v });
                    if (a.v !== "tudo" && adicionaRevisao(prova, q)) onRevisao?.();
                  }}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
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
