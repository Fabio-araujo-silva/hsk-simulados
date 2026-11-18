import { useEffect, useRef, useState } from "react";
import { importaBackup as importaHsk, useStatusDisco } from "../armazenamento";
import { importaBackup as importaHskk, useStatusDisco as useStatusHskk } from "../hskk/armazenamento";
import { AindaPendente, confirmaCodigo, erroDoLink, leCopia, listaCopias, pedeLink, sai, useConta, type CopiaNuvem } from "../nuvem";
import { MODO_PUBLICO, TURNSTILE_SITEKEY } from "../publico";
import type { StatusDisco } from "../sincronia";

// Página da conta (só no site público): entrar com o link mágico / código do e-mail, ver o e-mail logado, sair
// e recuperar as cópias de segurança que o banco guarda quando um salvamento encolhe muito o progresso.

const ROTULO: Record<StatusDisco, string> = {
  verificando: "carregando…",
  ok: "✓ salvo na nuvem",
  salvando: "salvando…",
  "sem-servidor": "só neste navegador",
  erro: "⚠ sem conexão com a nuvem (tentando de novo)",
};

/**
 * Sair sem rede apagaria em silêncio o que ainda não subiu. Por isso, se sobrou algo pendente, pergunta antes; se a
 * pessoa sair mesmo assim, o pendente fica guardado neste navegador, preso à conta, e sobe quando ela entrar de novo.
 */
async function saiDaConta() {
  try {
    await sai();
  } catch (e) {
    if (!(e instanceof AindaPendente)) throw e;
    const ok = window.confirm(
      "Há alterações que ainda não subiram para a nuvem (sem conexão?).\n\n" +
        "Se sair agora, elas ficam guardadas só neste navegador e sobem quando você entrar de novo nesta conta aqui.\n\n" +
        "Sair mesmo assim?",
    );
    if (ok) await sai(true);
  }
}

export function PaginaConta() {
  const conta = useConta();
  const hsk = useStatusDisco();
  const hskk = useStatusHskk();

  if (!MODO_PUBLICO)
    return (
      <div className="config conta">
        <h1>Conta</h1>
        <p>
          Esta é a versão local do app: não há contas, o progresso fica em <code>progresso/progresso.json</code> e <code>progresso/hskk.json</code>.
        </p>
      </div>
    );
  if (conta === undefined) return <div className="carregando">carregando…</div>;

  return (
    <div className="config conta">
      <h1>Conta</h1>
      {conta ? (
        <>
          <section>
            <h2>Conectado</h2>
            <p>
              Você entrou como <b>{conta.email}</b>. O seu progresso fica salvo na nuvem e aparece em qualquer navegador em que você entrar com este
              e-mail.
            </p>
            <ul className="lista-status">
              <li>
                HSK 1–3: <span className={`status-disco ${hsk === "ok" ? "ok" : hsk === "erro" ? "erro" : ""}`}>{ROTULO[hsk]}</span>
              </li>
              <li>
                HSKK: <span className={`status-disco ${hskk === "ok" ? "ok" : hskk === "erro" ? "erro" : ""}`}>{ROTULO[hskk]}</span>
              </li>
            </ul>
            <div className="acoes">
              <button className="sec" onClick={() => void saiDaConta()}>
                sair da conta
              </button>
            </div>
            <p>
              <small>Ao sair, o progresso continua na nuvem e some deste navegador (bom para computador compartilhado).</small>
            </p>
            <p>
              <small>
                Para apagar a sua conta e todo o seu progresso, veja a página <a href="#/sobre">Sobre</a>.
              </small>
            </p>
          </section>
          <CopiasNuvem />
        </>
      ) : (
        <Entrar />
      )}
    </div>
  );
}

function Entrar() {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(erroDoLink());
  const robo = useTurnstile();

  const pede = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg("Digite um e-mail válido.");
    if (TURNSTILE_SITEKEY && !robo.token) return setMsg("Espere a verificação anti-robô (o quadro ao lado do e-mail) terminar.");
    setOcupado(true);
    setMsg(null);
    try {
      await pedeLink(email, robo.token ?? undefined);
      setEnviado(true);
    } catch (e) {
      setMsg(`Não deu para enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // cada resposta do Turnstile vale um pedido só: gera outra para o "enviar de novo"
      robo.reinicia();
      setOcupado(false);
    }
  };

  const confirma = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      await confirmaCodigo(email, codigo);
      window.location.hash = "/";
    } catch (e) {
      setMsg(`Não deu para entrar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section>
      <h2>Entrar</h2>
      <p>
        Sem senha: digite o seu e-mail e clique no link que chegar (a conta é criada no primeiro acesso). Sem conta, o progresso fica só neste
        navegador; ao entrar, o que você já fez aqui é juntado ao da conta.
      </p>
      <form
        className="acoes"
        onSubmit={(e) => {
          e.preventDefault();
          void pede();
        }}
      >
        <input className="entrada" type="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {TURNSTILE_SITEKEY && <div className="turnstile" ref={robo.ref} />}
        <button className="pri" type="submit" disabled={ocupado}>
          {enviado ? "enviar de novo" : "enviar link de acesso"}
        </button>
      </form>
      {enviado && (
        <>
          <p className="aviso">
            Enviamos um e-mail para <b>{email.trim()}</b>. Abra-o <b>neste navegador</b> e clique no link. Se o e-mail trouxer um código, dá para
            digitá-lo aqui (útil se você abriu o e-mail no celular):
          </p>
          <form
            className="acoes"
            onSubmit={(e) => {
              e.preventDefault();
              void confirma();
            }}
          >
            <input
              className="entrada"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="código"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
            <button className="pri" type="submit" disabled={ocupado || codigo.length < 6}>
              entrar com o código
            </button>
          </form>
        </>
      )}
      {msg && <p className="aviso">{msg}</p>}
    </section>
  );
}

// ------------------------------------------------------- proteção contra robôs

interface Turnstile {
  render(el: HTMLElement, opcoes: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptTurnstile: Promise<Turnstile> | null = null;
function carregaTurnstile(): Promise<Turnstile> {
  scriptTurnstile ??= new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : falha(new Error("Turnstile não carregou")));
    s.onerror = () => falha(new Error("Turnstile não carregou"));
    document.head.appendChild(s);
  });
  return scriptTurnstile;
}

/**
 * Cloudflare Turnstile (VITE_TURNSTILE_SITEKEY; docs/deploy.md, passo 1.7): o Supabase só manda o e-mail de acesso
 * com a resposta do desafio, então ninguém consegue disparar e-mails em série para endereços quaisquer (o que
 * esgotaria a cota diária de e-mails e travaria o login de todo mundo). Sem a chave, não faz nada.
 */
function useTurnstile() {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITEKEY) return;
    let vivo = true;
    carregaTurnstile()
      .then((t) => {
        if (!vivo || !ref.current) return;
        id.current = t.render(ref.current, {
          sitekey: TURNSTILE_SITEKEY,
          language: "pt-br",
          callback: (tk: string) => setToken(tk),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch((e) => console.error(e));
    return () => {
      vivo = false;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, []);
  return {
    ref,
    token,
    reinicia: () => {
      setToken(null);
      if (id.current) window.turnstile?.reset(id.current);
    },
  };
}

/** Cópias que o banco guardou sozinho (supabase/schema.sql): restaurar MESCLA, como o restaurar backup. */
function CopiasNuvem() {
  const [copias, setCopias] = useState<CopiaNuvem[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    listaCopias()
      .then(setCopias)
      .catch(() => setCopias([]));
  }, []);

  const restaura = async (c: CopiaNuvem) => {
    try {
      const { parte, estado } = await leCopia(c.id);
      const json = JSON.stringify({ ...(estado as object), parte });
      if (parte === "hskk") importaHskk(json);
      else importaHsk(json);
      setMsg(`Cópia de ${new Date(c.criado).toLocaleString("pt-BR")} restaurada (mesclada com o que já existia).`);
    } catch (e) {
      setMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section>
      <h2>Cópias de segurança na nuvem</h2>
      <p>
        <small>
          Quando um salvamento apaga boa parte do progresso (por exemplo, ao formatar), a nuvem guarda antes uma cópia do estado anterior — as 3
          últimas de cada parte.
        </small>
      </p>
      {copias === null ? (
        <small className="carregando">carregando…</small>
      ) : copias.length === 0 ? (
        <p>
          <small>Nenhuma cópia até agora.</small>
        </p>
      ) : (
        <ul className="lista-copias">
          {copias.map((c) => (
            <li key={c.id}>
              {c.parte === "hskk" ? "HSKK" : "HSK 1–3"} · {new Date(c.criado).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
              {c.itens} itens{" "}
              <button className="sec" onClick={() => void restaura(c)}>
                restaurar (mesclar)
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="aviso">{msg}</p>}
    </section>
  );
}
