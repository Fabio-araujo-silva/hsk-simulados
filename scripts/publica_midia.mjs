#!/usr/bin/env node
// Envia a mídia pesada do app (public/audio, public/img, public/hskk/audio, public/hskk/img — ~550 MB) para um bucket
// público do Cloudflare R2, de onde o site público a busca (VITE_MIDIA_URL; ver src/dados.ts → urlMidia e docs/deploy.md).
// Por quê: o deploy da Vercel não comporta esse volume, e o R2 não cobra tráfego de saída.
//
// Só envia o que mudou: compara tamanho e ETag (o MD5 do arquivo, para envios de uma parte só) com o que já está no
// bucket. Não apaga nada do bucket; arquivos que só existem lá são listados no fim.
//
// Variáveis (no ambiente ou no .env da raiz, que não é versionado):
//   R2_ACCOUNT_ID         id da conta Cloudflare (aparece no painel do R2)
//   R2_ACCESS_KEY_ID      chave de API do R2 com permissão de escrita no bucket
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET             nome do bucket
//   R2_ENDPOINT           (opcional) outro endereço S3, só para testes
//
// Uso:
//   node scripts/publica_midia.mjs --simular   mostra o que seria enviado (sem credenciais: considera tudo novo)
//   node scripts/publica_midia.mjs             envia

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = path.join(RAIZ, "public");
/** as mesmas pastas de vite.config.ts (PASTAS_MIDIA) e de src/dados.ts */
const PASTAS = ["audio", "img", "hskk/audio", "hskk/img"];
const simular = process.argv.includes("--simular");

const TIPOS = { ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
// os nomes não têm hash (img/H31001/L1a-A.png): um dia de cache, para uma figura recortada de novo aparecer logo
const CACHE = "public, max-age=86400";

function variaveis() {
  const env = { ...process.env };
  try {
    for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf-8").split(/\r?\n/)) {
      const m = linha.match(/^\s*(R2_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sem .env */
  }
  return env;
}

function listaLocal() {
  const out = [];
  const anda = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) anda(p);
      else if (e.isFile() && !e.name.startsWith(".")) out.push(p);
    }
  };
  for (const pasta of PASTAS) {
    const dir = path.join(PUBLICO, pasta);
    if (fs.existsSync(dir)) anda(dir);
  }
  return out.map((p) => ({ caminho: p, chave: path.relative(PUBLICO, p).split(path.sep).join("/"), tamanho: fs.statSync(p).size }));
}

const md5 = (p) =>
  new Promise((ok, erro) => {
    const h = crypto.createHash("md5");
    fs.createReadStream(p)
      .on("data", (c) => h.update(c))
      .on("end", () => ok(h.digest("hex")))
      .on("error", erro);
  });

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

const env = variaveis();
const faltando = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !env[k]);
const locais = listaLocal();
console.log(`local: ${locais.length} arquivos, ${mb(locais.reduce((s, f) => s + f.tamanho, 0))} em ${PASTAS.map((p) => `public/${p}`).join(", ")}`);

if (faltando.length) {
  if (!simular) {
    console.error(`faltam as variáveis ${faltando.join(", ")} (no ambiente ou no .env) — veja docs/deploy.md`);
    process.exit(1);
  }
  console.log(`(simulação sem credenciais — faltam ${faltando.join(", ")}): sem comparar com o bucket, tudo seria enviado.`);
  for (const pasta of PASTAS) {
    const daPasta = locais.filter((f) => f.chave.startsWith(`${pasta}/`));
    console.log(`  ${pasta.padEnd(11)} ${String(daPasta.length).padStart(5)} arquivos  ${mb(daPasta.reduce((s, f) => s + f.tamanho, 0)).padStart(9)}`);
  }
  process.exit(0);
}

// carregado só aqui: a simulação sem credenciais nem precisa do SDK
const { S3Client, ListObjectsV2Command, PutObjectCommand } = await import("@aws-sdk/client-s3");
const s3 = new S3Client({
  region: "auto",
  // R2_ENDPOINT (opcional) troca o endereço — só para testar com um S3 local
  endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  // o SDK novo manda checksums "aws-chunked" por padrão; o R2 recomenda só quando exigido (envio simples, ETag = MD5)
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

/** chave → { tamanho, etag } do que já está no bucket */
const remotos = new Map();
for (const pasta of PASTAS) {
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `${pasta}/`, ContinuationToken: token }));
    for (const o of r.Contents ?? []) remotos.set(o.Key, { tamanho: o.Size, etag: (o.ETag ?? "").replace(/"/g, "") });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
}
console.log(`bucket ${env.R2_BUCKET}: ${remotos.size} arquivos nessas pastas`);

const enviar = [];
for (const f of locais) {
  const r = remotos.get(f.chave);
  if (r && r.tamanho === f.tamanho && r.etag === (await md5(f.caminho))) continue;
  enviar.push({ ...f, motivo: r ? "mudou" : "novo" });
}
const chavesLocais = new Set(locais.map((f) => f.chave));
const soNoBucket = [...remotos.keys()].filter((k) => !chavesLocais.has(k));

console.log(`a enviar: ${enviar.length} arquivos (${mb(enviar.reduce((s, f) => s + f.tamanho, 0))}) — ${enviar.filter((f) => f.motivo === "novo").length} novos, ${enviar.filter((f) => f.motivo === "mudou").length} alterados`);
if (soNoBucket.length) console.log(`só no bucket (não apago): ${soNoBucket.length} — ex.: ${soNoBucket.slice(0, 3).join(", ")}`);

if (simular) {
  for (const f of enviar.slice(0, 20)) console.log(`  ${f.motivo.padEnd(5)} ${f.chave} (${mb(f.tamanho)})`);
  if (enviar.length > 20) console.log(`  … e mais ${enviar.length - 20}`);
  console.log("\n(simulação: nada foi enviado)");
  process.exit(0);
}

let feitos = 0;
let bytes = 0;
const fila = [...enviar];
const trabalhador = async () => {
  while (fila.length) {
    const f = fila.shift();
    await s3.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: f.chave,
        Body: fs.createReadStream(f.caminho),
        ContentLength: f.tamanho,
        ContentType: TIPOS[path.extname(f.chave).toLowerCase()] ?? "application/octet-stream",
        CacheControl: CACHE,
      }),
    );
    feitos++;
    bytes += f.tamanho;
    if (feitos % 50 === 0 || feitos === enviar.length) console.log(`  ${feitos}/${enviar.length} · ${mb(bytes)}`);
  }
};
await Promise.all([1, 2, 3, 4].map(trabalhador));
console.log("pronto.");
