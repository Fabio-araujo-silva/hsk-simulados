import { useEffect, useMemo, useState } from "react";
import { dadosAdmin, useAdmin, useConta, type TotaisAdmin, type UsuarioAdmin } from "../nuvem";
import { MODO_PUBLICO } from "../publico";

// Página do admin (#/admin, só no site público e só para os e-mails da tabela admins — supabase/schema.sql): quem está
// usando e quanto. Os números vêm das funções admin_usuarios() e admin_totais(), que o banco recusa a quem não é admin.

const kb = (b: number | null | undefined) => (b == null ? "—" : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const data = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("pt-BR") : "—");

type Coluna = { chave: keyof UsuarioAdmin | "bytes"; rotulo: string; num?: boolean; mostra?: (u: UsuarioAdmin) => string };

const COLUNAS: Coluna[] = [
  { chave: "email", rotulo: "e-mail" },
  { chave: "provedor", rotulo: "entra com" },
  { chave: "criado_em", rotulo: "criada", mostra: (u) => data(u.criado_em) },
  { chave: "ultimo_acesso", rotulo: "último acesso", mostra: (u) => data(u.ultimo_acesso) },
  { chave: "dias_ativos_30d", rotulo: "dias (30 d)", num: true },
  { chave: "acessos_30d", rotulo: "acessos (30 d)", num: true },
  { chave: "respostas", rotulo: "respostas", num: true },
  { chave: "provas", rotulo: "terminadas/abertas", num: true, mostra: (u) => `${u.terminadas}/${u.provas}` },
  { chave: "cartoes", rotulo: "cartões", num: true },
  { chave: "bytes", rotulo: "progresso", num: true, mostra: (u) => kb((u.bytes_hsk ?? 0) + (u.bytes_hskk ?? 0)) },
];

const valor = (u: UsuarioAdmin, c: Coluna) => (c.chave === "bytes" ? (u.bytes_hsk ?? 0) + (u.bytes_hskk ?? 0) : u[c.chave]);

export function PaginaAdmin() {
  const conta = useConta();
  const admin = useAdmin();
  const [dados, setDados] = useState<{ usuarios: UsuarioAdmin[]; totais: TotaisAdmin } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ col: number; desc: boolean }>({ col: 5, desc: true });

  useEffect(() => {
    if (!MODO_PUBLICO || !conta) return;
    dadosAdmin()
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [conta]);

  const usuarios = useMemo(() => {
    if (!dados) return [];
    const c = COLUNAS[ordem.col];
    return [...dados.usuarios].sort((a, b) => {
      const x = valor(a, c) ?? "";
      const y = valor(b, c) ?? "";
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return ordem.desc ? -r : r;
    });
  }, [dados, ordem]);

  if (!MODO_PUBLICO || conta === null || (conta && !admin && erro))
    return (
      <div className="vazio">
        <h1>Página não encontrada</h1>
        <a className="botao pri" href="#/">
          voltar ao início
        </a>
      </div>
    );
  if (erro) return <p className="aviso">Não deu para carregar: {erro}</p>;
  if (!dados) return <div className="carregando">carregando…</div>;

  const t = dados.totais;
  const dias = t.por_dia ?? [];
  const maxBarra = Math.max(1, ...dias.map((d) => Math.max(d.acessos, d.novos)));

  return (
    <div className="admin">
      <h1>Admin</h1>
      <div className="admin-totais">
        <div>
          <b>{t.usuarios}</b>contas
        </div>
        <div>
          <b>{t.ativos_hoje}</b>ativas hoje
        </div>
        <div>
          <b>{t.ativos_7d}</b>ativas em 7 dias
        </div>
        <div>
          <b>{t.ativos_30d}</b>ativas em 30 dias
        </div>
        <div title={`progresso ${kb(t.bytes.progresso)} · cópias ${kb(t.bytes.progresso_copias)} · acessos ${kb(t.bytes.acessos)}`}>
          <b>{kb(t.bytes.banco)}</b>banco (de 500 MB)
        </div>
      </div>

      <section>
        <h2>Últimos 30 dias</h2>
        <div className="admin-grafico" role="img" aria-label="acessos e contas novas por dia nos últimos 30 dias">
          {dias.map((d) => (
            <div key={d.dia} className="admin-dia" title={`${data(d.dia)}: ${d.acessos} acessos de ${d.usuarios} contas · ${d.novos} novas`}>
              <span className="barra acessos" style={{ height: `${(d.acessos / maxBarra) * 100}%` }} />
              <span className="barra novos" style={{ height: `${(d.novos / maxBarra) * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="admin-legenda">
          <span className="ponto acessos" /> acessos por dia <span className="ponto novos" /> contas novas por dia
          {dias.length > 0 && (
            <small>
              {" "}
              · {data(dias[0].dia)} a {data(dias[dias.length - 1].dia)}
            </small>
          )}
        </p>
      </section>

      <section>
        <h2>Contas ({usuarios.length})</h2>
        <div className="admin-tabela">
          <table>
            <thead>
              <tr>
                {COLUNAS.map((c, i) => (
                  <th key={c.chave} className={c.num ? "num" : ""}>
                    <button className="link" onClick={() => setOrdem((o) => ({ col: i, desc: o.col === i ? !o.desc : !!c.num }))}>
                      {c.rotulo}
                      {ordem.col === i ? (ordem.desc ? " ▼" : " ▲") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.email}>
                  {COLUNAS.map((c) => (
                    <td key={c.chave} className={c.num ? "num" : ""}>
                      {c.mostra ? c.mostra(u) : String(valor(u, c) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
