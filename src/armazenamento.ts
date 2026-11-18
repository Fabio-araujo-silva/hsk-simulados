import { useSyncExternalStore } from "react";
import type { Cartao, Config, EstadoVocab, MarcaVocab, Tentativa } from "./tipos";
import { leBackup } from "./backup";
import { criaSincronia } from "./sincronia";

// Estado do usuário. Fica na memória e num destino que manda (src/sincronia.ts):
//  - modo local: progresso/progresso.json na pasta do projeto, via /api/progresso do servidor local
//    (com backup diário em progresso/backups/). Se o navegador limpar os dados, nada se perde;
//  - site público: a nuvem (Supabase) para quem entrou na conta, ou só o localStorage sem login;
//  - site estático sem servidor: o localStorage.
// Resetar um simulado nunca apaga nada: a tentativa antiga é arquivada e continua no histórico.

interface Estado {
  versao: 1;
  tentativas: Record<string, Tentativa>;
  cartoes: Record<string, Cartao>;
  config: Config;
  /** contagem de cartões novos estudados por dia (AAAA-MM-DD → n) */
  novosHoje: Record<string, number>;
  /** itens apagados de propósito (id → quando), para a sincronização não ressuscitá-los */
  apagados: Record<string, number>;
  /** aba Vocabulário: acertei/errei de cada palavra e a opção de pinyin sempre visível */
  vocab: EstadoVocab;
  /** última alteração (ms) */
  salvoEm: number;
}

const CHAVE = "hsk3-simulados:v1";

export const CONFIG_PADRAO: Config = {
  traducao: false,
  pinyin: false,
  velocidade: 1,
  transcricaoAntes: false,
  pausarProva: false,
  novosPorDia: 30,
  tocarSozinho: true,
  porBlocos: true,
};

const vocabVazio = (): EstadoVocab => ({ marcas: {}, pinyinSempre: false, atualizado: 0 });

function vazio(): Estado {
  return { versao: 1, tentativas: {}, cartoes: {}, config: { ...CONFIG_PADRAO }, novosHoje: {}, apagados: {}, vocab: vocabVazio(), salvoEm: 0 };
}

/** Progresso antigo (sem o campo) ou campo estragado: vocabulário vazio; marcações inválidas são ignoradas. */
function normalizaVocab(v: Partial<EstadoVocab> | null | undefined): EstadoVocab {
  if (!v || typeof v !== "object") return vocabVazio();
  const marcas: Record<string, MarcaVocab> = {};
  for (const [chave, m] of Object.entries(v.marcas ?? {})) if (m === "k" || m === "x") marcas[chave] = m;
  return { ...v, marcas, pinyinSempre: v.pinyinSempre === true, atualizado: typeof v.atualizado === "number" ? v.atualizado : 0 };
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
    vocab: normalizaVocab(e.vocab),
    salvoEm: e.salvoEm ?? 0,
  };
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
    // as marcações não têm data uma a uma: fica o vocabulário inteiro que foi alterado por último
    vocab: b.vocab.atualizado > a.vocab.atualizado ? b.vocab : a.vocab,
    salvoEm: Math.max(a.salvoEm, b.salvoEm),
  };
}

// começa vazio: o estado de verdade vem do arquivo em disco, da nuvem (site público) ou, sem nenhum dos dois, do navegador
let estado: Estado = vazio();
const ouvintes = new Set<() => void>();

// ------------------------------------------------------- sincronização (disco, nuvem ou navegador)

const sincronia = criaSincronia<Estado>({
  parte: "hsk",
  chave: CHAVE,
  api: `${import.meta.env.BASE_URL}api/progresso`,
  vazio,
  normaliza,
  mescla,
  le: () => estado,
  troca: (e) => {
    estado = e;
    ouvintes.forEach((o) => o());
  },
});
export type { StatusDisco } from "./sincronia";
export const useStatusDisco = sincronia.useStatus;
sincronia.inicia();

function muda(f: (e: Estado) => Estado) {
  estado = { ...f(estado), salvoEm: Date.now() };
  sincronia.grava();
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
    respostas: {},
    consultas: {},
  };
  if (modo === "prova") {
    t.etapa = "L";
    t.etapaInicio = agora;
    t.audioPos = 0;
  }
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
  mudaTentativa(id, (t) => ({ ...t, fim: t.fim ?? Date.now(), arquivada: true, ...(t.modo === "prova" && t.etapa !== "fim" ? { abandonada: true } : {}) }));
}

/**
 * Resetar um simulado: arquiva o estudo em andamento e a prova em andamento (se houver).
 * Notas de provas terminadas, histórico e cartões de revisão continuam intactos.
 */
export function resetaSimulado(prova: string, modos: Tentativa["modo"][] = ["estudo", "prova"]) {
  const alvos = Object.values(estado.tentativas).filter((t) => t.prova === prova && modos.includes(t.modo) && !t.arquivada && (t.modo === "estudo" || !t.fim));
  for (const t of alvos) arquivaTentativa(t.id);
  return alvos.length;
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

// ------------------------------------------------------------- vocabulário

function mudaVocab(f: (v: EstadoVocab) => Partial<EstadoVocab>) {
  muda((e) => ({ ...e, vocab: { ...e.vocab, ...f(e.vocab), atualizado: Date.now() } }));
}

/** Marca a palavra ("汉字|pinyin") como certa (k) ou errada (x); marcar de novo com o mesmo valor desmarca. */
export function marcaVocab(chave: string, m: MarcaVocab) {
  mudaVocab((v) => {
    const { [chave]: atual, ...resto } = v.marcas;
    return { marcas: atual === m ? resto : { ...resto, [chave]: m } };
  });
}

export function mudaPinyinSempre(ligado: boolean) {
  mudaVocab(() => ({ pinyinSempre: ligado }));
}

/** Apaga todas as marcações do vocabulário (a opção de pinyin continua como está). */
export function zeraVocab() {
  mudaVocab(() => ({ marcas: {} }));
}

// --------------------------------------------------------------- formatar

/**
 * Apaga TODO o progresso (tentativas, notas, cartões, revisões, marcações do vocabulário).
 * Mantém só as configurações (e a opção de pinyin do vocabulário).
 * O servidor guarda uma cópia do estado anterior em progresso/backups/antes-*.json.
 */
export function formataTudo() {
  // vocabulário com data 0, como o resto: restaurar um backup depois traz as marcações de volta
  muda((e) => ({ ...vazio(), config: e.config, vocab: { ...vocabVazio(), pinyinSempre: e.vocab.pinyinSempre } }));
  sincronia.formatou();
}

// ------------------------------------------------------------------- backup

export function exportaBackup(): string {
  return JSON.stringify({ parte: "hsk", ...estado }, null, 1);
}

export function importaBackup(json: string) {
  const novo = normaliza(leBackup(json, "hsk") as Partial<Estado>);
  if (novo.versao !== 1) throw new Error("arquivo de backup inválido");
  // restaurar sempre MESCLA (nunca joga fora o que já existe)
  muda((e) => mescla(e, novo));
}
