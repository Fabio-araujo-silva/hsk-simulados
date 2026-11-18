import { useSyncExternalStore } from "react";
import type { AuthError, Session, SupabaseClient } from "virtual:supabase";
import type { Parte } from "./backup";
import { desempacota, empacota, empacotaJa } from "./compacta";
import { MODO_PUBLICO, SUPABASE_ANON_KEY, SUPABASE_URL } from "./publico";

// Contas e progresso na nuvem (Supabase) — só no site público (src/publico.ts).
// Login sem senha: o Supabase manda por e-mail um link mágico (e, se o modelo do e-mail tiver {{ .Token }}, um código
// para digitar — útil quando o e-mail é aberto em outro aparelho). O progresso fica na tabela `progresso`
// (supabase/schema.sql), uma linha por usuário e parte (hsk | hskk); a RLS garante que cada um só lê e grava as suas.
// A biblioteca é carregada sob demanda e entra pelo módulo "virtual:supabase" (vite.config.ts → nuvemDoBuild): no modo
// local ela é trocada por um substituto vazio, então o build local não a leva e o `npm run dev` nem precisa dela instalada.

export interface Conta {
  id: string;
  email: string;
}

let clienteP: Promise<SupabaseClient> | null = null;

function cliente(): Promise<SupabaseClient> {
  if (!MODO_PUBLICO) return Promise.reject(new Error("a nuvem só existe no site público"));
  clienteP ??= import("virtual:supabase").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // PKCE: o link do e-mail volta com ?code=… (não mexe no #/rota do app, que é onde fica a navegação)
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: CHAVE_SESSAO,
      },
    }),
  );
  return clienteP;
}

// ------------------------------------------------------------------ conta atual

let conta: Conta | null = null;
/** token da sessão, guardado à parte para o envio de última hora (keepalive) não depender de nada assíncrono */
let token: string | null = null;
let pronta = !MODO_PUBLICO;
let erroLink: string | null = null;
const ouvintes = new Set<() => void>();
const aoTrocar = new Set<(nova: Conta | null, antes: Conta | null) => void>();
const antesDeSair = new Set<() => Promise<boolean>>();
const avisa = () => ouvintes.forEach((o) => o());

const paraConta = (s: Session | null): Conta | null => (s?.user ? { id: s.user.id, email: s.user.email ?? "" } : null);

const CHAVE_SESSAO = "hsk-simulados:sessao";

/**
 * Conta da sessão guardada neste navegador, sem falar com o Supabase. Serve para quando a sessão não pôde ser
 * renovada ao abrir o site (o token de acesso vale 1 h; no dia seguinte ele precisa ser trocado, e sem internet ou
 * com o Supabase lento a troca falha): a pessoa continua "dentro", com a cópia de trabalho deste navegador, em vez de
 * ver o site como se nunca tivesse entrado. A biblioteca só apaga a sessão guardada quando a renovação é recusada de
 * vez (aí chega um SIGNED_OUT); falha de rede ela mantém e tenta de novo sozinha.
 */
function contaGuardada(): Conta | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) ?? "null") as { user?: { id?: unknown; email?: unknown } } | null;
    return typeof s?.user?.id === "string" ? { id: s.user.id, email: typeof s.user.email === "string" ? s.user.email : "" } : null;
  } catch {
    return null;
  }
}

function defineSessao(s: Session | null) {
  token = s?.access_token ?? null;
  const nova = paraConta(s);
  if (nova?.id === conta?.id) {
    if (nova && nova.email !== conta?.email) conta = nova;
    return;
  }
  const antes = conta;
  conta = nova;
  avisa();
  // fora do callback do Supabase: chamar a API de dentro dele trava a biblioteca (ela espera o próprio callback)
  window.setTimeout(() => {
    aoTrocar.forEach((f) => f(nova, antes));
    void conferePapel();
  }, 0);
}

/** Tira da barra de endereço o ?code=… (ou o erro) que o link do e-mail ou o Google trouxe, mantendo a #/rota. */
function limpaUrl() {
  const u = new URL(window.location.href);
  const desc = u.searchParams.get("error_description");
  if (u.searchParams.get("error") === "access_denied" && !/expired|invalid/.test(desc ?? "")) erroLink = "o login com o Google foi cancelado";
  else if (desc) erroLink = desc.includes("expired") || desc.includes("invalid") ? "o link expirou ou já foi usado — peça outro" : desc;
  if (["code", "error", "error_code", "error_description"].some((k) => u.searchParams.has(k))) {
    window.history.replaceState(null, "", u.pathname + u.hash);
  }
}

let inicio: Promise<Conta | null> | null = null;
const esperaMs = (ms: number) => new Promise<null>((ok) => window.setTimeout(() => ok(null), ms));

/** Conta logada ao abrir o app (troca o ?code= do link mágico pela sessão, se for o caso). Uma vez só. */
export function contaInicial(): Promise<Conta | null> {
  if (!MODO_PUBLICO) return Promise.resolve(null);
  inicio ??= (async () => {
    try {
      const sb = await cliente();
      // Com sessão guardada, não espera a renovação para sempre: sem rede, a biblioteca fica tentando por até ~30 s,
      // e a pessoa veria "Entrar" e o progresso vazio esse tempo todo. Passado o limite, segue com a conta guardada.
      const guardada = contaGuardada();
      const r = await Promise.race([sb.auth.getSession(), ...(guardada ? [esperaMs(4000)] : [])]);
      if (r) {
        conta = paraConta(r.data.session);
        token = r.data.session?.access_token ?? null;
        if (!conta && r.error) {
          // sessão guardada que não deu para renovar agora (sem rede?): segue com ela; a biblioteca tenta de novo
          conta = contaGuardada();
          if (!conta) erroLink = traduz(r.error);
        }
      } else conta = guardada;
      sb.auth.onAuthStateChange((evento, sessao) => {
        // a sessão inicial já foi tratada aqui em cima; sessão nula só conta como saída quando é saída de verdade
        // (SIGNED_OUT: a pessoa saiu ou a renovação foi recusada de vez) — falha de rede não desloga ninguém
        if (evento === "INITIAL_SESSION" || (!sessao && evento !== "SIGNED_OUT")) return;
        defineSessao(sessao);
      });
    } catch (e) {
      console.error("não foi possível falar com o Supabase", e);
      conta = contaGuardada();
    } finally {
      limpaUrl();
      pronta = true;
      avisa();
    }
    void conferePapel();
    return conta;
  })();
  return inicio;
}

/** As stores de progresso avisam aqui quando alguém entra ou sai (para carregar/mesclar a nuvem). */
export function aoTrocarConta(f: (nova: Conta | null, antes: Conta | null) => void) {
  aoTrocar.add(f);
}

/**
 * Tarefas que precisam terminar antes do logout (subir o que ainda não foi para a nuvem). Cada uma responde se ficou
 * tudo na nuvem (true) ou se sobrou algo pendente (false).
 */
export function antesDoLogout(f: () => Promise<boolean>) {
  antesDeSair.add(f);
}

export function useConta() {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => (pronta ? conta : undefined),
  );
}

export const erroDoLink = () => erroLink;
export const contaAtual = () => conta;

function traduz(e: AuthError | Error | { message?: string }): string {
  const m = e.message ?? String(e);
  if (/rate limit|too many|security purposes/i.test(m)) return "muitos pedidos seguidos — espere um minuto e tente de novo";
  if (/captcha/i.test(m)) return "a verificação anti-robô falhou — recarregue a página e tente de novo";
  if (/expired|invalid/i.test(m)) return "código errado ou expirado — confira ou peça outro";
  if (/invalid email|validate email/i.test(m)) return "e-mail inválido";
  return m;
}

/**
 * Manda o link mágico (e o código) para o e-mail. A conta é criada no primeiro acesso.
 * `captchaToken`: resposta do Cloudflare Turnstile, obrigatória quando a proteção contra robôs está ligada no
 * Supabase (docs/deploy.md, passo 1.7) — sem ela, qualquer um dispararia e-mails em série e esgotaria a cota.
 */
export async function pedeLink(email: string, captchaToken?: string) {
  const sb = await cliente();
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    // volta para a raiz do site (sem a #/rota: o ?code= tem de vir antes do #)
    options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: true, captchaToken },
  });
  if (error) throw new Error(traduz(error));
}

/**
 * Entra com o Google: a página vai para o Google e volta para a raiz do site com ?code=… — o mesmo caminho do link
 * mágico (PKCE): contaInicial troca o código pela sessão, limpa a barra de endereço e o progresso deste navegador é
 * mesclado ao da conta. O provedor Google precisa estar ligado no Supabase (docs/deploy.md, passo 1.4).
 */
export async function entraComGoogle() {
  const sb = await cliente();
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw new Error(traduz(error));
}

/** Entra com o código de 6–10 dígitos que veio no e-mail. */
export async function confirmaCodigo(email: string, codigo: string) {
  const sb = await cliente();
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: "email" });
  if (error) throw new Error(traduz(error));
  defineSessao(data.session);
}

/** Sair foi pedido, mas há alterações que não chegaram à nuvem (sem conexão?). */
export class AindaPendente extends Error {
  constructor() {
    super("há alterações que ainda não subiram para a nuvem");
  }
}

/**
 * Sai da conta. Antes, sobe o que estiver pendente — depois do logout não há mais permissão para gravar. Se não der
 * (sem rede), lança AindaPendente e NÃO sai, a menos que `mesmoComPendente`: aí o que não subiu fica guardado neste
 * navegador, preso a esta conta, e é mesclado quando ela entrar de novo aqui (src/sincronia.ts → saiDaNuvem).
 */
export async function sai(mesmoComPendente = false) {
  const tudoNaNuvem = await Promise.all(
    [...antesDeSair].map((f) =>
      f().catch((e) => {
        console.error(e);
        return false;
      }),
    ),
  );
  if (!mesmoComPendente && tudoNaNuvem.includes(false)) throw new AindaPendente();
  const sb = await cliente();
  const { error } = await sb.auth.signOut();
  if (error) await sb.auth.signOut({ scope: "local" });
  defineSessao(null);
}

// ------------------------------------------------------------------ progresso

/** O que está na nuvem para uma parte: o estado e o número da versão da linha (o banco soma 1 a cada gravação). */
export interface Remoto {
  estado: unknown;
  versao: number;
}

/**
 * Só fala com a tabela com uma sessão válida. Sem isso, com o token vencido e a renovação falhando, a biblioteca manda
 * o pedido como anônimo: a RLS devolve "nenhuma linha" e o app acharia que a nuvem está vazia.
 */
async function comSessao(): Promise<{ sb: SupabaseClient; uid: string }> {
  if (!conta) throw new Error("sem login");
  const sb = await cliente();
  // sem rede, a renovação do token fica tentando por até ~30 s (e, depois de falhar, a biblioteca só tenta de novo
  // passado 1 min): não segura o app esperando — dá "sem conexão" e a sincronia tenta de novo depois
  const r = await Promise.race([sb.auth.getSession(), esperaMs(8000)]);
  if (!r) throw new Error("sessão não renovada (sem conexão?)");
  const { data, error } = r;
  if (!data.session || data.session.user.id !== conta.id) {
    // a biblioteca já apagou a sessão (renovação recusada de vez) e o aviso de saída pode ter passado antes de o app
    // escutar: sai agora (o que estiver pendente fica guardado, src/sincronia.ts → saiDaNuvem)
    if (!data.session && !error && !contaGuardada()) defineSessao(null);
    throw new Error("sessão não renovada (sem conexão?)");
  }
  token = data.session.access_token;
  return { sb, uid: conta.id };
}

/**
 * Estado guardado na nuvem para esta parte (null se ainda não há nada), já no formato normal: na nuvem ele fica
 * compactado e comprimido (src/compacta.ts). Lança erro se a nuvem não respondeu ou se não deu para abrir o estado
 * (ex.: sem rede para carregar as provas que os cartões citam) — quem chamou trata como "nuvem fora do ar".
 */
export async function leProgresso(parte: Parte): Promise<Remoto | null> {
  const { sb, uid } = await comSessao();
  const { data, error } = await sb.from("progresso").select("estado,versao").eq("user_id", uid).eq("parte", parte).limit(1);
  if (error) throw new Error(error.message);
  const l = data?.[0] as { estado?: unknown; versao?: number } | undefined;
  return l ? { estado: await desempacota(parte, l.estado ?? null), versao: Number(l.versao ?? 0) } : null;
}

/**
 * Grava o estado SÓ se a linha ainda está na versão que este navegador viu por último (`versaoVista`; null = ainda
 * não existe linha). Devolve a versão nova, ou null se outro aparelho gravou antes — aí quem chamou relê a nuvem,
 * mescla e tenta de novo (src/sincronia.ts). Sem essa conferência, uma aba aberta há horas num aparelho apagaria em
 * silêncio, na primeira resposta, tudo o que foi feito em outro.
 */
export async function gravaProgresso(parte: Parte, estado: unknown, versaoVista: number | null): Promise<number | null> {
  const { sb, uid } = await comSessao();
  // compactado e comprimido; `itens` e `resumo` vão à parte porque o banco não enxerga dentro do estado comprimido
  // (itens: cópias de segurança; resumo: página do admin)
  const { estado: guardado, itens, resumo } = await empacota(parte, estado);
  if (versaoVista === null) {
    const { data, error } = await sb.from("progresso").insert({ user_id: uid, parte, estado: guardado, itens, resumo }).select("versao");
    if (error) {
      if (error.code === "23505") return null; // a linha já existe: outro aparelho criou antes
      throw new Error(error.message);
    }
    return Number((data?.[0] as { versao?: number } | undefined)?.versao ?? 1);
  }
  const { data, error } = await sb
    .from("progresso")
    .update({ estado: guardado, itens, resumo })
    .eq("user_id", uid)
    .eq("parte", parte)
    .eq("versao", versaoVista)
    .select("versao");
  if (error) throw new Error(error.message);
  const l = data?.[0] as { versao?: number } | undefined;
  return l ? Number(l.versao) : null;
}

/**
 * Envio de última hora (aba fechando): fetch com keepalive, que o navegador termina mesmo depois de a página fechar.
 * Com a mesma conferência de versão de gravaProgresso (se outro aparelho gravou antes, não muda nada). O keepalive
 * aceita até 64 KB; acima disso não tenta. Nos dois casos a cópia deste navegador fica marcada como pendente e é
 * mesclada na próxima vez que o site abrir. Aqui não dá para esperar a compressão (assíncrona): vai só compactado.
 */
export function gravaProgressoJa(parte: Parte, estado: unknown, versaoVista: number | null): boolean {
  if (!conta || !token) return false;
  const novo = versaoVista === null;
  const p = empacotaJa(parte, estado);
  const corpo = JSON.stringify(novo ? { user_id: conta.id, parte, ...p } : p);
  if (new TextEncoder().encode(corpo).length > 63_000) return false;
  const filtro = novo ? "" : `?user_id=eq.${encodeURIComponent(conta.id)}&parte=eq.${parte}&versao=eq.${versaoVista}`;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/progresso${filtro}`, {
      method: novo ? "POST" : "PATCH",
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: corpo,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------- cópias de segurança na nuvem

export interface CopiaNuvem {
  id: number;
  parte: Parte;
  itens: number;
  criado: string;
}

/** Cópias que o banco guardou sozinho quando um salvamento encolheu muito o progresso (supabase/schema.sql). */
export async function listaCopias(): Promise<CopiaNuvem[]> {
  if (!conta) return [];
  const sb = await cliente();
  const { data, error } = await sb.from("progresso_copias").select("id,parte,itens,criado").eq("user_id", conta.id).order("criado", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as CopiaNuvem[];
}

export async function leCopia(id: number): Promise<{ parte: Parte; estado: unknown }> {
  const sb = await cliente();
  const { data, error } = await sb.from("progresso_copias").select("parte,estado").eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error("cópia não encontrada");
  const { parte, estado } = data[0] as { parte: Parte; estado: unknown };
  return { parte, estado: await desempacota(parte, estado) };
}

// ------------------------------------------------------- acessos e página do admin
// Quantas vezes cada conta abre o site por dia (tabela acessos, supabase/schema.sql): uma vez ao abrir com login e,
// com a aba aberta, de novo quando ela volta a aparecer depois de 30 min. E se a conta é de admin (página #/admin).

let admin = false;
const ouvintesAdmin = new Set<() => void>();
const MEIA_HORA = 30 * 60 * 1000;
let ultimoAcesso: { uid: string; em: number } | null = null;

function registraAcesso(sb: SupabaseClient, uid: string) {
  if (ultimoAcesso?.uid === uid && Date.now() - ultimoAcesso.em < MEIA_HORA) return;
  ultimoAcesso = { uid, em: Date.now() };
  void sb.rpc("registra_acesso").then(({ error }) => {
    if (error) console.warn("não foi possível registrar o acesso", error.message);
  });
}

/** Ao abrir (ou entrar): registra o acesso do dia e confere se a conta é de admin. */
async function conferePapel() {
  if (!conta) {
    if (admin) {
      admin = false;
      ouvintesAdmin.forEach((o) => o());
    }
    return;
  }
  try {
    const { sb, uid } = await comSessao();
    registraAcesso(sb, uid);
    const { data } = await sb.rpc("eh_admin");
    const eh = conta?.id === uid && data === true;
    if (eh !== admin) {
      admin = eh;
      ouvintesAdmin.forEach((o) => o());
    }
  } catch {
    /* sem rede: tenta de novo quando a aba voltar a aparecer */
  }
}

if (MODO_PUBLICO)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pronta) void conferePapel();
  });

/** A conta logada é de admin? (só no site público; a página #/admin aparece no menu) */
export function useAdmin() {
  return useSyncExternalStore(
    (o) => {
      ouvintesAdmin.add(o);
      return () => ouvintesAdmin.delete(o);
    },
    () => admin,
  );
}

export interface UsuarioAdmin {
  email: string;
  provedor: string;
  criado_em: string;
  ultimo_login: string | null;
  ultimo_acesso: string | null;
  dias_ativos_30d: number;
  acessos_30d: number;
  bytes_hsk: number | null;
  bytes_hskk: number | null;
  respostas: number;
  provas: number;
  terminadas: number;
  cartoes: number;
}

export interface TotaisAdmin {
  usuarios: number;
  ativos_hoje: number;
  ativos_7d: number;
  ativos_30d: number;
  por_dia: { dia: string; novos: number; usuarios: number; acessos: number }[];
  bytes: { progresso: number; progresso_copias: number; acessos: number; banco: number };
}

/** Dados da página do admin (o banco recusa quem não é admin). */
export async function dadosAdmin(): Promise<{ usuarios: UsuarioAdmin[]; totais: TotaisAdmin }> {
  const { sb } = await comSessao();
  const [u, t] = await Promise.all([sb.rpc("admin_usuarios"), sb.rpc("admin_totais")]);
  if (u.error) throw new Error(u.error.message);
  if (t.error) throw new Error(t.error.message);
  return { usuarios: (u.data ?? []) as UsuarioAdmin[], totais: t.data as TotaisAdmin };
}
