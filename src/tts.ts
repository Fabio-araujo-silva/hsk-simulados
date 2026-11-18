import { chaveCacheTts, textoParaFala } from "./vozConfig";

// Voz sintética (ElevenLabs) para as questões sem áudio original (leitura e escrita).
// O servidor local gera cada texto UMA vez e guarda em public/tts/; depois disso o arquivo é reaproveitado
// (inclusive por quem abrir o site sem servidor, se o arquivo já existir).

export interface Tts {
  arquivo: string;
  caracteres: string[];
  inicio: number[];
  fim: number[];
}

const BASE = import.meta.env.BASE_URL;
const memoria = new Map<string, Promise<Tts>>();

async function sha1(t: string) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20);
}

async function busca(texto: string): Promise<Tts> {
  // 1) servidor local: devolve do cache ou gera agora
  try {
    const r = await fetch(`${BASE}api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
    const tipo = r.headers.get("content-type") ?? "";
    if (tipo.includes("json")) {
      const d = await r.json();
      if (r.ok) return d as Tts;
      if (r.status !== 404) throw new Error(d.erro ?? `HTTP ${r.status}`);
    }
  } catch (e) {
    if (e instanceof Error && !/Failed to fetch|NetworkError|404/.test(e.message)) throw e;
  }
  // 2) sem servidor: tenta o arquivo que já foi gerado antes
  const h = await sha1(chaveCacheTts(texto));
  const r = await fetch(`${BASE}tts/${h}.json`);
  if (!r.ok) throw new Error("voz sintética indisponível (sem servidor local / sem chave)");
  return { arquivo: `tts/${h}.mp3`, ...(await r.json()) } as Tts;
}

export function obtemTts(texto: string): Promise<Tts> {
  const k = textoParaFala(texto);
  if (!memoria.has(k)) {
    const p = busca(texto);
    p.catch(() => memoria.delete(k));
    memoria.set(k, p);
  }
  return memoria.get(k)!;
}

export const urlTts = (t: Tts) => BASE + t.arquivo;

/** O navegador tem alguma voz chinesa instalada? (no Windows, muitas vezes não — aí a voz do navegador fica muda) */
export const temVozChinesaNoNavegador = () => !!window.speechSynthesis?.getVoices().some((v) => v.lang.toLowerCase().startsWith("zh"));

/** Alternativa gratuita: a voz chinesa do próprio navegador (sem cache, qualidade variável). */
export function falaNavegador(texto: string, aoTerminar: () => void, velocidade = 1) {
  const s = window.speechSynthesis;
  if (!s) {
    aoTerminar();
    return () => {};
  }
  const u = new SpeechSynthesisUtterance(textoParaFala(texto));
  u.lang = "zh-CN";
  u.rate = 0.85 * velocidade;
  const voz = s.getVoices().find((v) => v.lang.toLowerCase().startsWith("zh"));
  if (voz) u.voice = voz;
  u.onend = aoTerminar;
  u.onerror = aoTerminar;
  s.speak(u);
  return () => s.cancel();
}
