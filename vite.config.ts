import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gravacoes } from "./servidor/gravacoes";
import { vozSintetica } from "./servidor/vozSintetica";

interface ArquivoProgresso {
  /** nome do plugin */
  nome: string;
  /** caminho EXATO da API (só a querystring é ignorada) */
  rota: string;
  /** arquivo em progresso/ */
  arquivo: string;
  /** prefixo dos backups em progresso/backups/ */
  prefixo: string;
}

/**
 * Guarda o progresso num arquivo do projeto — um por parte do app, sem misturar:
 *   HSK 1–3:  /api/progresso       → progresso/progresso.json   (provas, respostas, cartões, marcações do vocabulário)
 *   HSKK:     /api/hskk/progresso  → progresso/hskk.json        (provas orais, gravações feitas, frases da revisão)
 * e, para cada um,
 *   progresso/backups/<prefixo>AAAA-MM-DD.json   — uma cópia por dia (últimos 60 dias)
 *   progresso/backups/<prefixo>antes-*.json      — cópia de segurança se um salvamento encolher muito os dados
 * Assim nada se perde se o navegador limpar o localStorage ou se a porta mudar.
 * Cada plugin só atende o seu caminho exato: nenhuma outra rota consegue ler ou gravar o arquivo dele.
 */
function progressoEmDisco({ nome, rota, arquivo, prefixo }: ArquivoProgresso): Plugin {
  const dir = path.resolve(__dirname, "progresso");
  const arq = path.join(dir, arquivo);
  const backups = path.join(dir, "backups");
  const prefixoRe = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const diario = new RegExp(`^${prefixoRe}\\d{4}-\\d{2}-\\d{2}\\.json$`);

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
      const nNovo = tamanho(txt);
      // proteção: se o novo estado encolher muito (ou ficar vazio, como ao formatar),
      // guarda o anterior à parte — o backup diário abaixo é sobrescrito com o estado novo
      if (nAntigo > 0 && nNovo < nAntigo && (nNovo === 0 || nNovo < nAntigo * 0.6)) {
        fs.writeFileSync(path.join(backups, `${prefixo}antes-${Date.now()}.json`), antigo);
      }
    }
    const tmp = arq + ".tmp";
    fs.writeFileSync(tmp, txt);
    fs.renameSync(tmp, arq);
    const hoje = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(backups, `${prefixo}${hoje}.json`), txt);
    const diarios = fs
      .readdirSync(backups)
      .filter((f) => diario.test(f))
      .sort();
    for (const f of diarios.slice(0, Math.max(0, diarios.length - 60))) fs.unlinkSync(path.join(backups, f));
  };

  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if ((req.url ?? "").split("?")[0] !== rota) return next();
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
      name: nome,
      configureServer(server) {
        server.middlewares.use(handler);
      },
      configurePreviewServer(server) {
        server.middlewares.use(handler);
      },
  };
}

/** Pastas de public/ que no build público podem ficar num bucket de mídia (VITE_MIDIA_URL; ver src/dados.ts → urlMidia). */
const PASTAS_MIDIA = ["audio", "img", "hskk/audio", "hskk/img"];

/** VITE_MIDIA_URL com um bucket de verdade (vazia ou "mesmo-site" = a mídia vai no próprio site, como no modo local). */
const temBucket = (midiaUrl: string | undefined) => {
  const v = midiaUrl?.trim() ?? "";
  return v !== "" && v !== "mesmo-site";
};

/**
 * Build com bucket de mídia (VITE_MIDIA_URL): o áudio original e as figuras (~550 MB) não vão para dist/ — são servidos
 * do bucket (scripts/publica_midia.mjs). O Vite copiaria public/ inteiro; aqui a cópia é feita à mão, pulando essas
 * pastas. Sem bucket o plugin não faz nada e o build é o de sempre (a mídia vai junto em dist/).
 */
function midiaForaDoBuild(midiaUrl: string | undefined): Plugin {
  const ativo = temBucket(midiaUrl);
  const publico = path.resolve(__dirname, "public");
  const fora = new Set(PASTAS_MIDIA.map((p) => path.join(publico, p)));
  let saida = path.resolve(__dirname, "dist");
  return {
    name: "midia-fora-do-build",
    apply: "build",
    config: () => (ativo ? { build: { copyPublicDir: false } } : undefined),
    configResolved(c) {
      saida = path.resolve(c.root, c.build.outDir);
    },
    writeBundle() {
      if (!ativo) return;
      fs.cpSync(publico, saida, { recursive: true, filter: (origem) => !fora.has(path.resolve(origem)) });
      console.log(`[midia-fora-do-build] public/ copiado sem ${PASTAS_MIDIA.join(", ")} (servidos de ${midiaUrl})`);
    },
  };
}

/**
 * A biblioteca do Supabase entra no app pelo módulo virtual "virtual:supabase" (src/nuvem.ts):
 *  - build/dev público (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY definidas): é a biblioteca de verdade;
 *  - modo local: um substituto vazio. Assim o modo local não depende do pacote estar instalado — uma cópia do
 *    projeto que puxou estas mudanças sem rodar `npm install` continua abrindo no `npm run dev` — e o build local
 *    não carrega os ~230 KB da biblioteca em dist/assets.
 * Build público sem bucket de mídia (VITE_MIDIA_URL vazia ou "mesmo-site"): só avisa que a mídia vai junto no site.
 */
function nuvemDoBuild(env: Record<string, string>): Plugin {
  const publico = !!(env.VITE_SUPABASE_URL?.trim() && env.VITE_SUPABASE_ANON_KEY?.trim());
  const ID = "virtual:supabase";
  return {
    name: "nuvem-do-build",
    enforce: "pre",
    config(_c, { command }) {
      if (publico && command === "build" && !temBucket(env.VITE_MIDIA_URL))
        console.warn(
          "[nuvem-do-build] build público sem bucket de mídia (VITE_MIDIA_URL): o áudio e as figuras (~550 MB) vão junto no site, servidos pela própria Vercel.",
        );
    },
    resolveId: (id) => (id === ID ? "\0" + ID : undefined),
    load(id) {
      if (id !== "\0" + ID) return;
      return publico
        ? 'export * from "@supabase/supabase-js";'
        : 'export function createClient() { throw new Error("a nuvem só existe no site público"); }';
    },
  };
}

// base relativa: o build funciona aberto de qualquer pasta/servidor estático
export default defineConfig(({ mode }) => {
  // loadEnv junta .env* e as variáveis do ambiente (é assim que a Vercel passa as VITE_*)
  const env = loadEnv(mode, __dirname, "VITE_");
  return {
    plugins: [
      nuvemDoBuild(env),
      midiaForaDoBuild(env.VITE_MIDIA_URL),
      react(),
      progressoEmDisco({ nome: "progresso-em-disco", rota: "/api/progresso", arquivo: "progresso.json", prefixo: "" }),
      progressoEmDisco({ nome: "progresso-hskk-em-disco", rota: "/api/hskk/progresso", arquivo: "hskk.json", prefixo: "hskk-" }),
      vozSintetica(__dirname),
      gravacoes(__dirname),
    ],
    base: "./",
    server: { port: 5180, watch: { ignored: ["**/progresso/**", "**/fontes/**", "**/data/**", "**/public/tts/**"] } },
    preview: { port: 5180 },
  };
});
