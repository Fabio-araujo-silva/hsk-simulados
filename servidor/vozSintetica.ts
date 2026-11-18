import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chaveCacheTts, textoParaFala, VOZ_TTS } from "../src/vozConfig";

/**
 * POST /api/tts {texto} → gera (uma única vez) a leitura do texto com a voz da ElevenLabs
 * e guarda em public/tts/<hash>.mp3 + .json (tempo de cada caractere). Da segunda vez em diante
 * só devolve o arquivo que já existe — nada é gerado de novo.
 * A chave (ELEVENLABS_API_KEY) fica no .env e nunca vai para o navegador.
 */
export function vozSintetica(raiz: string): Plugin {
  const dir = path.join(raiz, "public", "tts");
  const emAndamento = new Map<string, Promise<unknown>>();

  const chave = () => {
    try {
      const env = fs.readFileSync(path.join(raiz, ".env"), "utf-8");
      const m = env.match(/^ELEVENLABS_API_KEY=(.+)$/m);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    }
  };

  const hash = (texto: string) => crypto.createHash("sha1").update(chaveCacheTts(texto)).digest("hex").slice(0, 20);

  async function gera(texto: string) {
    const h = hash(texto);
    const mp3 = path.join(dir, `${h}.mp3`);
    const meta = path.join(dir, `${h}.json`);
    if (fs.existsSync(mp3) && fs.existsSync(meta)) return { status: 200, corpo: { arquivo: `tts/${h}.mp3`, ...JSON.parse(fs.readFileSync(meta, "utf-8")) } };
    const k = chave();
    if (!k) return { status: 503, corpo: { erro: "sem ELEVENLABS_API_KEY no .env" } };
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOZ_TTS.vozId}/with-timestamps?output_format=${VOZ_TTS.formato}`;
    type Resposta = {
      audio_base64?: string;
      alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
      detail?: { message?: string; status?: string } | string;
    };
    // a mesma chave é usada por outros processos (ex.: transcrição com o Scribe): limite de pedidos simultâneos (429)
    // e falhas passageiras (5xx, rede) são comuns — tenta de novo antes de desistir
    let r: Response | null = null;
    let d: Resposta = {};
    let falhaRede = "";
    for (const espera of [0, 1500, 4000, 8000]) {
      if (espera) await new Promise((ok) => setTimeout(ok, espera));
      try {
        r = await fetch(url, {
          method: "POST",
          headers: { "xi-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: textoParaFala(texto),
            model_id: VOZ_TTS.modelo,
            voice_settings: { stability: 0.6, similarity_boost: 0.75, speed: VOZ_TTS.velocidade },
          }),
        });
        d = (await r.json().catch(() => ({}))) as Resposta;
        falhaRede = "";
        if (r.ok && d.audio_base64) break;
        if (r.status !== 429 && r.status < 500) break;
      } catch (e) {
        falhaRede = String(e);
      }
    }
    if (!r || !r.ok || !d.audio_base64) {
      const msg = falhaRede || (typeof d.detail === "string" ? d.detail : d.detail?.message ?? `HTTP ${r?.status}`);
      console.warn(`[voz-sintetica] falhou para "${textoParaFala(texto).slice(0, 30)}": ${msg}`);
      return { status: r && (r.status === 401 || r.status === 403) ? 403 : 502, corpo: { erro: msg } };
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(mp3, Buffer.from(d.audio_base64, "base64"));
    const info = {
      texto: textoParaFala(texto),
      caracteres: d.alignment?.characters ?? [],
      inicio: d.alignment?.character_start_times_seconds ?? [],
      fim: d.alignment?.character_end_times_seconds ?? [],
    };
    fs.writeFileSync(meta, JSON.stringify(info));
    return { status: 200, corpo: { arquivo: `tts/${h}.mp3`, ...info } };
  }

  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // arquivos gerados depois que o servidor subiu: o Vite só conhece os de public/ que existiam na partida
    // (e public/tts fica fora do watcher), então devolveria o index.html no lugar do áudio
    const arq = req.method === "GET" ? req.url?.match(/^\/tts\/([0-9a-f]{20})\.(mp3|json)(\?|$)/) : null;
    if (arq) {
      const caminho = path.join(dir, `${arq[1]}.${arq[2]}`);
      if (!fs.existsSync(caminho)) return next();
      res.setHeader("Content-Type", arq[2] === "mp3" ? "audio/mpeg" : "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.end(fs.readFileSync(caminho));
    }
    if (!req.url?.startsWith("/api/tts") || req.method !== "POST") return next();
    let corpo = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (corpo += c));
    req.on("end", async () => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const { texto } = JSON.parse(corpo) as { texto?: string };
        if (!texto || texto.length > 600) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ erro: "texto vazio ou longo demais" }));
        }
        const h = hash(texto);
        if (!emAndamento.has(h)) emAndamento.set(h, gera(texto).finally(() => emAndamento.delete(h)));
        const out = (await emAndamento.get(h)) as { status: number; corpo: unknown };
        res.statusCode = out.status;
        res.end(JSON.stringify(out.corpo));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ erro: String(e) }));
      }
    });
  };

  return {
    name: "voz-sintetica",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
