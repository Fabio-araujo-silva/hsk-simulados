import { useEffect, useMemo, useRef, useState } from "react";
import { ehNovo } from "./srs";
import type { CartaoSrs } from "./tipos";

// Fila da revisão espaçada, a mesma no HSK (src/paginas/Revisao.tsx) e no HSKK (src/hskk/paginas/Revisao.tsx).

const ANTECIPA_MS = 20 * 60 * 1000; // aprendendo: pode antecipar até 20 min se não houver mais nada

type CartaoFila = { id: string; criado: number; srs: CartaoSrs };

export function useFilaRevisao<C extends CartaoFila>(cartoes: Record<string, C>, novosHoje: number, novosPorDia: number) {
  const [agora, setAgora] = useState(Date.now());
  const [antecipar, setAntecipar] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const fila = useMemo(() => {
    const lista = Object.values(cartoes);
    const limite = antecipar ? agora + ANTECIPA_MS : agora;
    const revisoes = lista.filter((c) => !ehNovo(c) && c.srs.due <= limite).sort((a, b) => a.srs.due - b.srs.due);
    const vagas = Math.max(0, novosPorDia - novosHoje);
    const novos = lista.filter(ehNovo).sort((a, b) => a.criado - b.criado).slice(0, vagas);
    // intercala: 1 novo a cada 3 revisões
    const out: C[] = [];
    let i = 0;
    let j = 0;
    while (i < revisoes.length || j < novos.length) {
      for (let k = 0; k < 3 && i < revisoes.length; k++) out.push(revisoes[i++]);
      if (j < novos.length) out.push(novos[j++]);
    }
    return out;
  }, [cartoes, agora, antecipar, novosPorDia, novosHoje]);

  const proximo = useMemo(() => {
    const futuros = Object.values(cartoes).filter((c) => !ehNovo(c) && c.srs.due > agora);
    return futuros.length ? Math.min(...futuros.map((c) => c.srs.due)) : null;
  }, [cartoes, agora]);

  // O cartão na tela fica nela até ser respondido. Sem isso, um cartão em aprendizado que vence enquanto você está
  // em outro (o passo de 10 min, conferido a cada 15 s) entrava na frente da fila e tomava o lugar do atual. Os que
  // vencem nesse meio-tempo esperam a vez na ordem normal. "Respondido" = o estado FSRS dele mudou (aqui ou em outro
  // aparelho); se ele sumir (apagado), a fila segue.
  const naTela = useRef<C | null>(null);
  const fixo = naTela.current ? cartoes[naTela.current.id] : undefined;
  const atual: C | undefined =
    fixo && fixo.srs.reps === naTela.current!.srs.reps && fixo.srs.due === naTela.current!.srs.due ? fixo : fila[0];
  naTela.current = atual ?? null;
  // a fila mostrada começa pelo da tela (que pode ter saído da ordem por causa do passo que venceu no meio)
  const filaMostrada = atual && fila[0] !== atual ? [atual, ...fila.filter((c) => c.id !== atual.id)] : fila;

  return { fila: filaMostrada, atual, proximo, agora, antecipar, antecipa: () => setAntecipar(true), podeAntecipar: !!proximo && proximo - agora < ANTECIPA_MS && !antecipar };
}
