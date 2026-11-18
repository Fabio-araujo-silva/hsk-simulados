#!/usr/bin/env node
// Voz sintética do site público: lista TODAS as falas que o app pode pedir à voz sintética, conta quantas já estão
// em public/tts/ e estima os créditos da ElevenLabs para gerar o resto.
//
// Por quê: no site público não existe /api/tts (a chave não sai do computador), então só toca o que já foi gerado
// e vai no deploy. Rodar isto antes de publicar mostra o que falta; com --gerar, gera (gasta créditos!).
//
// De onde vêm as falas — exatamente como o app monta:
//  - botão "🔊 ouvir" das questões de leitura e escrita (src/falaQuestao.ts → unidadesFala, a MESMA função do app),
//    antes e depois de corrigir (depois de corrigir, a lacuna aparece preenchida e a frase certa do "ordenar" entra);
//  - aba Vocabulário: a palavra em 汉字 de cada cartão (public/conteudo/vocabulario.json).
// O nome do arquivo é o mesmo hash do servidor (servidor/vozSintetica.ts) e do navegador (src/tts.ts).
//
// Uso:
//   node scripts/gera_tts.mjs --simular            só conta (padrão; não chama a ElevenLabs)
//   node scripts/gera_tts.mjs --simular --lista x  também grava a lista do que falta em x (JSON)
//   node scripts/gera_tts.mjs --gerar [--limite N] gera o que falta (precisa de ELEVENLABS_API_KEY no .env) — GASTA CRÉDITOS
//
// Precisa do Node 22.18+ (lê os .ts de src/ direto, sem compilar).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { unidadesFala } from "../src/falaQuestao.ts";
import { chaveCacheTts, textoParaFala, VOZ_TTS } from "../src/vozConfig.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = path.join(RAIZ, "public");
const DIR_TTS = path.join(PUBLICO, "tts");

const args = process.argv.slice(2);
const gerar = args.includes("--gerar");
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const limite = Number(valor("--limite") ?? Infinity);
const arquivoLista = valor("--lista");

const leJson = (p) => JSON.parse(fs.readFileSync(p, "utf-8"));
const hash = (texto) => crypto.createHash("sha1").update(chaveCacheTts(texto)).digest("hex").slice(0, 20);
const existe = (h) => fs.existsSync(path.join(DIR_TTS, `${h}.mp3`)) && fs.existsSync(path.join(DIR_TTS, `${h}.json`));

// ------------------------------------------------------------------ inventário

/** hash → { texto, onde: Set } */
const falas = new Map();
const adiciona = (texto, onde) => {
  const h = hash(texto);
  if (!falas.has(h)) falas.set(h, { texto, fala: textoParaFala(texto), onde: new Set() });
  falas.get(h).onde.add(onde);
};

const indice = leJson(path.join(PUBLICO, "conteudo", "provas", "index.json"));
const porGrupo = {}; // "HSK 3" / "Vocabulário" → Set de hashes
const marca = (grupo, texto) => {
  (porGrupo[grupo] ??= new Set()).add(hash(texto));
};

for (const resumo of indice) {
  const prova = leJson(path.join(PUBLICO, "conteudo", "provas", `${resumo.id}.json`));
  const grupo = `HSK ${prova.nivel ?? resumo.nivel ?? 3}`;
  for (const q of prova.questoes) {
    // como em Questao.tsx: só fora do listening e fora do modo prova (estudo, revisão, correção)
    if (q.secao === "L") continue;
    const g = q.grupo ? prova.grupos[q.grupo] : undefined;
    for (const revelado of [false, true]) {
      for (const u of unidadesFala(q, g, revelado)) {
        adiciona(u.texto, `${prova.id} nº ${q.n}`);
        marca(grupo, u.texto);
      }
    }
  }
}

const vocab = leJson(path.join(PUBLICO, "conteudo", "vocabulario.json"));
for (const p of vocab) {
  adiciona(p.hz, `vocabulário ${p.hz}`);
  marca("Vocabulário", p.hz);
}

// ------------------------------------------------------------------ relatório

const faltam = [...falas.entries()].filter(([h]) => !existe(h));
const chars = (lista) => lista.reduce((s, [, f]) => s + [...f.fala].length, 0);

console.log(`voz: ${VOZ_TTS.vozId} · ${VOZ_TTS.modelo} · velocidade ${VOZ_TTS.velocidade}`);
console.log(`provas: ${indice.length} · palavras do vocabulário: ${vocab.length}\n`);
console.log("grupo         falas   já em public/tts   faltam   caracteres a gerar");
for (const [grupo, hs] of Object.entries(porGrupo).sort()) {
  const lista = [...hs].map((h) => [h, falas.get(h)]);
  const f = lista.filter(([h]) => !existe(h));
  console.log(`${grupo.padEnd(13)} ${String(lista.length).padStart(5)}   ${String(lista.length - f.length).padStart(16)}   ${String(f.length).padStart(6)}   ${String(chars(f)).padStart(18)}`);
}
console.log(`${"TOTAL".padEnd(13)} ${String(falas.size).padStart(5)}   ${String(falas.size - faltam.length).padStart(16)}   ${String(faltam.length).padStart(6)}   ${String(chars(faltam)).padStart(18)}`);
console.log("(uma fala usada em mais de um grupo conta uma vez só no TOTAL)\n");

const total = chars(faltam);
// eleven_multilingual_v2: 1 crédito por caractere do texto enviado
console.log(`Estimativa: ~${total.toLocaleString("pt-BR")} créditos da ElevenLabs (1 por caractere no ${VOZ_TTS.modelo}).`);
// tamanho: pela média de bytes por caractere das falas que já existem (mp3 + json de tempos)
const prontas = [...falas.entries()].filter(([h]) => existe(h));
const bytesProntas = prontas.reduce((s, [h]) => s + fs.statSync(path.join(DIR_TTS, `${h}.mp3`)).size + fs.statSync(path.join(DIR_TTS, `${h}.json`)).size, 0);
const porChar = prontas.length ? bytesProntas / Math.max(1, chars(prontas)) : 4000;
const porFala = prontas.length ? bytesProntas / prontas.length : 20000;
// cada fala tem um mínimo (silêncio, cabeçalho): o maior dos dois jeitos de estimar
const mb = Math.max(total * porChar, faltam.length * porFala) / 1024 / 1024;
console.log(`Espaço estimado em public/tts para o que falta: ~${mb.toFixed(0)} MB (pela média das ${prontas.length} falas que já existem).`);

if (arquivoLista) {
  fs.writeFileSync(arquivoLista, JSON.stringify(faltam.map(([h, f]) => ({ hash: h, texto: f.texto, onde: [...f.onde] })), null, 1));
  console.log(`lista do que falta: ${arquivoLista}`);
}

if (!gerar) {
  console.log("\n(simulação: nada foi gerado. Para gerar de verdade: --gerar — gasta créditos.)");
  process.exit(0);
}

// ------------------------------------------------------------------ geração (gasta créditos)

function chave() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(RAIZ, ".env"), "utf-8").match(/^ELEVENLABS_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/** Mesma chamada do servidor local (servidor/vozSintetica.ts), com as mesmas tentativas para 429/5xx. */
async function geraUma(h, texto) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOZ_TTS.vozId}/with-timestamps?output_format=${VOZ_TTS.formato}`;
  let r = null;
  let d = {};
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
      d = await r.json().catch(() => ({}));
      if (r.ok && d.audio_base64) break;
      if (r.status !== 429 && r.status < 500) break;
    } catch {
      /* rede: tenta de novo */
    }
  }
  if (!r?.ok || !d.audio_base64) throw new Error(typeof d.detail === "string" ? d.detail : d.detail?.message ?? `HTTP ${r?.status}`);
  fs.mkdirSync(DIR_TTS, { recursive: true });
  fs.writeFileSync(path.join(DIR_TTS, `${h}.mp3`), Buffer.from(d.audio_base64, "base64"));
  const info = {
    texto: textoParaFala(texto),
    caracteres: d.alignment?.characters ?? [],
    inicio: d.alignment?.character_start_times_seconds ?? [],
    fim: d.alignment?.character_end_times_seconds ?? [],
  };
  fs.writeFileSync(path.join(DIR_TTS, `${h}.json`), JSON.stringify(info));
}

const k = chave();
if (!k) {
  console.error("sem ELEVENLABS_API_KEY (no ambiente ou no .env)");
  process.exit(1);
}
const fila = faltam.slice(0, limite);
console.log(`\ngerando ${fila.length} falas (${chars(fila)} caracteres)…`);
let feitas = 0;
let falhas = 0;
// 2 de cada vez: a mesma chave é usada por outros processos e o plano limita pedidos simultâneos
const trabalhador = async () => {
  while (fila.length) {
    const [h, f] = fila.shift();
    try {
      await geraUma(h, f.texto);
      feitas++;
    } catch (e) {
      falhas++;
      console.warn(`falhou "${f.fala.slice(0, 20)}": ${e.message}`);
    }
    if ((feitas + falhas) % 25 === 0) console.log(`  ${feitas + falhas} / ${feitas + falhas + fila.length}`);
  }
};
await Promise.all([trabalhador(), trabalhador()]);
console.log(`pronto: ${feitas} geradas, ${falhas} falharam.`);
