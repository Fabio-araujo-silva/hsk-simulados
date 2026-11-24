import { useEffect, useId, useRef } from "react";
import type { ControleAudio } from "../audio";

// Dragão chinês (龙) do Quick Listen: enquanto o áudio toca, ele voa da esquerda para a direita atrás da pérola (龙珠),
// a cabeça acompanhando o andamento do trecho — quando o áudio acaba, ele alcança a pérola. Parado, descansa ondulando
// devagar. Tudo é SVG desenhado aqui; o movimento é um laço de requestAnimationFrame que mexe direto nos atributos
// (sem re-renderizar o React a cada quadro).

/** o desenho é feito em unidades pequenas e ampliado por este fator */
const ESCALA = 1.4;
const SEGMENTOS = 30;
const PASSO = 10 * ESCALA;
const ALTURA = 104;
const MEIO = 58;
/** focinho: distância do pescoço até a ponta, já ampliada */
const FOCINHO = 37 * ESCALA;
/** onde fica o pescoço no começo e no fim do trecho (o fim é medido da borda direita: o focinho encosta na pérola) */
const INICIO = 72;
const FIM = 26 + FOCINHO;
const PATAS = [6, 18];

/** raio de cada escama sem a ampliação (a cabeça é o 0, a ponta da cauda o último) */
const raioBase = (i: number) => 9 - 6.5 * Math.pow(i / SEGMENTOS, 1.1);
const raio = (i: number) => raioBase(i) * ESCALA;
const graus = (rad: number) => (rad * 180) / Math.PI;

export function DragaoAudio({ audio, s, e, onSalta }: { audio: ControleAudio | null; s: number; e: number; onSalta?: (t: number) => void }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const tudo = useRef<SVGGElement>(null);
  const escamas = useRef<(SVGCircleElement | null)[]>([]);
  const espinhos = useRef<(SVGPathElement | null)[]>([]);
  const patas = useRef<(SVGGElement | null)[]>([]);
  const cauda = useRef<SVGGElement>(null);
  const cabeca = useRef<SVGGElement>(null);
  const mandibula = useRef<SVGGElement>(null);
  const bigode1 = useRef<SVGPathElement>(null);
  const bigode2 = useRef<SVGPathElement>(null);
  const fogo = useRef<SVGGElement>(null);
  const perola = useRef<SVGGElement>(null);
  const brilho = useRef<SVGCircleElement>(null);
  const nuvens = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const calmo = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let ultimo = performance.now();
    let fase = 0;
    let x: number | null = null;
    /** 0 = parado, 1 = voando (suavizado, para ele acelerar e desacelerar) */
    let energia = 0;
    const pts: [number, number][] = Array.from({ length: SEGMENTOS + 1 }, () => [0, 0]);

    const quadro = (agora: number) => {
      raf = requestAnimationFrame(quadro);
      const svg = svgRef.current;
      if (!svg) return;
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      const W = svg.clientWidth || 600;
      const t = audio?.tempo ?? 0;
      const voando = !!audio?.tocando && t >= s - 0.3 && t <= e + 0.3;
      const p = Math.min(1, Math.max(0, (t - s) / Math.max(0.1, e - s)));
      energia += ((voando ? 1 : 0) - energia) * Math.min(1, dt * 4);
      const alvo = INICIO + p * Math.max(0, W - INICIO - FIM);
      x = x === null || calmo ? alvo : x + (alvo - x) * Math.min(1, dt * 7);
      if (!calmo) fase += dt * (1.1 + 5.5 * energia);
      const amp = (calmo ? 3 : 3.5 + 11 * energia) * 1.25;

      for (let i = 0; i <= SEGMENTOS; i++) {
        // a cabeça balança menos que o corpo
        const solto = 0.35 + 0.65 * Math.min(1, i / 4);
        pts[i][0] = x - i * PASSO;
        pts[i][1] = MEIO + amp * Math.sin(fase - i * 0.42) * solto;
      }
      const angulo = (i: number) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(SEGMENTOS, i + 1)];
        return graus(Math.atan2(a[1] - b[1], a[0] - b[0]));
      };

      for (let i = 1; i <= SEGMENTOS; i++) {
        const [px, py] = pts[i];
        const c = escamas.current[i];
        if (c) {
          c.setAttribute("cx", px.toFixed(1));
          c.setAttribute("cy", py.toFixed(1));
        }
        espinhos.current[i]?.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${angulo(i).toFixed(1)}) scale(${ESCALA})`);
      }
      PATAS.forEach((i, k) => {
        const [px, py] = pts[i];
        const passada = -12 + 28 * Math.sin(fase * 0.9 + k * 2.1) * (0.3 + 0.7 * energia);
        patas.current[k]?.setAttribute(
          "transform",
          `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${angulo(i).toFixed(1)}) translate(0 ${(raio(i) - 3).toFixed(1)}) rotate(${passada.toFixed(1)}) scale(${ESCALA})`,
        );
      });
      const [cx, cy] = pts[SEGMENTOS];
      cauda.current?.setAttribute(
        "transform",
        `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(angulo(SEGMENTOS) + 8 * Math.sin(fase * 1.7)).toFixed(1)}) scale(${ESCALA})`,
      );

      const [hx, hy] = pts[0];
      cabeca.current?.setAttribute("transform", `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${(angulo(0) * 0.8).toFixed(1)}) scale(${ESCALA})`);
      // a boca abre mais quando ele está voando
      const boca = 6 + 10 * energia * (0.6 + 0.4 * Math.sin(fase * 2.3));
      mandibula.current?.setAttribute("transform", `rotate(${boca.toFixed(1)} -4 3)`);
      const w = 3.5 * Math.sin(fase * 1.3);
      bigode1.current?.setAttribute("d", `M 32 -2 C 44 -10, 34 ${(-17 + w).toFixed(1)}, 16 ${(-19 + w).toFixed(1)} S -8 ${(-15 - w).toFixed(1)}, -24 ${(-21 + w).toFixed(1)}`);
      bigode2.current?.setAttribute("d", `M 31 3 C 44 9, 32 ${(15 - w).toFixed(1)}, 15 ${(16 + w).toFixed(1)} S -6 ${(12 - w).toFixed(1)}, -22 ${(19 + w).toFixed(1)}`);
      if (fogo.current) {
        const chama = calmo ? 0 : energia * (0.75 + 0.25 * Math.sin(fase * 9));
        fogo.current.setAttribute("transform", `translate(35 4) rotate(${(boca * 0.5).toFixed(1)}) scale(${chama.toFixed(2)} ${(0.5 + 0.5 * chama).toFixed(2)})`);
        fogo.current.setAttribute("opacity", Math.min(1, energia * 1.3).toFixed(2));
      }

      // a pérola espera no fim do trecho e brilha quando ele chega perto
      const perto = Math.max(0, 1 - Math.abs(W - 26 - (hx + FOCINHO)) / 120);
      perola.current?.setAttribute(
        "transform",
        `translate(${(W - 26).toFixed(1)} ${(MEIO - 2 + 2.5 * Math.sin(fase * 0.8)).toFixed(1)}) rotate(${((fase * 30) % 360).toFixed(1)}) scale(1.25)`,
      );
      brilho.current?.setAttribute("r", (11 + 6 * perto + 1.5 * Math.sin(fase * 3)).toFixed(1));
      tudo.current?.setAttribute("opacity", (0.6 + 0.4 * energia).toFixed(2));
      nuvens.current.forEach((n, k) => n?.setAttribute("transform", `translate(${(W * (k ? 0.63 : 0.27)).toFixed(0)} ${k ? 88 : 18}) scale(1.2)`));
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [audio, s, e]);

  const salta = (ev: React.MouseEvent<SVGSVGElement>) => {
    if (!onSalta) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const p = (ev.clientX - r.left - INICIO) / Math.max(1, r.width - INICIO - FIM);
    onSalta(s + Math.min(1, Math.max(0, p)) * (e - s));
  };

  const g = (nome: string) => `${nome}-${id}`;
  return (
    <svg ref={svgRef} className="ql-dragao" height={ALTURA} width="100%" aria-hidden onClick={salta}>
      <defs>
        <radialGradient id={g("escama")} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ff7a52" />
          <stop offset="60%" stopColor="#d8331f" />
          <stop offset="100%" stopColor="#9e1b14" />
        </radialGradient>
        <linearGradient id={g("cabeca")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0563a" />
          <stop offset="100%" stopColor="#b0211a" />
        </linearGradient>
        <linearGradient id={g("fogo")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="45%" stopColor="#ffb02e" />
          <stop offset="100%" stopColor="#ff4d1a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={g("perola")} cx="38%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#f2a516" />
        </radialGradient>
        <radialGradient id={g("brilho")}>
          <stop offset="0%" stopColor="#ffd35c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffd35c" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* nuvens auspiciosas (祥云) ao fundo */}
      {[0, 1].map((k) => (
        <g
          key={k}
          ref={(el) => {
            nuvens.current[k] = el;
          }}
          className="dg-nuvem"
        >
          <path d="M -22 4 C -26 -4 -14 -10 -9 -4 C -8 -13 6 -14 8 -5 C 12 -11 24 -7 20 2 C 26 2 26 9 19 9 L -18 9 C -25 9 -26 4 -22 4 Z" />
          <path d="M -9 -4 C -6 0 -10 3 -13 1 M 8 -5 C 10 -1 6 2 3 0" />
        </g>
      ))}

      {/* pérola flamejante */}
      <g ref={perola}>
        <circle ref={brilho} r="12" fill={`url(#${g("brilho")})`} />
        {[0, 120, 240].map((a) => (
          <path key={a} transform={`rotate(${a})`} d="M 0 -8 C 4 -12 3 -17 7 -19 C 5 -14 9 -12 6 -7 Z" fill="#ff9a1f" opacity="0.85" />
        ))}
        <circle r="6.5" fill={`url(#${g("perola")})`} stroke="#e08a00" strokeWidth="0.8" />
      </g>

      <g ref={tudo}>
        {/* patas atrás do corpo */}
        {PATAS.map((i, k) => (
          <g
            key={i}
            ref={(el) => {
              patas.current[k] = el;
            }}
            className="dg-pata"
          >
            <ellipse cx="0" cy="3" rx="3.2" ry="5" fill={`url(#${g("escama")})`} />
            <path d="M 0 5 L 2 12 M 2 12 l -3.5 3 M 2 12 l 0.5 4.5 M 2 12 l 4 2.5" />
          </g>
        ))}

        {/* cauda */}
        <g ref={cauda}>
          <path d="M 0 0 C -6 -9 -15 -6 -21 -13 C -18 -3 -12 1 -4 2 Z" fill="#ff9a1f" />
          <path d="M 0 0 C -6 7 -14 6 -20 12 C -16 2 -9 0 -2 -1 Z" fill="#f2c14e" />
        </g>

        {/* corpo: da cauda para a cabeça (as escamas da frente ficam por cima) */}
        {Array.from({ length: SEGMENTOS }, (_, j) => SEGMENTOS - j).map((i) => {
          // o espinho é desenhado sem a ampliação (ela vem no transform); a escama já no tamanho final
          const r = raioBase(i);
          return (
            <g key={i}>
              <path
                ref={(el) => {
                  espinhos.current[i] = el;
                }}
                className="dg-espinho"
                d={`M -3.2 ${(-r + 1.5).toFixed(1)} L 0.8 ${(-r - 5.5).toFixed(1)} L 3.2 ${(-r + 1.5).toFixed(1)} Z`}
              />
              <circle
                ref={(el) => {
                  escamas.current[i] = el;
                }}
                r={raio(i).toFixed(1)}
                fill={`url(#${g("escama")})`}
                className="dg-escama"
              />
            </g>
          );
        })}

        {/* cabeça (virada para a direita; a origem é o pescoço) */}
        <g ref={cabeca}>
          <path className="dg-juba" d="M -4 -7 C -14 -16 -22 -8 -15 -3 C -24 -2 -22 7 -13 6 C -18 13 -6 14 -2 7 Z" />
          <path className="dg-chifre" d="M 4 -12 C 0 -20 -8 -24 -17 -25 M -7 -21 C -9 -26 -11 -28 -13 -31" />
          <path className="dg-chifre escuro" d="M 9 -12 C 7 -19 1 -23 -6 -26" />
          <g ref={fogo} opacity="0">
            <path d="M 0 0 C 8 -8 20 -6 30 0 C 20 6 8 8 0 0 Z" fill={`url(#${g("fogo")})`} />
            <path d="M 2 0 C 8 -3 14 -2 20 0 C 14 2 8 3 2 0 Z" fill="#fff6c8" opacity="0.9" />
          </g>
          <g ref={mandibula}>
            <path d="M -4 3 C 6 5 18 5 30 4 C 32 6 30 9 26 9 C 16 10 6 10 -4 8 Z" fill="#8f1a14" stroke="#f2c14e" strokeWidth="0.8" />
            <path d="M 19 4.6 l 1.3 -2.4 l 1.3 2.4 Z M 24 4.4 l 1.4 -2.6 l 1.4 2.6 Z" fill="#fff" />
            <path className="dg-barba" d="M 2 8.5 q 1 7 -4 11 M 8 9.5 q 1 6 -3 10 M 14 9.5 q 1 5 -2 8" />
          </g>
          <path
            d="M -8 -7 C -2 -14 10 -14 16 -10 C 22 -7 28 -8 33 -6 C 37 -5 37 -1 33 0 L 16 1 C 8 2 0 3 -8 4 Z"
            fill={`url(#${g("cabeca")})`}
            stroke="#f2c14e"
            strokeWidth="1"
          />
          <path d="M 29 0 l 1 3 l 1.2 -3 Z M 22 0.6 l 1 2.6 l 1 -2.6 Z" fill="#fff" />
          <circle cx="33" cy="-4" r="2.2" fill="#e2412b" stroke="#f2c14e" strokeWidth="0.8" />
          <path className="dg-sobrancelha" d="M 6 -10 Q 12 -14 18 -10" />
          <ellipse cx="12" cy="-7" rx="3.1" ry="2.4" fill="#fffbe8" />
          <circle cx="12.8" cy="-7" r="1.4" fill="#1a1a1a" />
          <circle cx="13.3" cy="-7.6" r="0.45" fill="#fff" />
          <path ref={bigode1} className="dg-bigode" d="M 32 -2 C 44 -10 34 -17 16 -19 S -8 -15 -24 -21" />
          <path ref={bigode2} className="dg-bigode" d="M 31 3 C 44 9 32 15 15 16 S -6 12 -22 19" />
        </g>
      </g>
    </svg>
  );
}
