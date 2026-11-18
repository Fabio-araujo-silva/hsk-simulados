-- Banco do site público (Supabase). Rode tudo de uma vez no SQL Editor do projeto (docs/deploy.md, passo 1).
-- Pode rodar de novo sem problema: cada comando confere se a coisa já existe.
--
-- progresso: uma linha por usuário e parte do app (hsk = HSK 1–3, hskk = prova oral). O estado é o mesmo conteúdo de
-- progresso/progresso.json e progresso/hskk.json da versão local, mas COMPACTADO e comprimido pelo app
-- (src/compacta.ts): {"_z": "<gzip em base64>"} — ou {"_c": 1, …} (compacto sem gzip) — e alguns KB por pessoa.
-- Linhas gravadas por uma versão anterior do app (estado no formato normal) continuam valendo: o app lê os dois.
-- Como o banco não enxerga dentro do estado comprimido, o app manda junto:
--   itens:  tentativas + cartões + marcações do vocabulário (para as cópias de segurança, abaixo);
--   resumo: {respostas, provas, terminadas, cartoes} (para a página do admin, no fim deste arquivo).
-- RLS: cada pessoa só lê e grava as próprias linhas (a chave "anon" do site, pública por natureza, não vê nada alheio).
-- versao: o banco soma 1 a cada gravação (gatilho abaixo). O app só grava se a linha ainda estiver na versão que ele
-- viu por último; senão relê, mescla e grava de novo — assim dois aparelhos na mesma conta não se apagam.
-- Apagar uma conta (Authentication → Users → Delete user) apaga junto o progresso, as cópias e os acessos (cascade).

create table if not exists public.progresso (
  user_id uuid not null references auth.users (id) on delete cascade,
  parte text not null check (parte in ('hsk', 'hskk')),
  estado jsonb not null,
  versao bigint not null default 1,
  atualizado timestamptz not null default now(),
  primary key (user_id, parte)
);
-- quem rodou uma versão anterior deste arquivo: acrescenta o que faltar
alter table public.progresso add column if not exists versao bigint not null default 1;
alter table public.progresso add column if not exists itens integer;
alter table public.progresso add column if not exists resumo jsonb;

-- Teto por linha: 256 KB de estado (como texto). Compactado, o progresso real fica em poucos KB: ~4 KB com uma prova
-- feita e 35 cartões, ~70 KB para quem fez as 48 provas duas vezes com 1.500 cartões; mesmo sem compactar as frases
-- (sem rede para carregar as provas na hora de gravar) esse caso extremo fica em ~180 KB. O teto existe para uma conta
-- só não conseguir encher o banco do plano grátis (500 MB), que fica só leitura quando lota.
-- "not valid": linhas antigas maiores (de antes da compactação) não impedem rodar este arquivo; a regra vale para
-- toda gravação nova, e a próxima gravação do app já manda o estado compactado.
alter table public.progresso drop constraint if exists progresso_tamanho;
alter table public.progresso add constraint progresso_tamanho check (octet_length(estado::text) < 262144) not valid;
alter table public.progresso drop constraint if exists progresso_resumo_tamanho;
alter table public.progresso add constraint progresso_resumo_tamanho check (resumo is null or octet_length(resumo::text) < 1024) not valid;

alter table public.progresso enable row level security;

drop policy if exists "progresso: ler o proprio" on public.progresso;
create policy "progresso: ler o proprio" on public.progresso
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "progresso: criar o proprio" on public.progresso;
create policy "progresso: criar o proprio" on public.progresso
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "progresso: alterar o proprio" on public.progresso;
create policy "progresso: alterar o proprio" on public.progresso
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "progresso: apagar o proprio" on public.progresso;
create policy "progresso: apagar o proprio" on public.progresso
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.progresso from anon;
grant select, insert, update, delete on public.progresso to authenticated;

-- ------------------------------------------------------------------------------------------------
-- Proteção contra encolher muito (a mesma regra do servidor local, vite.config.ts → progresso/backups/antes-*.json):
-- se um salvamento deixa o progresso com menos de 60% dos itens (ou vazio, como ao formatar), o estado anterior
-- é copiado para progresso_copias antes de ser sobrescrito. Ficam as 3 últimas cópias de cada parte (com o teto de
-- 256 KB por linha, no máximo ~2 MB por conta somando tudo; na prática, dezenas de KB); o app lista e restaura
-- (mesclando) na página Conta.

create table if not exists public.progresso_copias (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  parte text not null,
  estado jsonb not null,
  itens integer not null,
  criado timestamptz not null default now()
);
create index if not exists progresso_copias_usuario on public.progresso_copias (user_id, parte, criado desc);

alter table public.progresso_copias enable row level security;
drop policy if exists "copias: ler as proprias" on public.progresso_copias;
create policy "copias: ler as proprias" on public.progresso_copias
  for select to authenticated using ((select auth.uid()) = user_id);
-- sem política de escrita: só o gatilho abaixo (security definer) grava aqui
revoke all on public.progresso_copias from anon;
grant select on public.progresso_copias to authenticated;

-- itens de um estado no formato normal = tentativas + cartões + marcações do vocabulário (a conta do servidor local)
create or replace function public.progresso_itens(e jsonb) returns integer
language sql immutable set search_path = '' as $$
  select
    (select count(*) from jsonb_object_keys(case when jsonb_typeof(e -> 'tentativas') = 'object' then e -> 'tentativas' else '{}'::jsonb end))::integer
  + (select count(*) from jsonb_object_keys(case when jsonb_typeof(e -> 'cartoes') = 'object' then e -> 'cartoes' else '{}'::jsonb end))::integer
  + (select count(*) from jsonb_object_keys(case when jsonb_typeof(e -> 'vocab' -> 'marcas') = 'object' then e -> 'vocab' -> 'marcas' else '{}'::jsonb end))::integer
$$;

-- estado compacto/comprimido (o banco não enxerga dentro): vale a coluna itens que o app mandou; formato normal
-- (versão anterior do app, que não manda a coluna): conta no próprio estado
create or replace function public.progresso_conta(e jsonb, itens integer) returns integer
language sql immutable set search_path = '' as $$
  select case when e ? '_z' or e ? '_c' then coalesce(itens, 0) else public.progresso_itens(e) end
$$;

create or replace function public.progresso_protege() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n_antigo integer;
  n_novo integer := public.progresso_conta(new.estado, new.itens);
begin
  new.itens := n_novo;
  if tg_op = 'UPDATE' then
    n_antigo := public.progresso_conta(old.estado, old.itens);
    if n_antigo > 0 and n_novo < n_antigo and (n_novo = 0 or n_novo < n_antigo * 0.6) then
      insert into public.progresso_copias (user_id, parte, estado, itens) values (old.user_id, old.parte, old.estado, n_antigo);
      delete from public.progresso_copias
       where id in (
         select id from public.progresso_copias
          where user_id = old.user_id and parte = old.parte
          order by criado desc, id desc offset 3
       );
    end if;
    new.versao := old.versao + 1;
    new.atualizado := now();
  end if;
  return new;
end
$$;

drop trigger if exists progresso_protege on public.progresso;
create trigger progresso_protege before insert or update on public.progresso
  for each row execute function public.progresso_protege();

-- ------------------------------------------------------------------------------------------------
-- Admin: quem está usando e quanto (página #/admin do site, só para os e-mails da tabela admins).
-- Para se tornar admin, rode no SQL Editor: insert into public.admins (email) values ('seu@email');
-- acessos: quantas vezes cada conta abriu o site em cada dia (horário de Brasília). O app chama registra_acesso()
-- ao abrir com login (no máximo uma vez a cada 30 min por aba). Só os últimos 180 dias ficam guardados.
-- Nada disso é visível pelo cliente direto: só pelas funções abaixo (security definer), que conferem quem chama.

create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- sem políticas: ninguém lê nem grava pelo site (só o SQL Editor, que entra como dono do banco)
revoke all on public.admins from anon, authenticated;

create table if not exists public.acessos (
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null,
  vezes integer not null default 1,
  primary key (user_id, dia)
);
alter table public.acessos enable row level security;
revoke all on public.acessos from anon, authenticated;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email'))
$$;

create or replace function public.registra_acesso() returns void
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if eu is null then
    return;
  end if;
  insert into public.acessos (user_id, dia, vezes) values (eu, hoje, 1)
    on conflict (user_id, dia) do update set vezes = public.acessos.vezes + 1;
  delete from public.acessos where user_id = eu and dia < hoje - 180;
end
$$;

-- uma linha por conta: e-mail, como entra, datas, uso nos últimos 30 dias, tamanho do progresso e o resumo dele
create or replace function public.admin_usuarios()
returns table (
  email text,
  provedor text,
  criado_em timestamptz,
  ultimo_login timestamptz,
  ultimo_acesso date,
  dias_ativos_30d integer,
  acessos_30d integer,
  bytes_hsk integer,
  bytes_hskk integer,
  respostas integer,
  provas integer,
  terminadas integer,
  cartoes integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.eh_admin() then
    raise exception 'só para admin' using errcode = '42501';
  end if;
  return query
  select
    u.email::text,
    coalesce(u.raw_app_meta_data ->> 'provider', 'email')::text,
    u.created_at,
    u.last_sign_in_at,
    (select max(a.dia) from public.acessos a where a.user_id = u.id),
    (select count(*)::integer from public.acessos a where a.user_id = u.id and a.dia > hoje - 30),
    (select coalesce(sum(a.vezes), 0)::integer from public.acessos a where a.user_id = u.id and a.dia > hoje - 30),
    (select octet_length(p.estado::text) from public.progresso p where p.user_id = u.id and p.parte = 'hsk'),
    (select octet_length(p.estado::text) from public.progresso p where p.user_id = u.id and p.parte = 'hskk'),
    (select coalesce(sum((p.resumo ->> 'respostas')::integer), 0)::integer from public.progresso p where p.user_id = u.id),
    (select coalesce(sum((p.resumo ->> 'provas')::integer), 0)::integer from public.progresso p where p.user_id = u.id),
    (select coalesce(sum((p.resumo ->> 'terminadas')::integer), 0)::integer from public.progresso p where p.user_id = u.id),
    (select coalesce(sum((p.resumo ->> 'cartoes')::integer), 0)::integer from public.progresso p where p.user_id = u.id)
  from auth.users u
  order by u.created_at desc;
end
$$;

-- números gerais: contas, ativos, novos e acessos por dia (30 dias) e o espaço que as tabelas ocupam
create or replace function public.admin_totais() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.eh_admin() then
    raise exception 'só para admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from auth.users),
    'ativos_hoje', (select count(distinct a.user_id) from public.acessos a where a.dia = hoje),
    'ativos_7d', (select count(distinct a.user_id) from public.acessos a where a.dia > hoje - 7),
    'ativos_30d', (select count(distinct a.user_id) from public.acessos a where a.dia > hoje - 30),
    'por_dia', (
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'novos', (select count(*) from auth.users u where (u.created_at at time zone 'America/Sao_Paulo')::date = d.dia),
        'usuarios', (select count(*) from public.acessos a where a.dia = d.dia),
        'acessos', (select coalesce(sum(a.vezes), 0) from public.acessos a where a.dia = d.dia)
      ) order by d.dia)
      from (select (hoje - g)::date as dia from generate_series(29, 0, -1) g) d
    ),
    'bytes', jsonb_build_object(
      'progresso', pg_total_relation_size('public.progresso'),
      'progresso_copias', pg_total_relation_size('public.progresso_copias'),
      'acessos', pg_total_relation_size('public.acessos'),
      'banco', pg_database_size(current_database())
    )
  );
end
$$;

-- as funções do admin e o registro de acesso: só para quem entrou (o "anon" do site não chama nenhuma)
revoke execute on function public.eh_admin(), public.registra_acesso(), public.admin_usuarios(), public.admin_totais() from public, anon;
grant execute on function public.eh_admin(), public.registra_acesso(), public.admin_usuarios(), public.admin_totais() to authenticated;
-- as auxiliares do gatilho não são para chamar de fora
revoke execute on function public.progresso_itens(jsonb), public.progresso_conta(jsonb, integer), public.progresso_protege() from public, anon, authenticated;
