import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { vozSintetica } from "./servidor/vozSintetica";

/**
 * Guarda o progresso (provas, respostas, cartões, marcações do vocabulário) num arquivo do projeto:
 *   progresso/progresso.json            — estado atual
 *   progresso/backups/AAAA-MM-DD.json   — uma cópia por dia (últimos 60 dias)
 *   progresso/backups/antes-*.json      — cópia de segurança se um salvamento encolher muito os dados
 * Assim nada se perde se o navegador limpar o localStorage ou se a porta mudar.
 */
function progressoEmDisco(): Plugin {
  const dir = path.resolve(__dirname, "progresso");
  const arq = path.join(dir, "progresso.json");
  const backups = path.join(dir, "backups");

  const tamanho = (txt: string) => {
    try {
      const e = JSON.parse(txt);
      return Object.keys(e.tentativas ?? {}).length + Object.keys(e.cartoes ?? {}).length + Object.keys(e.vocab?.marcas ?? {}).length;
    } catch {
      return 0;
    }
  };

  const grava = (txt: string) => {
    JSON.parse(txt); // só aceita JSON válido
    fs.mkdirSync(backups, { recursive: true });
    if (fs.existsSync(arq)) {
      const antigo = fs.readFileSync(arq, "utf-8");
      const nAntigo = tamanho(antigo);
      // proteção: se o novo estado tiver bem menos itens, guarda o anterior à parte
      if (nAntigo > 5 && tamanho(txt) < nAntigo * 0.6) {
        fs.writeFileSync(path.join(backups, `antes-${Date.now()}.json`), antigo);
      }
    }
    const tmp = arq + ".tmp";
    fs.writeFileSync(tmp, txt);
    fs.renameSync(tmp, arq);
    const hoje = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(backups, `${hoje}.json`), txt);
    const diarios = fs
      .readdirSync(backups)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const f of diarios.slice(0, Math.max(0, diarios.length - 60))) fs.unlinkSync(path.join(backups, f));
  };

  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/progresso")) return next();
    if (req.method === "GET") {
      if (!fs.existsSync(arq)) {
        res.statusCode = 204;
        return res.end();
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.end(fs.readFileSync(arq, "utf-8"));
    }
    if (req.method === "PUT" || req.method === "POST") {
      let corpo = "";
      req.setEncoding("utf8");
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        try {
          grava(corpo);
          res.statusCode = 200;
          res.end('{"ok":true}');
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, erro: String(e) }));
        }
      });
      return;
    }
    res.statusCode = 405;
    res.end();
  };

  return {
    name: "progresso-em-disco",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// base relativa: o build funciona aberto de qualquer pasta/servidor estático
export default defineConfig({
  plugins: [react(), progressoEmDisco(), vozSintetica(__dirname)],
  base: "./",
  server: { port: 5180, watch: { ignored: ["**/progresso/**", "**/fontes/**", "**/data/**", "**/public/tts/**"] } },
  preview: { port: 5180 },
});
