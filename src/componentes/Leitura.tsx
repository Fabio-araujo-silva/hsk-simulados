import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTempo, type ControleAudio } from "../audio";
import type { Frase as TFrase, Lexico } from "../tipos";

// Contexto de leitura: tradução por hover, pinyin, clique-para-ouvir e realce karaokê.

interface Dica {
  x: number;
  y: number;
  palavra?: string;
  py?: string;
  pt?: string;
  en?: string;
  hsk?: number;
  frase?: string;
  selecao?: { w: string; py: string; pt?: string }[];
}

interface Ctx {
  lexico: Lexico | null;
  traducao: boolean;
  pinyin: boolean;
  audio: ControleAudio | null;
  mostraDica: (d: Dica | null) => void;
  /** registra palavras consultadas (viram sugestões de cartões) */
  consultou?: (w: string) => void;
}

const Contexto = createContext<Ctx>({
  lexico: null,
  traducao: false,
  pinyin: false,
  audio: null,
  mostraDica: () => {},
});

export const useLeitura = () => useContext(Contexto);

export function ProvedorLeitura(props: {
  lexico: Lexico | null;
  traducao: boolean;
  pinyin: boolean;
  audio: ControleAudio | null;
  consultou?: (w: string) => void;
  children: ReactNode;
}) {
  const [dica, setDica] = useState<Dica | null>(null);
  const timer = useRef<number>();
  const mostraDica = useCallback((d: Dica | null) => {
    window.clearTimeout(timer.current);
    if (d) setDica(d);
    else timer.current = window.setTimeout(() => setDica(null), 120);
  }, []);
  const valor = useMemo(
    () => ({ lexico: props.lexico, traducao: props.traducao, pinyin: props.pinyin, audio: props.audio, mostraDica, consultou: props.consultou }),
    [props.lexico, props.traducao, props.pinyin, props.audio, mostraDica, props.consultou],
  );
  useEffect(() => {
    if (!props.traducao) setDica(null);
  }, [props.traducao]);
  useEffect(() => {
    const some = () => setDica(null);
    window.addEventListener("scroll", some, true);
    return () => window.removeEventListener("scroll", some, true);
  }, []);
  return (
    <Contexto.Provider value={valor}>
      {props.children}
      {dica && <BalaoDica d={dica} />}
    </Contexto.Provider>
  );
}

function BalaoDica({ d }: { d: Dica }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: d.x, top: d.y + 8 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = d.x - r.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    let top = d.y + 10;
    if (top + r.height > window.innerHeight - 8) top = d.y - r.height - 34;
    setPos({ left, top });
  }, [d]);
  return (
    <div className="dica" ref={ref} style={{ left: pos.left, top: pos.top }} role="tooltip">
      {d.palavra && (
        <div className="dica-palavra">
          <span className="zh">{d.palavra}</span>
          {d.py && <span className="dica-py">{d.py}</span>}
          {d.hsk && <span className="dica-hsk">HSK {d.hsk}</span>}
        </div>
      )}
      {d.pt && <div className="dica-pt">{d.pt}</div>}
      {!d.pt && d.en && <div className="dica-en">{d.en}</div>}
      {d.selecao && (
        <div className="dica-selecao">
          {d.selecao.map((s, i) => (
            <div key={i}>
              <span className="zh">{s.w}</span> <span className="dica-py">{s.py}</span> — {s.pt ?? "…"}
            </div>
          ))}
        </div>
      )}
      {d.frase && <div className="dica-frase">{d.frase}</div>}
    </div>
  );
}

const PONTUACAO = /^[\s，。？！、：；“”‘’（）《》…—\-.,!?;:()"'＿·]+$/;
export const ehPontuacao = (w: string) => PONTUACAO.test(w);

interface PropsFrase {
  f: TFrase | null | undefined;
  /** usa a tradução com lacuna (antes de responder) */
  semSpoiler?: boolean;
  /** fim de cada leitura (o clique toca da palavra até aqui) */
  fim1?: number;
  fim2?: number;
  /** destaca este trecho (ex.: justificativa da resposta) */
  destaque?: string;
  className?: string;
  /** sem tradução/hover (ex.: modo prova) */
  inerte?: boolean;
}

/** Renderiza uma frase chinesa palavra por palavra. */
export function Frase({ f, semSpoiler, fim1, fim2, destaque, className, inerte }: PropsFrase) {
  const ctx = useLeitura();
  const temTempo = !!(f?.a?.some(Boolean) || f?.a2?.some(Boolean));
  const { tempo, tocando } = useTempo(temTempo && !inerte ? ctx.audio : null);
  const refSpan = useRef<HTMLSpanElement>(null);

  // índices dos tokens que caem dentro do trecho destacado
  const destacados = useMemo(() => {
    const s = new Set<number>();
    if (!f || !destaque) return s;
    const ini = f.zh.indexOf(destaque);
    if (ini < 0) return s;
    const fim = ini + destaque.length;
    let pos = 0;
    f.tk.forEach((t, i) => {
      const a = pos;
      const b = pos + t.length;
      if (b > ini && a < fim) s.add(i);
      pos = b;
    });
    return s;
  }, [f, destaque]);

  if (!f) return null;
  const traduzFrase = semSpoiler ? f.ptL ?? undefined : f.pt;

  const aoEntrar = (i: number, ev: React.MouseEvent) => {
    if (inerte || !ctx.traducao) return;
    const w = f.tk[i];
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (ehPontuacao(w)) {
      ctx.mostraDica({ x: r.left + r.width / 2, y: r.bottom, frase: traduzFrase });
      return;
    }
    const v = ctx.lexico?.[w];
    ctx.mostraDica({
      x: r.left + r.width / 2,
      y: r.bottom,
      palavra: w,
      py: f.py[i] || v?.py,
      pt: v?.pt,
      en: v?.en,
      hsk: v?.hsk,
      frase: traduzFrase,
    });
    ctx.consultou?.(w);
  };

  const aoSoltar = () => {
    if (inerte || !ctx.traducao) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !refSpan.current) return;
    const filhos = Array.from(refSpan.current.querySelectorAll<HTMLElement>("[data-i]"));
    const idx = filhos.filter((el) => sel.containsNode(el, true)).map((el) => Number(el.dataset.i));
    if (idx.length < 2) return;
    const rr = sel.getRangeAt(0).getBoundingClientRect();
    ctx.mostraDica({
      x: rr.left + rr.width / 2,
      y: rr.bottom,
      selecao: idx
        .filter((i) => !ehPontuacao(f.tk[i]))
        .map((i) => ({ w: f.tk[i], py: f.py[i] || ctx.lexico?.[f.tk[i]]?.py || "", pt: ctx.lexico?.[f.tk[i]]?.pt ?? ctx.lexico?.[f.tk[i]]?.en })),
      frase: traduzFrase,
    });
  };

  const aoClicar = (i: number) => {
    if (inerte || !ctx.audio) return;
    const t1 = f.a?.[i];
    const t2 = f.a2?.[i];
    if (!t1 && !t2) return;
    // se está tocando a 2ª leitura, pula dentro dela; senão, na 1ª
    const naSegunda = t2 && fim2 !== undefined && f.a2 && tempo >= (f.a2.find(Boolean)?.[0] ?? Infinity) - 0.5 && tempo <= fim2 + 0.5;
    if (naSegunda && t2) ctx.audio.toca(t2[0], fim2 ?? null);
    else if (t1) ctx.audio.toca(t1[0], fim1 ?? null);
    else if (t2) ctx.audio.toca(t2[0], fim2 ?? null);
  };

  return (
    <span className={`frase ${ctx.pinyin && !inerte ? "com-pinyin" : ""} ${className ?? ""}`} ref={refSpan} onMouseUp={aoSoltar}>
      {f.tk.map((w, i) => {
        const pont = ehPontuacao(w);
        const t1 = f.a?.[i];
        const t2 = f.a2?.[i];
        const ativo =
          tocando && ((t1 && tempo >= t1[0] && tempo < t1[1] + 0.05) || (t2 && tempo >= t2[0] && tempo < t2[1] + 0.05));
        const cls = [
          "tk",
          pont ? "pont" : "",
          !inerte && (t1 || t2) ? "clicavel" : "",
          !inerte && ctx.traducao && !pont ? "traduzivel" : "",
          ativo ? "ativo" : "",
          destacados.has(i) ? "destacado" : "",
        ].join(" ");
        const conteudo =
          ctx.pinyin && !inerte && !pont && f.py[i] ? (
            <ruby>
              {w}
              <rt>{f.py[i]}</rt>
            </ruby>
          ) : (
            w
          );
        return (
          <span
            key={i}
            data-i={i}
            className={cls}
            onMouseEnter={(ev) => aoEntrar(i, ev)}
            onMouseLeave={() => !inerte && ctx.mostraDica(null)}
            onClick={() => aoClicar(i)}
          >
            {conteudo}
          </span>
        );
      })}
    </span>
  );
}

/** Texto chinês simples sem dados de tokens (fallback). */
export function ZH({ children }: { children: ReactNode }) {
  return <span className="zh">{children}</span>;
}
