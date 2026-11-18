import { useEffect, useRef, useState } from "react";
import { mudaConfig, useConfig } from "../armazenamento";
import { MODO_PUBLICO } from "../publico";
import { falaNavegador, obtemTts, temVozChinesaNoNavegador, urlTts } from "../tts";
import type { UnidadeFala } from "../falaQuestao";
export type { UnidadeFala } from "../falaQuestao";

/** velocidades oferecidas para a voz sintética (abaixo de 1× para treinar o ouvido) */
export const VELOCIDADES = [0.5, 0.6, 0.75, 0.9, 1];

/**
 * "Ouvir com voz sintética": lê o enunciado e as alternativas de uma questão sem áudio original.
 * Cada trecho é gerado uma vez (ElevenLabs) e reaproveitado depois.
 * Se a geração falhar, avisa e — só se o navegador tiver voz chinesa — usa a voz do navegador para aquele trecho;
 * o próximo clique tenta a ElevenLabs de novo.
 */
export function OuvirSintetico({ unidades }: { unidades: UnidadeFala[] }) {
  const cfg = useConfig();
  const velocidade = cfg.velocidadeVoz ?? 1;
  const audio = useRef<HTMLAudioElement | null>(null);
  const cancela = useRef<() => void>(() => {});
  const [tocando, setTocando] = useState<number | null>(null);
  const [gerando, setGerando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const sessao = useRef(0);

  useEffect(() => {
    audio.current = new Audio();
    return () => {
      sessao.current++;
      cancela.current();
      audio.current?.pause();
    };
  }, []);

  // mudar a velocidade vale também para o trecho que já está tocando
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidade;
  }, [velocidade]);

  const para = () => {
    sessao.current++;
    cancela.current();
    audio.current?.pause();
    setTocando(null);
    setGerando(null);
  };

  const tocaUma = (i: number, minhaSessao: number) =>
    new Promise<void>((fim) => {
      const u = unidades[i];
      setGerando(i);
      obtemTts(u.texto)
        .then((t) => {
          if (minhaSessao !== sessao.current) return fim();
          setAviso(null);
          setGerando(null);
          setTocando(i);
          const a = audio.current!;
          a.src = urlTts(t);
          a.playbackRate = velocidade;
          (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
          a.onended = () => fim();
          a.onerror = () => {
            setAviso("Não consegui tocar o arquivo de voz gerado. Clique de novo para tentar outra vez.");
            fim();
          };
          cancela.current = () => {
            a.pause();
            fim();
          };
          a.play().catch((e) => {
            setAviso(`O navegador bloqueou a reprodução (${String(e?.message ?? e).slice(0, 80)}). Clique de novo.`);
            fim();
          });
        })
        .catch((e) => {
          if (minhaSessao !== sessao.current) return fim();
          setGerando(null);
          const motivo = String(e?.message ?? e).slice(0, 140);
          if (MODO_PUBLICO) {
            // no site público não há como gerar voz nova: ou está em public/tts, ou fica a voz do navegador
            const temVoz = temVozChinesaNoNavegador();
            setAviso(
              temVoz
                ? `Este trecho ainda não tem voz sintética no site: foi lido com a voz do navegador.`
                : `Este trecho ainda não tem voz sintética no site, e o navegador não tem voz chinesa instalada (no Windows: Configurações → Hora e idioma → Fala).`,
            );
            if (temVoz) {
              setTocando(i);
              cancela.current = falaNavegador(u.texto, () => fim(), velocidade);
            } else fim();
          } else if (temVozChinesaNoNavegador()) {
            setAviso(`Voz ElevenLabs indisponível agora (${motivo}). Este trecho foi lido com a voz do navegador — clique de novo para tentar a ElevenLabs.`);
            setTocando(i);
            cancela.current = falaNavegador(u.texto, () => fim(), velocidade);
          } else {
            setAviso(`Voz ElevenLabs indisponível agora (${motivo}) e o navegador não tem voz chinesa instalada. Clique de novo para tentar outra vez.`);
            fim();
          }
        });
    });

  const toca = async (indices: number[]) => {
    para();
    const minha = ++sessao.current;
    for (const i of indices) {
      if (minha !== sessao.current) return;
      await tocaUma(i, minha);
      if (indices.length > 1) await new Promise((r) => setTimeout(r, 350));
    }
    if (minha === sessao.current) {
      setTocando(null);
      setGerando(null);
    }
  };

  if (!unidades.length) return null;
  const ocupado = tocando !== null || gerando !== null;

  return (
    <div className="ouvir-sintetico">
      <span className="rotulo-secao">🔊 ouvir (voz sintética)</span>
      <button className={`chip ${ocupado ? "on" : ""}`} onClick={() => (ocupado ? para() : toca(unidades.map((_, i) => i)))}>
        {ocupado ? "■ parar" : "▶ tudo"}
      </button>
      {unidades.map((u, i) => (
        <button key={i} className={`chip ${tocando === i ? "on" : ""}`} onClick={() => toca([i])} title={u.texto}>
          {gerando === i ? "gerando…" : u.rotulo}
        </button>
      ))}
      <select className="velocidade-voz" value={velocidade} onChange={(e) => mudaConfig({ velocidadeVoz: Number(e.target.value) })} title="velocidade da voz sintética">
        {VELOCIDADES.map((v) => (
          <option key={v} value={v}>
            {String(v).replace(".", ",")}×
          </option>
        ))}
      </select>
      {aviso && <small className="aviso-tts">{aviso}</small>}
    </div>
  );
}
