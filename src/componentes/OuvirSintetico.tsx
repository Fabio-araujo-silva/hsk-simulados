import { useEffect, useRef, useState } from "react";
import { falaNavegador, obtemTts, urlTts } from "../tts";

export interface UnidadeFala {
  rotulo: string;
  texto: string;
}

/**
 * "Ouvir com voz sintética": lê o enunciado e as alternativas de uma questão sem áudio original.
 * Cada trecho é gerado uma vez (ElevenLabs) e reaproveitado depois.
 */
export function OuvirSintetico({ unidades }: { unidades: UnidadeFala[] }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const cancela = useRef<() => void>(() => {});
  const [tocando, setTocando] = useState<number | null>(null);
  const [gerando, setGerando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [navegador, setNavegador] = useState(false);
  const sessao = useRef(0);

  useEffect(() => {
    audio.current = new Audio();
    return () => {
      sessao.current++;
      cancela.current();
      audio.current?.pause();
    };
  }, []);

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
      const viaNavegador = () => {
        setNavegador(true);
        setGerando(null);
        setTocando(i);
        cancela.current = falaNavegador(u.texto, () => fim());
      };
      if (navegador) return viaNavegador();
      setGerando(i);
      obtemTts(u.texto)
        .then((t) => {
          if (minhaSessao !== sessao.current) return fim();
          setGerando(null);
          setTocando(i);
          const a = audio.current!;
          a.src = urlTts(t);
          a.onended = () => fim();
          a.onerror = () => fim();
          cancela.current = () => {
            a.pause();
            fim();
          };
          a.play().catch(() => fim());
        })
        .catch((e) => {
          if (minhaSessao !== sessao.current) return fim();
          setAviso(`Voz ElevenLabs indisponível (${String(e.message ?? e).slice(0, 120)}). Usando a voz do navegador.`);
          viaNavegador();
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
      {aviso && <small className="aviso-tts">{aviso}</small>}
    </div>
  );
}
