import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Gravações da sua voz, guardadas no disco (nunca no git):
 *   PUT  /api/gravacoes/<nome>   corpo = o áudio (webm/ogg/mp4 do MediaRecorder) → progresso/gravacoes/<nome>
 *   GET  /api/gravacoes/<nome>   devolve o arquivo (com suporte a Range, para o <audio> poder pular)
 *   POST /api/transcreve {arquivo} → manda a gravação ao ElevenLabs Scribe e devolve {texto, palavras}
 *                                   (resultado em cache: progresso/gravacoes/<nome>.scribe.json — não paga duas vezes)
 * A chave (ELEVENLABS_API_KEY) fica no .env e nunca vai para o navegador.
 */
export function gravacoes(raiz: string): Plugin {
  const dir = path.join(raiz, "progresso", "gravacoes");
  const NOME = /^[A-Za-z0-9_.-]{1,120}$/;
  const TIPOS: Record<string, string> = { ".webm": "audio/webm", ".ogg": "audio/ogg", ".mp4": "audio/mp4", ".m4a": "audio/mp4", ".wav": "audio/wav" };
  const MAX = 25 * 1024 * 1024;

  const chave = () => {
    try {
      const env = fs.readFileSync(path.join(raiz, ".env"), "utf-8");
      const m = env.match(/^ELEVENLABS_API_KEY=(.+)$/m);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    }
  };

  const json = (res: ServerResponse, status: number, corpo: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(corpo));
  };

  const arquivoDe = (nome: string) => {
    if (!NOME.test(nome) || nome.includes("..")) return null;
    return path.join(dir, nome);
  };

  const emAndamento = new Map<string, Promise<{ status: number; corpo: unknown }>>();

  async function transcreve(nome: string): Promise<{ status: number; corpo: unknown }> {
    const arq = arquivoDe(nome);
    if (!arq || !fs.existsSync(arq)) return { status: 404, corpo: { erro: "gravação não encontrada" } };
    const cache = arq + ".scribe.json";
    if (fs.existsSync(cache)) return { status: 200, corpo: JSON.parse(fs.readFileSync(cache, "utf-8")) };
    const k = chave();
    if (!k) return { status: 503, corpo: { erro: "sem ELEVENLABS_API_KEY no .env" } };
    const tipo = TIPOS[path.extname(arq)] ?? "audio/webm";
    const fd = new FormData();
    fd.append("model_id", "scribe_v1");
    fd.append("language_code", "zho");
    fd.append("tag_audio_events", "false");
    fd.append("timestamps_granularity", "word");
    fd.append("file", new Blob([fs.readFileSync(arq)], { type: tipo }), path.basename(arq));
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": k }, body: fd });
    const d = (await r.json().catch(() => ({}))) as {
      text?: string;
      words?: { text: string; start: number; end: number; type: string }[];
      detail?: { message?: string } | string;
    };
    if (!r.ok) {
      const msg = typeof d.detail === "string" ? d.detail : d.detail?.message ?? `HTTP ${r.status}`;
      return { status: r.status === 401 || r.status === 403 ? 403 : 502, corpo: { erro: msg } };
    }
    const corpo = {
      texto: (d.text ?? "").trim(),
      palavras: (d.words ?? []).filter((w) => w.type === "word").map((w) => ({ t: w.text, s: w.start, e: w.end })),
    };
    fs.writeFileSync(cache, JSON.stringify(corpo));
    return { status: 200, corpo };
  }

  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (url.startsWith("/api/transcreve")) {
      if (req.method !== "POST") return json(res, 405, { erro: "use POST" });
      let corpo = "";
      req.setEncoding("utf8");
      req.on("data", (c) => (corpo += c));
      req.on("end", async () => {
        try {
          const { arquivo } = JSON.parse(corpo || "{}") as { arquivo?: string };
          if (!arquivo || !arquivoDe(arquivo)) return json(res, 400, { erro: "arquivo inválido" });
          if (!emAndamento.has(arquivo)) emAndamento.set(arquivo, transcreve(arquivo).finally(() => emAndamento.delete(arquivo)));
          const out = await emAndamento.get(arquivo)!;
          json(res, out.status, out.corpo);
        } catch (e) {
          json(res, 500, { erro: String(e) });
        }
      });
      return;
    }
    if (!url.startsWith("/api/gravacoes/")) return next();
    const nome = decodeURIComponent(url.slice("/api/gravacoes/".length).split("?")[0]);
    const arq = arquivoDe(nome);
    if (!arq || !TIPOS[path.extname(arq)]) return json(res, 400, { erro: "nome inválido" });

    if (req.method === "PUT" || req.method === "POST") {
      const partes: Buffer[] = [];
      let total = 0;
      req.on("data", (c: Buffer) => {
        total += c.length;
        if (total <= MAX) partes.push(c);
      });
      req.on("end", () => {
        if (total > MAX) return json(res, 413, { erro: "gravação grande demais" });
        if (!total) return json(res, 400, { erro: "gravação vazia" });
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(arq, Buffer.concat(partes));
        // regravou: a transcrição antiga não vale mais
        if (fs.existsSync(arq + ".scribe.json")) fs.unlinkSync(arq + ".scribe.json");
        json(res, 200, { ok: true, arquivo: nome, bytes: total });
      });
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (!fs.existsSync(arq)) return json(res, 404, { erro: "não existe" });
      const tam = fs.statSync(arq).size;
      res.setHeader("Content-Type", TIPOS[path.extname(arq)]);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "no-store");
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (range) {
        const ini = range[1] ? Number(range[1]) : 0;
        const fim = range[2] ? Math.min(Number(range[2]), tam - 1) : tam - 1;
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${ini}-${fim}/${tam}`);
        res.setHeader("Content-Length", String(fim - ini + 1));
        if (req.method === "HEAD") return res.end();
        return fs.createReadStream(arq, { start: ini, end: fim }).pipe(res);
      }
      res.setHeader("Content-Length", String(tam));
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(arq).pipe(res);
    }
    json(res, 405, { erro: "método não suportado" });
  };

  return {
    name: "gravacoes",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
