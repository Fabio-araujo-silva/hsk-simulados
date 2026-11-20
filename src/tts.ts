import { MODO_PUBLICO } from "./publico";
import { chaveCacheTts, textoParaFala } from "./vozConfig";

// Voz sintética (ElevenLabs) para as questões sem áudio original (leitura e escrita).
// O servidor local gera cada texto UMA vez e guarda em public/tts/; depois disso o arquivo é reaproveitado
// (inclusive por quem abrir o site sem servidor, se o arquivo já existir).
// No site público não existe /api/tts (a chave não sai do computador): só toca o que já está em public/tts,
// que vai junto no deploy — scripts/gera_tts.mjs mostra quantas falas faltam gerar antes de publicar.

/** O trecho ainda não foi gerado e aqui não há como gerar (site público ou estático). */
export class SemVozNoCache extends Error {
  constructor() {
    super(MODO_PUBLICO ? "este trecho ainda não tem voz sintética no site" : "voz sintética indisponível (sem servidor local / sem chave)");
  }
}

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
  // 1) servidor local: devolve do cache ou gera agora (no site público nem tenta)
  if (!MODO_PUBLICO) {
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
  }
  // 2) sem servidor: tenta o arquivo que já foi gerado antes (o mesmo hash do servidor: servidor/vozSintetica.ts)
  const h = await sha1(chaveCacheTts(texto));
  const r = await fetch(`${BASE}tts/${h}.json`);
  if (!r.ok) throw new SemVozNoCache();
  // servidores estáticos com "fallback" de SPA devolvem o index.html (200) no lugar de um arquivo que não existe
  const info = await r.json().catch(() => null);
  if (!info) throw new SemVozNoCache();
  return { arquivo: `tts/${h}.mp3`, ...info } as Tts;
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

// ---------------------------------------------------- iPhone: liberar o som dentro do toque
// A voz só toca depois de buscar o arquivo (fora do toque), e o Safari do iPhone recusa esse play().
// Tocar um silêncio de 0,1 s no próprio toque libera o elemento <audio> para os próximos play();
// a voz do navegador tem a mesma regra para o primeiro speak().

let silencioUrl = "";
/** WAV mudo de 0,1 s (8 kHz, 8 bits: 128 = silêncio), gerado aqui para não depender de arquivo. */
function silencio() {
  if (silencioUrl) return silencioUrl;
  const n = 800;
  const v = new DataView(new ArrayBuffer(44 + n));
  const txt = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  txt(8, "WAVE");
  txt(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  txt(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  silencioUrl = "data:audio/wav;base64," + btoa(String.fromCharCode(...new Uint8Array(v.buffer)));
  return silencioUrl;
}

const destravados = new WeakSet<HTMLAudioElement>();
let vozDestravada = false;

/** Chamar DENTRO do clique/toque, antes de qualquer await: libera `el` (e a voz do navegador) para tocar depois. */
export function destravaNoToque(el: HTMLAudioElement | null) {
  if (el && !destravados.has(el)) {
    destravados.add(el);
    el.src = silencio();
    el.play().catch(() => {});
  }
  if (!vozDestravada && window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
    vozDestravada = true;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

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
