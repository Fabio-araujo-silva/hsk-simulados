import { useCallback, useSyncExternalStore } from "react";

// Rascunho: alternativas riscadas com o botão direito do mouse (só na memória, some ao recarregar).

const mapa = new Map<string, Set<string>>();
const ouvintes = new Set<() => void>();
let versao = 0;

function assina(o: () => void) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export function alternaRiscada(chave: string, letra: string) {
  const s = new Set(mapa.get(chave) ?? []);
  if (s.has(letra)) s.delete(letra);
  else s.add(letra);
  mapa.set(chave, s);
  versao++;
  ouvintes.forEach((o) => o());
}

const VAZIO = new Set<string>();

/** [letras riscadas, alternar(letra)] para uma questão ou grupo. */
export function useRiscadas(chave: string): [Set<string>, (letra: string) => void] {
  useSyncExternalStore(assina, () => versao);
  const alterna = useCallback((letra: string) => alternaRiscada(chave, letra), [chave]);
  return [mapa.get(chave) ?? VAZIO, alterna];
}
