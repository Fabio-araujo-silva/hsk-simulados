import { useSyncExternalStore } from "react";
import type { Cartao, Config, Gravacao, Tentativa } from "./tipos";

// Estado do usuário. Fica em DOIS lugares, sempre sincronizados:
//  1. localStorage do navegador (instantâneo);
//  2. progresso/progresso.json na pasta do projeto, via /api/progresso do servidor local
//     (com backup diário em progresso/backups/). Se o navegador limpar os dados, nada se perde.
// Resetar uma prova nunca apaga nada: a tentativa antiga é arquivada e continua no histórico.

interface Estado {
  versao: 1;
  tentativas: Record<string, Tentativa>;
  cartoes: Record<string, Cartao>;
  config: Config;
  /** contagem de cartões novos estudados por dia (AAAA-MM-DD → n) */
  novosHoje: Record<string, number>;
  /** itens apagados de propósito (id → quando), para a sincronização não ressuscitá-los */
  apagados: Record<string, number>;
  /** última alteração (ms) */
  salvoEm: number;
}

const CHAVE = "hskk-intermediario:v1";

export const CONFIG_PADRAO: Config = {
  traducao: true,
  pinyin: false,
  velocidade: 1,
  textoAntes: false,
  autoTranscrever: true,
  pausarProva: false,
  novosPorDia: 20,
  limiarRevisao: 80,
};

function vazio(): Estado {
  return { versao: 1, tentativas: {}, cartoes: {}, config: { ...CONFIG_PADRAO }, novosHoje: {}, apagados: {}, salvoEm: 0 };
}

function normaliza(e: Partial<Estado> | null | undefined): Estado {
  const v = vazio();
  if (!e) return v;
  return {
    ...v,
    ...e,
    tentativas: e.tentativas ?? {},
    cartoes: e.cartoes ?? {},
    novosHoje: e.novosHoje ?? {},
    apagados: e.apagados ?? {},
    config: { ...CONFIG_PADRAO, ...(e.config ?? {}) },
    salvoEm: e.salvoEm ?? 0,
  };
}

function carregaLocal(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? normaliza(JSON.parse(bruto)) : vazio();
  } catch {
    return vazio();
  }
}

const quando = (x: { atualizado?: number; inicio?: number; criado?: number; srs?: { last_review?: number } }) =>
  x.atualizado ?? x.srs?.last_review ?? x.inicio ?? x.criado ?? 0;

/** Junta dois estados item a item: vence a versão alterada por último; apagados continuam apagados. */
export function mescla(a: Estado, b: Estado): Estado {
  const apagados = { ...a.apagados, ...b.apagados };
  const junta = <T extends { atualizado?: number }>(x: Record<string, T>, y: Record<string, T>) => {
    const out: Record<string, T> = { ...x };
    for (const [id, item] of Object.entries(y)) {
      if (!out[id] || quando(item) > quando(out[id])) out[id] = item;
    }
    for (const id of Object.keys(out)) if (apagados[id] && apagados[id] >= quando(out[id])) delete out[id];
    return out;
  };
  const novosHoje = { ...a.novosHoje };
  for (const [k, n] of Object.entries(b.novosHoje)) novosHoje[k] = Math.max(novosHoje[k] ?? 0, n);
  const maisNovo = a.salvoEm >= b.salvoEm ? a : b;
  return {
    versao: 1,
    tentativas: junta(a.tentativas, b.tentativas),
    cartoes: junta(a.cartoes, b.cartoes),
    config: maisNovo.config,
    novosHoje,
    apagados,
    salvoEm: Math.max(a.salvoEm, b.salvoEm),
  };
}

// começa vazio: o estado de verdade vem do arquivo em disco (ou, sem servidor, do navegador)
let estado: Estado = vazio();
let carregado = false;
let sujo = false;
const ouvintes = new Set<() => void>();
let gravacaoLocal: number | undefined;
let gravacaoDisco: number | undefined;

// ------------------------------------------------------- sincronização em disco

export type StatusDisco = "verificando" | "ok" | "salvando" | "sem-servidor" | "erro";
let statusDisco: StatusDisco = "verificando";
const ouvintesStatus = new Set<() => void>();
const mudaStatus = (s: StatusDisco) => {
  statusDisco = s;
  ouvintesStatus.forEach((o) => o());
};
export function useStatusDisco() {
  return useSyncExternalStore(
    (o) => {
      ouvintesStatus.add(o);
      return () => ouvintesStatus.delete(o);
    },
    () => statusDisco,
  );
}

const API = `${import.meta.env.BASE_URL}api/progresso`;

async function enviaDisco() {
  if (statusDisco === "sem-servidor" || !carregado || !sujo) return;
  sujo = false;
  mudaStatus("salvando");
  try {
    const r = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(estado) });
    mudaStatus(r.ok ? "ok" : "erro");
  } catch {
    mudaStatus("erro");
  }
}

async function iniciaDisco() {
  try {
    const r = await fetch(API, { cache: "no-store" });
    const tipo = r.headers.get("content-type") ?? "";
    if (r.status !== 204 && (!r.ok || !tipo.includes("json"))) throw new Error("sem servidor local");
    // o ARQUIVO LOCAL manda: nada do navegador é misturado nem restaurado
    estado = r.status === 204 ? vazio() : normaliza(await r.json());
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      /* ignora */
    }
    carregado = true;
    mudaStatus("ok");
  } catch {
    // site estático sem o servidor local: aí sim usa o navegador (+ backup manual)
    estado = carregaLocal();
    carregado = true;
    mudaStatus("sem-servidor");
  }
  ouvintes.forEach((o) => o());
}
void iniciaDisco();

function gravaLocal() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (err) {
    console.error("não foi possível salvar no navegador", err);
  }
}

function grava() {
  sujo = true;
  if (statusDisco === "sem-servidor") {
    window.clearTimeout(gravacaoLocal);
    gravacaoLocal = window.setTimeout(gravaLocal, 150);
    return;
  }
  window.clearTimeout(gravacaoDisco);
  gravacaoDisco = window.setTimeout(() => void enviaDisco(), 800);
}

window.addEventListener("beforeunload", () => {
  if (!carregado || !sujo) return;
  if (statusDisco === "sem-servidor") gravaLocal();
  else {
    try {
      navigator.sendBeacon(API, new Blob([JSON.stringify(estado)], { type: "application/json" }));
    } catch {
      /* ignora */
    }
  }
});

function muda(f: (e: Estado) => Estado) {
  estado = { ...f(estado), salvoEm: Date.now() };
  grava();
  ouvintes.forEach((o) => o());
}

function assina(o: () => void) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export function useEstado<T>(sel: (e: Estado) => T): T {
  return useSyncExternalStore(assina, () => sel(estado));
}

export const leEstado = () => estado;

// ------------------------------------------------------------------ config

export function useConfig() {
  return useEstado((e) => e.config);
}

export function mudaConfig(parcial: Partial<Config>) {
  muda((e) => ({ ...e, config: { ...e.config, ...parcial } }));
}

// --------------------------------------------------------------- tentativas

export function novaTentativa(prova: string, modo: Tentativa["modo"]): Tentativa {
  const agora = Date.now();
  const t: Tentativa = {
    id: `${prova}-${modo}-${agora.toString(36)}`,
    prova,
    modo,
    inicio: agora,
    atualizado: agora,
    gravacoes: {},
  };
  muda((e) => ({ ...e, tentativas: { ...e.tentativas, [t.id]: t } }));
  return t;
}

export function mudaTentativa(id: string, f: (t: Tentativa) => Tentativa) {
  muda((e) => {
    const t = e.tentativas[id];
    if (!t) return e;
    return { ...e, tentativas: { ...e.tentativas, [id]: { ...f(t), atualizado: Date.now() } } };
  });
}

/** Arquiva (não apaga): a tentativa sai de cena mas continua no histórico. */
export function arquivaTentativa(id: string) {
  mudaTentativa(id, (t) => ({ ...t, fim: t.fim ?? Date.now(), arquivada: true, ...(t.modo === "prova" && !t.fim ? { abandonada: true } : {}) }));
}

/**
 * Resetar uma prova: arquiva o estudo em andamento e a prova em andamento (se houver).
 * Provas terminadas (com as gravações), histórico e cartões de revisão continuam intactos.
 */
export function resetaSimulado(prova: string, modos: Tentativa["modo"][] = ["estudo", "prova"]) {
  const alvos = Object.values(estado.tentativas).filter((t) => t.prova === prova && modos.includes(t.modo) && !t.arquivada && (t.modo === "estudo" || !t.fim));
  for (const t of alvos) arquivaTentativa(t.id);
  return alvos.length;
}

/** Guarda uma gravação nova da questão `n` (no modo prova substitui; no estudo acumula as últimas 10). */
export function adicionaGravacao(id: string, n: number, g: Gravacao, substituir = false) {
  mudaTentativa(id, (t) => {
    const antes = substituir ? [] : t.gravacoes[n] ?? [];
    return { ...t, gravacoes: { ...t.gravacoes, [n]: [...antes, g].slice(-10) } };
  });
}

/** Completa uma gravação já guardada (ex.: transcrição e % que chegaram depois). */
export function atualizaGravacao(id: string, n: number, arquivo: string, parcial: Partial<Gravacao>) {
  mudaTentativa(id, (t) => ({
    ...t,
    gravacoes: { ...t.gravacoes, [n]: (t.gravacoes[n] ?? []).map((g) => (g.arquivo === arquivo ? { ...g, ...parcial } : g)) },
  }));
}

/** Tentativa de estudo ativa da prova (cria se não existir). */
export function tentativaEstudo(prova: string): Tentativa {
  const t = Object.values(estado.tentativas).find((x) => x.prova === prova && x.modo === "estudo" && !x.arquivada);
  return t ?? novaTentativa(prova, "estudo");
}

// ------------------------------------------------------------------ cartões

export function salvaCartoes(novos: Cartao[]) {
  const agora = Date.now();
  muda((e) => {
    const cartoes = { ...e.cartoes };
    const apagados = { ...e.apagados };
    for (const c of novos) {
      cartoes[c.id] = { ...c, atualizado: agora };
      delete apagados[c.id];
    }
    return { ...e, cartoes, apagados };
  });
}

export function apagaCartao(id: string) {
  muda((e) => {
    const { [id]: _, ...resto } = e.cartoes;
    return { ...e, cartoes: resto, apagados: { ...e.apagados, [id]: Date.now() } };
  });
}

export function hojeChave(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function contaNovoHoje() {
  const k = hojeChave();
  muda((e) => ({ ...e, novosHoje: { ...e.novosHoje, [k]: (e.novosHoje[k] ?? 0) + 1 } }));
}

// --------------------------------------------------------------- formatar

/**
 * Apaga TODO o progresso (tentativas, notas, cartões, revisões). Mantém só as configurações.
 * O servidor guarda uma cópia do estado anterior em progresso/backups/antes-*.json.
 */
export function formataTudo() {
  muda((e) => ({ ...vazio(), config: e.config }));
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
  window.clearTimeout(gravacaoDisco);
  void enviaDisco();
}

// ------------------------------------------------------------------- backup

export function exportaBackup(): string {
  return JSON.stringify(estado, null, 1);
}

export function importaBackup(json: string) {
  const novo = normaliza(JSON.parse(json));
  if (novo.versao !== 1) throw new Error("arquivo de backup inválido");
  // restaurar sempre MESCLA (nunca joga fora o que já existe)
  muda((e) => mescla(e, novo));
}
