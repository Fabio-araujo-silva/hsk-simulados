import type { Parte } from "./backup";

// Formato compacto do progresso, só para a nuvem (site público). No disco (modo local), no navegador e nos backups o
// progresso continua no formato de sempre; a compactação acontece em src/nuvem.ts, na hora de gravar e de ler.
//
// O que muda em relação ao formato normal (o estado volta idêntico, fora os arredondamentos de canonico()):
//  - datas viram distâncias: até `salvoEm`, até o início da tentativa, até a última revisão do cartão;
//  - respostas de uma tentativa viram uma lista plana [Δn, valor, marcas, Δtempo, …];
//  - as palavras consultadas no estudo em andamento viram a posição delas entre os tokens da questão (+ soma);
//  - id de tentativa e de cartão só vão quando não dá para refazê-los a partir do resto (quase sempre dá);
//  - a frase de um cartão (HSK) vira só a posição dela na questão de origem + uma soma de conferência, quando a prova
//    (public/conteudo/provas) tem exatamente aquela frase; e o pinyin/tradução do cartão "palavra", uma marca, quando são
//    os do léxico. Na volta, a frase sai da prova e a soma confere que é a mesma; se o conteúdo da prova tiver mudado
//    depois (novo deploy), fica a versão atual dela (equivalente para a revisão). Sem a prova carregada, vai a frase;
//  - as frases que vão inteiras ficam uma vez só numa tabela, com os tokens como tamanhos, o pinyin numa string e os
//    tempos do áudio em centésimos, em base 36 e por diferença;
//  - o trecho de áudio do cartão é omitido quando é exatamente o que a frase dá (a mesma conta de src/cartoes.ts).
// E três arredondamentos que não mudam nada para o app (canonico()): o FSRS com 3 algarismos na estabilidade e
// 2 casas na dificuldade (o intervalo seguinte muda menos de 0,5%), o instante de cada resposta (não aparece em lugar
// nenhum) em segundos — em minutos nas tentativas encerradas — e as palavras consultadas das tentativas encerradas,
// que só servem para sugerir cartões no estudo em andamento.
// Tudo o que o codec não conhece (campos novos, valores fora do esperado) vai do jeito que está, então nada se perde.
// Por segurança, compacta() confere a ida e volta e, se algo não bater, usa o estado inteiro sem compactar.
// Depois disso o JSON é comprimido com gzip (CompressionStream) e vai em base64 — ver empacota().

type Obj = Record<string, unknown>;

/** versão do formato compacto (marca "_c" no objeto guardado; o formato antigo não tem a marca) */
const VERSAO = 1;

const ehObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const ehInt = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x);
const ehStr = (x: unknown): x is string => typeof x === "string";

/** Tira de `o` as chaves já tratadas; o que sobrar vai junto do jeito que está (chave "x"). */
function resto(o: Obj, tratadas: Set<string>): Obj | undefined {
  let r: Obj | undefined;
  for (const [k, v] of Object.entries(o)) {
    if (tratadas.has(k) || v === undefined) continue;
    (r ??= {})[k] = v;
  }
  return r;
}

// ------------------------------------------------- de onde vêm as frases dos cartões

/** Acesso síncrono ao conteúdo das provas já carregado (src/fonteNuvem.ts). */
export interface Fonte {
  /** frases da questão (a mesma lista de frasesDaQuestao), ou null se a prova não está carregada */
  frases(prova: string, n: number): unknown[] | null;
  /** pinyin e tradução do léxico (como sugereCartoes monta o cartão), ou null sem léxico */
  verbete(w: string): { py?: string; pt?: string } | null;
}

interface Fontes {
  /** carrega as provas pedidas (e o léxico) e devolve a fonte; lança erro se não conseguir */
  carrega(provas: string[]): Promise<Fonte>;
  /** só o que já está carregado (para o envio síncrono da aba fechando) */
  jaCarregado(): Fonte;
}

const fontes = new Map<Parte, Fontes>();

/** A parte que tem frases de prova nos cartões avisa aqui como carregá-las (o HSK; o HSKK manda as frases inteiras). */
export function registraFonte(parte: Parte, f: Fontes) {
  fontes.set(parte, f);
}

/** Soma de conferência (FNV-1a, 10 bits em base 36: dois caracteres) do JSON com as chaves em ordem. */
function soma(x: unknown): string {
  // as frases das provas e as dos cartões são objetos que não mudam: a soma de cada um é calculada uma vez só
  const guardada = x && typeof x === "object" ? somas.get(x) : undefined;
  if (guardada !== undefined) return guardada;
  const s = jsonOrdenado(x);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  const r = ((h >>> 0) & 0x3ff).toString(36);
  if (x && typeof x === "object") somas.set(x, r);
  return r;
}
const somas = new WeakMap<object, string>();

function jsonOrdenado(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map((v) => (v === undefined ? "null" : jsonOrdenado(v))).join(",")}]`;
  if (ehObj(x))
    return `{${Object.keys(x)
      .filter((k) => x[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonOrdenado(x[k])}`)
      .join(",")}}`;
  return JSON.stringify(x);
}

// ------------------------------------------------------------------ números

const b36 = (n: number) => n.toString(36);
const de36 = (s: string) => parseInt(s, 36);

/** O número tem no máximo duas casas e volta idêntico de centésimos? */
const centesimos = (x: unknown): number | null => {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  const c = Math.round(x * 100);
  return c / 100 === x && Number.isSafeInteger(c) ? c : null;
};

const estabilidade = (x: number) => Number(x.toPrecision(3));
const dificuldade = (x: number) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ frases

/** Tempos [início, fim] de cada token → "Δinício.duração,…" em centésimos base 36 (vazio = sem tempo). */
function tempos(a: unknown): string | null {
  if (!Array.isArray(a) || !a.length) return null;
  let fim = 0;
  const partes: string[] = [];
  for (const t of a) {
    if (t === null) {
      partes.push("");
      continue;
    }
    if (!Array.isArray(t) || t.length !== 2) return null;
    const s = centesimos(t[0]);
    const e = centesimos(t[1]);
    if (s === null || e === null) return null;
    partes.push(`${b36(s - fim)}.${b36(e - s)}`);
    fim = e;
  }
  return partes.join(",");
}

function desfazTempos(s: string): ([number, number] | null)[] {
  let fim = 0;
  return s.split(",").map((p) => {
    if (!p) return null;
    const [ds, dur] = p.split(".");
    const ini = fim + de36(ds);
    fim = ini + de36(dur);
    return [ini / 100, fim / 100];
  });
}

function compactaFrase(f: Obj): Obj {
  const c: Obj = {};
  const tratadas = new Set<string>();
  if (ehStr(f.zh)) {
    c.z = f.zh;
    tratadas.add("zh");
  }
  const tk = f.tk;
  if (ehStr(f.zh) && Array.isArray(tk) && tk.length && tk.every((t) => ehStr(t) && t.length > 0 && t.length < 36) && tk.join("") === f.zh) {
    c.k = tk.map((t: string) => b36(t.length)).join("");
    tratadas.add("tk");
  }
  const py = f.py;
  if (Array.isArray(py) && py.length && py.every((p) => ehStr(p) && !p.includes(" "))) {
    c.y = py.join(" ");
    tratadas.add("py");
  }
  if (ehStr(f.pt)) {
    c.t = f.pt;
    tratadas.add("pt");
  }
  if (ehStr(f.ptL)) {
    c.l = f.ptL;
    tratadas.add("ptL");
  }
  for (const [k, ck] of [["a", "a"], ["a2", "b"]] as const) {
    const t = tempos(f[k]);
    if (t !== null) {
      c[ck] = t;
      tratadas.add(k);
    }
  }
  const x = resto(f, tratadas);
  if (x) c.x = x;
  return c;
}

function desfazFrase(c: Obj): Obj {
  const f: Obj = {};
  if (ehStr(c.z)) f.zh = c.z;
  if (ehStr(c.k) && ehStr(c.z)) {
    const tk: string[] = [];
    let i = 0;
    for (const d of c.k) {
      const n = de36(d);
      tk.push(c.z.slice(i, i + n));
      i += n;
    }
    f.tk = tk;
  }
  if (ehStr(c.y)) f.py = c.y.split(" ");
  if (ehStr(c.t)) f.pt = c.t;
  if (ehStr(c.l)) f.ptL = c.l;
  if (ehStr(c.a)) f.a = desfazTempos(c.a);
  if (ehStr(c.b)) f.a2 = desfazTempos(c.b);
  return ehObj(c.x) ? { ...f, ...c.x } : f;
}

// ------------------------------------------------------- trechos de áudio dos cartões
// Cópias congeladas de trechoDe/trechoPalavra (src/cartoes.ts): se lá mudar, os cartões já gravados continuam
// voltando iguais (o codec só omite o trecho quando a conta daqui dá exatamente o valor guardado).

type Trecho = { prova: string; s: number; e: number };

function trechoDaFrase(f: Obj, prova: string): Trecho | null {
  const tempos = (Array.isArray(f.a) ? f.a : []).filter(Boolean) as [number, number][];
  if (!tempos.length) return null;
  return { prova, s: Math.max(0, tempos[0][0] - 0.15), e: tempos[tempos.length - 1][1] + 0.35 };
}

function trechoDaPalavra(f: Obj, w: string, prova: string): Trecho | null {
  const tk = Array.isArray(f.tk) ? (f.tk as unknown[]) : [];
  const i = tk.indexOf(w);
  const a = f.a as ([number, number] | null)[] | undefined;
  const a2 = f.a2 as ([number, number] | null)[] | undefined;
  const t = i >= 0 ? a?.[i] ?? a2?.[i] : null;
  return t ? { prova, s: Math.max(0, t[0] - 0.08), e: t[1] + 0.15 } : null;
}

const mesmoTrecho = (x: unknown, y: Trecho | null) =>
  y !== null && ehObj(x) && Object.keys(x).length === 3 && x.prova === y.prova && x.s === y.s && x.e === y.e;

/** Trecho guardado → 1 (é o que a frase dá), [s, e] (da prova de origem) ou o objeto do jeito que está. */
function compactaTrecho(x: unknown, derivado: Trecho | null, prova: unknown): unknown {
  if (mesmoTrecho(x, derivado)) return 1;
  if (ehObj(x) && Object.keys(x).length === 3 && x.prova === prova && typeof x.s === "number" && typeof x.e === "number") return [x.s, x.e];
  return x;
}

function desfazTrecho(c: unknown, derivado: () => Trecho | null, prova: unknown): unknown {
  if (c === 1) return derivado();
  if (Array.isArray(c) && c.length === 2) return { prova, s: c[0], e: c[1] };
  return c;
}

// ------------------------------------------------------------------ cartões

const CHAVES_SRS = ["due", "stability", "difficulty", "elapsed_days", "scheduled_days", "reps", "lapses", "state", "last_review"];

function idPadrao(c: Obj, frase: Obj | undefined): string | undefined {
  const o = c.origem as Obj | undefined;
  if (c.tipo === "questao" && ehObj(o)) return `q:${o.prova}:${o.n}`;
  if (c.tipo === "frase" && frase && ehStr(frase.zh)) return `f:${frase.zh}`;
  if (c.tipo === "palavra" && ehStr(c.palavra)) return `p:${c.palavra}`;
  return undefined;
}

/** Dias agendados que o vencimento já diz: o FSRS agenda dias inteiros (ou minutos, com 0 dias); sem revisão, 0. */
const diasDoVencimento = (d: unknown, comRevisao: boolean) =>
  !comRevisao ? 0 : typeof d !== "number" ? null : d < 0 ? -d : Math.floor(d / 1440);

/**
 * srs → [vencimento, estabilidade, dificuldade, dias, reps, lapsos, estado, Δúltima revisão | null, dias agendados?].
 * O vencimento conta da última revisão (é o intervalo agendado) ou, sem revisão, da criação do cartão: em dias inteiros
 * como número negativo, em minutos quando é exato, senão [ms]. Os dias agendados só vão quando não batem com o
 * vencimento.
 */
function compactaSrs(s: unknown, p: Passagem): unknown {
  if (!ehObj(s) || Object.entries(s).some(([k, v]) => v !== undefined && !CHAVES_SRS.includes(k))) return { r: s };
  const { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review } = s;
  const nums = [stability, difficulty, elapsed_days, reps, lapses, state];
  if (!ehInt(due) || [...nums, scheduled_days].some((n) => typeof n !== "number" || !Number.isFinite(n)) || !(last_review === undefined || ehInt(last_review)))
    return { r: s };
  const ms = due - (ehInt(last_review) ? last_review : p.criado);
  const d = ms > 0 && ms % 86400000 === 0 ? -ms / 86400000 : ms >= 0 && ms % 60000 === 0 ? ms / 60000 : [ms];
  const v: unknown[] = [d, ...nums];
  // revisões feitas na mesma sessão ficam a segundos umas das outras: conta da última revisão do cartão anterior
  if (ehInt(last_review)) {
    v.push(p.revisao - last_review);
    p.revisao = last_review;
  } else v.push(null);
  if (scheduled_days !== diasDoVencimento(d, ehInt(last_review))) v.push(scheduled_days);
  return v;
}

function desfazSrs(v: unknown, p: Passagem): unknown {
  if (!Array.isArray(v)) return ehObj(v) ? v.r : v;
  const [d, stability, difficulty, elapsed_days, reps, lapses, state, lr, dias] = v as unknown[];
  let last_review: number | undefined;
  if (typeof lr === "number") {
    p.revisao -= lr;
    last_review = p.revisao;
  }
  const ms = Array.isArray(d) ? (d[0] as number) : (d as number) < 0 ? -(d as number) * 86400000 : (d as number) * 60000;
  const due = ms + (last_review ?? p.criado);
  const scheduled_days = dias ?? diasDoVencimento(d, last_review !== undefined);
  const s: Obj = { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state };
  if (last_review !== undefined) s.last_review = last_review;
  return s;
}

/** Estado da passagem pelos cartões (na ida e na volta): tabela de frases inteiras, `criado` e última revisão do anterior. */
interface Passagem {
  base: number;
  fonte?: Fonte;
  frases: Obj[];
  indice: Map<string, number>;
  criado: number;
  revisao: number;
  origem?: [string, number];
}

/** Frase do cartão → posição na questão de origem + soma ([j, soma]), se a prova carregada tem exatamente ela. */
function referencia(frase: Obj, prova: unknown, n: unknown, fonte?: Fonte): [number, string] | null {
  if (!fonte || !ehStr(prova) || !ehInt(n)) return null;
  const lista = fonte.frases(prova, n);
  if (!lista) return null;
  // a soma separa as candidatas; a comparação inteira confirma
  const s = soma(frase);
  const j = lista.findIndex((f) => soma(f) === s && mesmoJson(f, frase));
  return j >= 0 ? [j, s] : null;
}

/**
 * Volta da referência: a frase na posição guardada, ou a da mesma soma na questão, ou (conteúdo mudou) a da posição.
 * Se nem a questão existir mais, o cartão fica sem frase (o "frase" ganha uma mínima, feita do próprio id).
 */
function resolveReferencia(r: unknown[], prova: unknown, n: unknown, palavra: unknown, fonte?: Fonte): Obj | undefined {
  if (!fonte) throw new Error("faltou carregar as provas para abrir o progresso");
  const lista = ehStr(prova) && ehInt(n) ? fonte.frases(prova, n) : null;
  // null: a prova não carregou (sem rede?) — a leitura falha e é tentada de novo depois; [] = a prova não existe mais
  if (!lista) throw new Error(`a prova ${String(prova)} não foi carregada`);
  const [j, s] = r as [number, string];
  const naPosicao = lista[j];
  if (ehObj(naPosicao) && soma(naPosicao) === s) return naPosicao;
  const igual = lista.find((f) => soma(f) === s);
  if (ehObj(igual)) return igual;
  // o conteúdo da prova mudou depois que o cartão foi gravado: fica a versão atual da frase (para o cartão "palavra",
  // a primeira da questão com a palavra, como em sugereCartoes)
  console.warn(`frase do cartão (${String(prova)}, ${String(n)}) mudou na prova; usando a versão atual`);
  const comPalavra = ehStr(palavra) ? lista.find((f) => ehObj(f) && Array.isArray(f.tk) && f.tk.includes(palavra)) : undefined;
  const f = comPalavra ?? naPosicao;
  return ehObj(f) ? f : undefined;
}

function compactaCartao(c: Obj, p: Passagem): Obj {
  const k: Obj = {};
  const tratadas = new Set<string>();
  const usa = (chave: string, ck: string, v: unknown) => {
    tratadas.add(chave);
    k[ck] = v;
  };
  const o = c.origem;
  const prova = ehObj(o) ? o.prova : undefined;
  const frase = ehObj(c.frase) ? c.frase : undefined;
  if (frase) {
    const r = referencia(frase, prova, ehObj(o) ? o.n : undefined, p.fonte);
    // no cartão "frase" vai também a soma do texto (o id dele), para avisar na volta se o texto mudou
    if (r) usa("frase", "r", c.tipo === "frase" ? [...r, soma(frase.zh)] : r);
    else {
      const json = jsonOrdenado(frase);
      let i = p.indice.get(json);
      if (i === undefined) {
        i = p.frases.length;
        p.frases.push(compactaFrase(frase));
        p.indice.set(json, i);
      }
      usa("frase", "f", i);
    }
  }
  if (ehStr(c.tipo)) usa("tipo", "k", c.tipo === "questao" ? "q" : c.tipo === "frase" ? "f" : c.tipo === "palavra" ? "p" : `=${c.tipo}`);
  if (ehObj(o) && Object.keys(o).length === 2 && ehStr(o.prova) && ehInt(o.n)) {
    // cartões da mesma questão vêm juntos: null = mesma origem do anterior; só o número = mesma prova
    const [pa, na] = p.origem ?? [];
    usa("origem", "o", o.prova !== pa ? [o.prova, o.n] : o.n !== na ? o.n : null);
    p.origem = [o.prova, o.n];
  }
  if (ehStr(c.id) && "k" in k && "o" in k) {
    tratadas.add("id");
    if (c.id !== idPadrao(c, frase)) k.i = c.id;
  }
  if (ehInt(c.criado)) {
    // cartões criados juntos (da mesma questão) têm o mesmo instante: conta do cartão anterior
    usa("criado", "c", p.criado - c.criado);
    p.criado = c.criado;
  }
  const srs = ehObj(c.srs) ? c.srs : undefined;
  if (ehInt(c.atualizado)) {
    // atualizado costuma ser o instante da última revisão: guarda a diferença (quase sempre 0)
    const lr = ehInt(srs?.last_review) ? srs!.last_review : null;
    usa("atualizado", "u", lr !== null ? [c.atualizado - lr] : p.base - c.atualizado);
  }
  if ("srs" in c) usa("srs", "s", compactaSrs(c.srs, p));
  if (ehStr(c.palavra)) {
    usa("palavra", "w", c.palavra);
    // pinyin e tradução iguais aos do léxico: só a marca
    const v = p.fonte?.verbete(c.palavra);
    if (v && (ehStr(c.py) || ehStr(c.pt)) && c.py === v.py && c.pt === v.pt) {
      tratadas.add("py");
      tratadas.add("pt");
      k.l = 1;
    }
  }
  if (ehStr(c.py) && !k.l) usa("py", "y", c.py);
  if (ehStr(c.pt) && !k.l) usa("pt", "t", c.pt);
  if ("audio" in c && c.audio !== undefined) {
    usa("audio", "a", compactaTrecho(c.audio, frase && ehStr(prova) ? trechoDaFrase(frase, prova) : null, prova));
  }
  if ("audioPalavra" in c && c.audioPalavra !== undefined) {
    const d = frase && ehStr(prova) && ehStr(c.palavra) ? trechoDaPalavra(frase, c.palavra, prova) : null;
    usa("audioPalavra", "b", compactaTrecho(c.audioPalavra, d, prova));
  }
  const x = resto(c, tratadas);
  if (x) k.x = x;
  return k;
}

function desfazCartao(k: Obj, p: Passagem): Obj {
  const c: Obj = {};
  if (ehStr(k.k)) c.tipo = k.k === "q" ? "questao" : k.k === "f" ? "frase" : k.k === "p" ? "palavra" : k.k.slice(1);
  if ("o" in k) {
    if (Array.isArray(k.o)) p.origem = [k.o[0] as string, k.o[1] as number];
    else if (ehInt(k.o) && p.origem) p.origem = [p.origem[0], k.o];
    if (p.origem) c.origem = { prova: p.origem[0], n: p.origem[1] };
  }
  const prova = ehObj(c.origem) ? c.origem.prova : undefined;
  if (ehInt(k.c)) {
    p.criado -= k.c;
    c.criado = p.criado;
  }
  if (ehStr(k.w)) c.palavra = k.w;
  if (k.l === 1 && ehStr(k.w)) {
    const v = p.fonte?.verbete(k.w);
    if (!v) throw new Error("faltou carregar o léxico para abrir o progresso");
    if (v.py !== undefined) c.py = v.py;
    if (v.pt !== undefined) c.pt = v.pt;
  }
  if (ehStr(k.y)) c.py = k.y;
  if (ehStr(k.t)) c.pt = k.t;
  let frase = Array.isArray(k.r)
    ? resolveReferencia(k.r, prova, ehObj(c.origem) ? c.origem.n : undefined, k.w, p.fonte)
    : ehInt(k.f)
      ? p.frases[k.f]
      : undefined;
  let id = ehStr(k.i) ? k.i : undefined;
  if (Array.isArray(k.r) && c.tipo === "frase" && id === undefined) {
    // o id do cartão "frase" é o texto dela (f:texto). Se o texto mudou num deploy, o id muda junto (o cartão pode
    // aparecer repetido num aparelho que tinha alterações pendentes com o id antigo); se a questão sumiu, fica um
    // cartão com o aviso no lugar da frase.
    if (!frase) {
      const zh = "(frase removida do site)";
      frase = { zh, tk: [zh], py: [""] };
      id = `f:${String(prova)}:${String(ehObj(c.origem) ? c.origem.n : "")}`;
    } else if (soma(frase.zh) !== k.r[2]) console.warn(`o texto do cartão ${String(prova)}:${String(ehObj(c.origem) ? c.origem.n : "")} mudou na prova`);
  }
  // a mesma frase pode estar em vários cartões: cada um com a sua cópia, como no formato normal
  if (frase) c.frase = structuredClone(frase);
  if ("s" in k) c.srs = desfazSrs(k.s, p);
  const srs = ehObj(c.srs) ? c.srs : undefined;
  if (Array.isArray(k.u)) c.atualizado = (srs!.last_review as number) + (k.u[0] as number);
  else if (ehInt(k.u)) c.atualizado = p.base - k.u;
  if ("k" in k && "o" in k) c.id = id ?? idPadrao(c, frase);
  if ("a" in k) c.audio = desfazTrecho(k.a, () => (frase && ehStr(prova) ? trechoDaFrase(frase, prova) : null), prova);
  if ("b" in k)
    c.audioPalavra = desfazTrecho(k.b, () => (frase && ehStr(prova) && ehStr(c.palavra) ? trechoDaPalavra(frase, c.palavra, prova) : null), prova);
  return ehObj(k.x) ? { ...c, ...k.x } : c;
}

// --------------------------------------------------------------- tentativas

const CHAVES_RESPOSTA = new Set(["valor", "certa", "manual", "em", "pendente"]);

/** Valor de uma resposta → 1 caractere (letra maiúscula, + certo, - errado, _ nada) ou <texto> (ordenar, hanzi). */
function codValor(v: unknown): string | null {
  if (v === true) return "+";
  if (v === false) return "-";
  if (v === null) return "_";
  if (!ehStr(v)) return null;
  if (/^[A-Z]$/.test(v)) return v;
  return /[<>,]/.test(v) ? null : `<${v}>`;
}

/**
 * Respostas (HSK) → uma string, uma resposta por vírgula: [@Δn]valor marcas Δt. Δn (base 36) só quando a questão não
 * é a seguinte da anterior; marcas, um dígito base 36 (1 = certa, 2 = manual, 4 = pendente; 8 e 16: manual/pendente
 * gravados como false); Δt (base 36): tempo desde a resposta anterior (a primeira, desde o início), na unidade da
 * tentativa (unidadeEm). Se alguma resposta fugir do formato, vão todas do jeito que estão.
 */
function compactaRespostas(r: unknown, inicio: number, unidade: number): string | null {
  if (!ehObj(r)) return null;
  const chaves = Object.keys(r);
  if (chaves.some((k) => String(Number(k)) !== k || !Number.isSafeInteger(Number(k)))) return null;
  const ns = chaves.map(Number).sort((a, b) => a - b);
  const out: string[] = [];
  let nAnt = 0;
  let sAnt = 0;
  for (const n of ns) {
    const x = r[n];
    if (!ehObj(x) || Object.entries(x).some(([k, v]) => v !== undefined && !CHAVES_RESPOSTA.has(k))) return null;
    const { valor, certa, manual, em, pendente } = x;
    const cod = codValor(valor);
    if (cod === null || typeof certa !== "boolean" || !ehInt(em) || (em - inicio) % unidade !== 0) return null;
    if (!(manual === undefined || typeof manual === "boolean") || !(pendente === undefined || typeof pendente === "boolean")) return null;
    const marcas = (certa ? 1 : 0) | (manual ? 2 : 0) | (pendente ? 4 : 0) | (manual === false ? 8 : 0) | (pendente === false ? 16 : 0);
    const s = (em - inicio) / unidade;
    out.push(`${n - nAnt === 1 ? "" : `@${b36(n - nAnt)}`}${cod}${b36(marcas)}${b36(s - sAnt)}`);
    nAnt = n;
    sAnt = s;
  }
  return out.join(",");
}

function desfazRespostas(v: string, inicio: number, unidade: number): Obj {
  const r: Obj = {};
  let n = 0;
  let s = 0;
  // a vírgula não aparece dentro de <texto> (codValor recusa)
  for (const item of v ? v.split(",") : []) {
    const m = /^(?:@([0-9a-z]+))?(<[^>]*>|[A-Z+\-_])([0-9a-v])(-?[0-9a-z]+)$/.exec(item);
    if (!m) throw new Error(`resposta compacta inválida: ${item}`);
    n += m[1] ? de36(m[1]) : 1;
    s += de36(m[4]);
    const marcas = de36(m[3]);
    const c = m[2];
    const valor = c === "+" ? true : c === "-" ? false : c === "_" ? null : c.startsWith("<") ? c.slice(1, -1) : c;
    const x: Obj = { valor, certa: !!(marcas & 1) };
    if (marcas & 2) x.manual = true;
    else if (marcas & 8) x.manual = false;
    x.em = inicio + s * unidade;
    if (marcas & 4) x.pendente = true;
    else if (marcas & 16) x.pendente = false;
    r[n] = x;
  }
  return r;
}

/** Tokens de todas as frases da questão, na ordem (null se a prova não está carregada). */
function tokensDaQuestao(prova: unknown, n: number, fonte?: Fonte): string[] | null {
  const lista = fonte && ehStr(prova) ? fonte.frases(prova, n) : null;
  if (!lista) return null;
  return lista.flatMap((f) => (ehObj(f) && Array.isArray(f.tk) ? f.tk.filter(ehStr) : []));
}

/**
 * Palavras consultadas por questão → "n.soma:i i 'palavra;n:…": cada palavra é a posição (base 36) da primeira vez que
 * ela aparece entre os tokens da questão, ou a própria palavra depois de um apóstrofo. A soma confere os tokens na
 * volta. Se alguma palavra tiver espaço, ; ou :, vai tudo como está.
 */
function compactaConsultas(c: unknown, prova: unknown, fonte?: Fonte): string | null {
  if (!ehObj(c)) return null;
  const partes: string[] = [];
  for (const [n, ws] of Object.entries(c)) {
    if (String(Number(n)) !== n || !Array.isArray(ws) || ws.some((w) => !ehStr(w) || !w || /[ ;:]/.test(w))) return null;
    const tokens = tokensDaQuestao(prova, Number(n), fonte);
    let usou = false;
    const itens = (ws as string[]).map((w) => {
      const i = tokens ? tokens.indexOf(w) : -1;
      if (i < 0) return `'${w}`;
      usou = true;
      return b36(i);
    });
    partes.push(`${n}${usou ? `.${soma(tokens)}` : ""}:${itens.join(" ")}`);
  }
  return partes.join(";");
}

function desfazConsultas(s: string, prova: unknown, fonte?: Fonte): Obj {
  const c: Obj = {};
  if (!s) return c;
  for (const p of s.split(";")) {
    const i = p.indexOf(":");
    const [n, sm] = p.slice(0, i).split(".");
    let tokens: string[] | null = null;
    if (sm !== undefined) {
      tokens = tokensDaQuestao(prova, Number(n), fonte);
      if (!tokens) throw new Error(`a prova ${String(prova)} não foi carregada`);
      // a questão mudou depois (novo deploy): as posições não valem mais; ficam só as palavras escritas por extenso
      if (soma(tokens) !== sm) tokens = null;
    }
    const itens = p.slice(i + 1);
    c[n] = itens
      ? itens
          .split(" ")
          .map((x) => (x.startsWith("'") ? x.slice(1) : tokens?.[de36(x)]))
          .filter(ehStr)
      : [];
  }
  return c;
}

/** As consultas da tentativa compacta usam posições (precisam da prova)? */
const consultasCitam = (c: unknown) => ehStr(c) && /(^|;)\d+\./.test(c);

/** Unidade (ms) do instante das respostas: segundos no estudo/prova em andamento, minutos nas tentativas encerradas. */
const unidadeEm = (t: Obj) => (t.fim !== undefined || t.arquivada === true ? 60000 : 1000);

const DATAS_TENTATIVA = { atualizado: "u", fim: "f", etapaInicio: "e" } as const;

function compactaTentativa(t: Obj, base: number, fonte?: Fonte): Obj {
  const k: Obj = {};
  const tratadas = new Set<string>();
  const usa = (chave: string, ck: string, v: unknown) => {
    tratadas.add(chave);
    k[ck] = v;
  };
  if (ehStr(t.prova)) usa("prova", "p", t.prova);
  if (t.modo === "prova" || t.modo === "estudo") usa("modo", "m", t.modo === "prova" ? "p" : "e");
  if (ehInt(t.inicio)) {
    usa("inicio", "n", base - t.inicio);
    // as outras datas contam a partir do início
    for (const [d, ck] of Object.entries(DATAS_TENTATIVA)) if (ehInt(t[d])) usa(d, ck, (t[d] as number) - (t.inicio as number));
    const r = compactaRespostas(t.respostas, t.inicio, unidadeEm(t));
    if (r !== null) usa("respostas", "r", r);
  }
  const cs = compactaConsultas(t.consultas, t.prova, fonte);
  if (cs !== null) usa("consultas", "c", cs);
  if (ehStr(t.id) && "p" in k && "m" in k && "n" in k) {
    tratadas.add("id");
    if (t.id !== `${t.prova}-${t.modo}-${(t.inicio as number).toString(36)}`) k.i = t.id;
  }
  const x = resto(t, tratadas);
  if (x) k.x = x;
  return k;
}

function desfazTentativa(k: Obj, base: number, fonte?: Fonte): Obj {
  const t: Obj = {};
  if (ehStr(k.p)) t.prova = k.p;
  if (k.m === "p" || k.m === "e") t.modo = k.m === "p" ? "prova" : "estudo";
  if (ehInt(k.n)) {
    const inicio = base - k.n;
    t.inicio = inicio;
    if (ehInt(k.u)) t.atualizado = inicio + k.u;
    if (ehInt(k.f)) t.fim = inicio + k.f;
    if (ehInt(k.e)) t.etapaInicio = inicio + k.e;
  }
  if (ehStr(k.c)) t.consultas = desfazConsultas(k.c, t.prova, fonte);
  if ("p" in k && "m" in k && "n" in k) t.id = ehStr(k.i) ? k.i : `${t.prova}-${t.modo}-${(t.inicio as number).toString(36)}`;
  const out = ehObj(k.x) ? { ...t, ...k.x } : t;
  // a unidade do instante das respostas depende de a tentativa estar encerrada (fim/arquivada, que podem vir em x)
  if (ehStr(k.r) && ehInt(out.inicio)) out.respostas = desfazRespostas(k.r, out.inicio, unidadeEm(out));
  return out;
}

// ------------------------------------------------------------- estado inteiro

/**
 * O estado com os arredondamentos que a compactação aplica e que não mudam nada para o app: FSRS com 3 algarismos na
 * estabilidade e 2 casas na dificuldade; instante das respostas em segundos inteiros desde o início da tentativa;
 * sem as palavras consultadas das tentativas encerradas (arquivadas ou terminadas — elas só alimentam as sugestões de
 * cartões do estudo em andamento, src/paginas/Estudo.tsx).
 */
export function canonico(e: unknown): unknown {
  if (!ehObj(e)) return e;
  const out: Obj = { ...e };
  if (ehObj(e.cartoes)) {
    const cartoes: Obj = {};
    for (const [id, c] of Object.entries(e.cartoes)) {
      const s = ehObj(c) && ehObj(c.srs) ? c.srs : null;
      cartoes[id] =
        s && typeof s.stability === "number" && typeof s.difficulty === "number" && Number.isFinite(s.stability) && Number.isFinite(s.difficulty)
          ? { ...(c as Obj), srs: { ...s, stability: estabilidade(s.stability), difficulty: dificuldade(s.difficulty) } }
          : c;
    }
    out.cartoes = cartoes;
  }
  if (ehObj(e.tentativas)) {
    const tentativas: Obj = {};
    for (const [id, t] of Object.entries(e.tentativas)) {
      if (!ehObj(t)) {
        tentativas[id] = t;
        continue;
      }
      const nova: Obj = { ...t };
      if (ehObj(t.consultas) && (t.arquivada === true || t.fim !== undefined)) delete nova.consultas;
      if (ehObj(t.respostas) && ehInt(t.inicio)) {
        const inicio = t.inicio;
        const u = unidadeEm(t);
        const respostas: Obj = {};
        for (const [n, r] of Object.entries(t.respostas))
          respostas[n] = ehObj(r) && ehInt(r.em) ? { ...r, em: inicio + Math.round((r.em - inicio) / u) * u } : r;
        nova.respostas = respostas;
      }
      tentativas[id] = nova;
    }
    out.tentativas = tentativas;
  }
  return out;
}

/** Igualdade de JSON: ignora a ordem das chaves e chaves com undefined (que o JSON não guarda). */
export function mesmoJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => mesmoJson(x === undefined ? null : x, b[i] === undefined ? null : b[i]));
  }
  const ka = Object.keys(a as Obj).filter((k) => (a as Obj)[k] !== undefined);
  const kb = Object.keys(b as Obj).filter((k) => (b as Obj)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => k in (b as Obj) && mesmoJson((a as Obj)[k], (b as Obj)[k]));
}

function compactaSemConferir(e: Obj, fonte?: Fonte): Obj {
  const base = ehInt(e.salvoEm) ? e.salvoEm : 0;
  const c: Obj = ehInt(e.salvoEm) ? { _c: VERSAO, B: base } : { _c: VERSAO };
  const tratadas = new Set(ehInt(e.salvoEm) ? ["salvoEm"] : []);
  if (ehObj(e.tentativas)) {
    tratadas.add("tentativas");
    c.T = Object.entries(e.tentativas).map(([id, t]) => {
      const k = ehObj(t) ? compactaTentativa(t, base, fonte) : { v: t };
      // a chave do registro é o id da tentativa; se não for, guarda a chave à parte
      return ehObj(t) && t.id === id ? k : { ...k, K: id };
    });
  }
  if (ehObj(e.cartoes)) {
    tratadas.add("cartoes");
    const p: Passagem = { base, fonte, frases: [], indice: new Map(), criado: base, revisao: base };
    c.C = Object.entries(e.cartoes).map(([id, x]) => {
      const k = ehObj(x) ? compactaCartao(x, p) : { v: x };
      return ehObj(x) && x.id === id ? k : { ...k, K: id };
    });
    if (p.frases.length) c.F = p.frases;
  }
  // marcações do vocabulário: as chaves ("汉字|pinyin") em ordem, numa string por marca (k, x)
  const v = e.vocab;
  if (ehObj(v) && ehObj(v.marcas)) {
    const marcas = Object.entries(v.marcas);
    if (marcas.every(([k, m]) => (m === "k" || m === "x") && k && !k.includes("\n"))) {
      tratadas.add("vocab");
      const lista = (m: string) => marcas.filter(([, x]) => x === m).map(([k]) => k).sort().join("\n");
      const { marcas: _, ...restoVocab } = v;
      c.V = [lista("k"), lista("x"), restoVocab];
    }
  }
  const x = resto(e, tratadas);
  if (x) c.x = x;
  return c;
}

function desfazLista(lista: unknown, desfaz: (k: Obj) => Obj): Obj {
  const out: Obj = {};
  for (const k of Array.isArray(lista) ? lista : []) {
    if (!ehObj(k)) continue;
    const { K, ...sem } = k;
    const v = "v" in sem ? sem.v : desfaz(sem);
    out[ehStr(K) ? K : ehObj(v) && ehStr(v.id) ? v.id : String(Object.keys(out).length)] = v;
  }
  return out;
}

/**
 * Objeto compacto (marca "_c") → estado no formato normal. Estado no formato normal passa direto. Cartões com a frase
 * por referência precisam da fonte com as provas deles carregadas (provasCitadas); sem ela, lança erro.
 */
export function descompacta(c: unknown, fonte?: Fonte): unknown {
  if (!ehObj(c) || c._c !== VERSAO) return c;
  const base = ehInt(c.B) ? c.B : 0;
  const e: Obj = ehObj(c.x) ? { ...c.x } : {};
  if (ehInt(c.B)) e.salvoEm = c.B;
  if (Array.isArray(c.V)) {
    const [k, x, resto] = c.V as [string, string, Obj];
    const marcas: Obj = {};
    for (const [lista, m] of [[k, "k"], [x, "x"]]) for (const chave of lista ? lista.split("\n") : []) marcas[chave] = m;
    e.vocab = { ...resto, marcas };
  }
  if ("T" in c) e.tentativas = desfazLista(c.T, (k) => desfazTentativa(k, base, fonte));
  if ("C" in c) {
    const frases = (Array.isArray(c.F) ? c.F : []).map((f) => (ehObj(f) ? desfazFrase(f) : {}));
    const p: Passagem = { base, fonte, frases, indice: new Map(), criado: base, revisao: base };
    e.cartoes = desfazLista(c.C, (k) => desfazCartao(k, p));
  }
  return e;
}

/** Provas que a volta precisa carregar (cartões com a frase ou o verbete por referência, consultas por posição). */
export function provasCitadas(c: unknown): string[] {
  const out = new Set<string>();
  if (!ehObj(c) || c._c !== VERSAO) return [];
  let prova: string | undefined;
  if (Array.isArray(c.C))
    for (const k of c.C) {
      if (!ehObj(k)) continue;
      if (Array.isArray(k.o) && ehStr(k.o[0])) prova = k.o[0];
      if ((Array.isArray(k.r) || k.l === 1) && prova) out.add(prova);
    }
  if (Array.isArray(c.T)) for (const k of c.T) if (ehObj(k) && ehStr(k.p) && consultasCitam(k.c)) out.add(k.p);
  return [...out];
}

/** Provas que a compactação pode citar: dos cartões com frase ou palavra e do estudo em andamento com consultas. */
function provasCitaveis(e: unknown): string[] {
  const out = new Set<string>();
  if (!ehObj(e)) return [];
  if (ehObj(e.cartoes))
    for (const c of Object.values(e.cartoes))
      if (ehObj(c) && (ehObj(c.frase) || ehStr(c.palavra)) && ehObj(c.origem) && ehStr(c.origem.prova)) out.add(c.origem.prova);
  if (ehObj(e.tentativas))
    for (const t of Object.values(e.tentativas))
      if (ehObj(t) && ehStr(t.prova) && ehObj(t.consultas) && Object.keys(t.consultas).length && unidadeEm(t) === 1000) out.add(t.prova);
  return [...out];
}

/**
 * Estado → objeto compacto. Confere a volta: se descompacta() não devolver canonico(estado), devolve o estado como
 * está — nunca se arrisca a perder um campo.
 */
export function compacta(e: unknown, fonte?: Fonte): unknown {
  if (!ehObj(e) || "_c" in e || "_z" in e) return e;
  try {
    const canon = canonico(e) as Obj;
    const c = compactaSemConferir(canon, fonte);
    // a conferência compara com o que vai de verdade pela rede (JSON), não com o objeto na memória
    if (mesmoJson(descompacta(JSON.parse(JSON.stringify(c)), fonte), JSON.parse(JSON.stringify(canon)))) return c;
    console.warn("compactação do progresso não bateu na volta; vai sem compactar");
  } catch (err) {
    console.warn("compactação do progresso falhou; vai sem compactar", err);
  }
  return e;
}

/** Itens do progresso (tentativas + cartões + marcações do vocabulário), a conta das cópias de segurança no banco. */
export function contaItens(e: unknown): number {
  if (!ehObj(e)) return 0;
  const n = (x: unknown) => (ehObj(x) ? Object.keys(x).length : 0);
  return n(e.tentativas) + n(e.cartoes) + n(ehObj(e.vocab) ? e.vocab.marcas : undefined);
}

// ------------------------------------------------------------------ gzip

/** Compressão (gzip) no navegador. Navegadores sem CompressionStream (Safari < 16.4) mandam só o compacto. */
const temGzip = () => typeof CompressionStream === "function";

async function passaPor(dados: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const saida = new Blob([dados as BlobPart]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(saida).arrayBuffer());
}

function paraBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function deBase64(s: string): Uint8Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

/** Números do progresso para a página do admin (coluna `resumo`): o banco não enxerga dentro do estado comprimido. */
export interface Resumo {
  /** respostas dadas (HSK) ou questões gravadas (HSKK), somando todas as tentativas */
  respostas: number;
  /** tentativas começadas (estudo ou prova) */
  provas: number;
  /** provas terminadas no modo prova (sem as abandonadas) */
  terminadas: number;
  cartoes: number;
}

export function resumoDe(e: unknown): Resumo {
  const r: Resumo = { respostas: 0, provas: 0, terminadas: 0, cartoes: 0 };
  if (!ehObj(e)) return r;
  for (const t of ehObj(e.tentativas) ? Object.values(e.tentativas) : []) {
    if (!ehObj(t)) continue;
    r.provas++;
    if (t.modo === "prova" && t.fim !== undefined && t.abandonada !== true) r.terminadas++;
    const rs = ehObj(t.respostas) ? t.respostas : ehObj(t.gravacoes) ? t.gravacoes : {};
    r.respostas += Object.keys(rs).length;
  }
  r.cartoes = ehObj(e.cartoes) ? Object.keys(e.cartoes).length : 0;
  return r;
}

/** O que vai para as colunas `estado`, `itens` (cópias de segurança) e `resumo` (admin). */
export interface Pacote {
  estado: unknown;
  itens: number;
  resumo: Resumo;
}

/** Só a compactação, sem gzip e com as provas que já estão na memória: síncrono, para a aba que está fechando. */
export function empacotaJa(parte: Parte, e: unknown): Pacote {
  return { estado: compacta(e, fontes.get(parte)?.jaCarregado()), itens: contaItens(e), resumo: resumoDe(e) };
}

/** Estado → compacto → gzip → base64 ({"_z": …}). Sem CompressionStream, fica o compacto (que também é válido). */
export async function empacota(parte: Parte, e: unknown): Promise<Pacote> {
  const f = fontes.get(parte);
  let fonte: Fonte | undefined;
  if (f) {
    try {
      fonte = await f.carrega(provasCitaveis(e));
    } catch {
      // sem as provas (sem rede?): as frases que não estiverem na memória vão inteiras
      fonte = f.jaCarregado();
    }
  }
  const p: Pacote = { estado: compacta(e, fonte), itens: contaItens(e), resumo: resumoDe(e) };
  if (!temGzip()) return p;
  try {
    const json = new TextEncoder().encode(JSON.stringify(p.estado));
    const z = paraBase64(await passaPor(json, new CompressionStream("gzip")));
    // só compensa se ficou menor (estados minúsculos: o cabeçalho do gzip e o base64 comem o ganho)
    return z.length + 10 < json.length ? { ...p, estado: { _z: z } } : p;
  } catch (err) {
    console.warn("não deu para comprimir o progresso; vai só compactado", err);
    return p;
  }
}

/**
 * O que veio da coluna `estado` (comprimido, compacto ou no formato antigo) → estado no formato normal. Carrega antes
 * as provas que os cartões citam; se não der (sem rede), lança erro — quem chamou trata como "nuvem não respondeu".
 */
export async function desempacota(parte: Parte, bruto: unknown): Promise<unknown> {
  let c = bruto;
  if (ehObj(bruto) && ehStr(bruto._z)) {
    if (typeof DecompressionStream !== "function") throw new Error("este navegador não consegue abrir o progresso salvo (atualize o navegador)");
    c = JSON.parse(new TextDecoder().decode(await passaPor(deBase64(bruto._z), new DecompressionStream("gzip"))));
  }
  const provas = provasCitadas(c);
  const f = fontes.get(parte);
  const fonte = provas.length && f ? await f.carrega(provas) : undefined;
  return descompacta(c, fonte);
}
