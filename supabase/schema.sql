-- Banco do site público (Supabase). Rode tudo de uma vez no SQL Editor do projeto (docs/deploy.md, passo 1).
-- Pode rodar de novo sem problema: cada comando confere se a coisa já existe.
--
-- progresso: uma linha por usuário e parte do app (hsk = HSK 1–3, hskk = prova oral), com o estado inteiro em JSON —
-- o mesmo conteúdo de progresso/progresso.json e progresso/hskk.json da versão local.
-- RLS: cada pessoa só lê e grava as próprias linhas (a chave "anon" do site, pública por natureza, não vê nada alheio).
-- versao: o banco soma 1 a cada gravação (gatilho abaixo). O app só grava se a linha ainda estiver na versão que ele
-- viu por último; senão relê, mescla e grava de novo — assim dois aparelhos na mesma conta não se apagam.
-- Apagar uma conta (Authentication → Users → Delete user) apaga junto o progresso e as cópias (on delete cascade).

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

-- Teto por linha: 2 MB de JSON (medido sem compressão, para dados aleatórios não passarem por "comprimidos").
-- O progresso de quem fez todas as provas várias vezes, com milhares de cartões, fica perto de 1–2 MB; o teto existe
-- para uma conta só não conseguir encher o banco do plano grátis (500 MB), que fica só leitura quando lota.
alter table public.progresso drop constraint if exists progresso_tamanho;
alter table public.progresso add constraint progresso_tamanho check (octet_length(estado::text) < 2000000);

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
-- 2 MB por linha, no máximo ~16 MB por conta somando tudo); o app lista e restaura (mesclando) na página Conta.

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

-- itens = tentativas + cartões + marcações do vocabulário (a mesma conta do servidor local)
create or replace function public.progresso_itens(e jsonb) returns integer
language sql immutable set search_path = '' as $$
  select
    (select count(*) from jsonb_object_keys(case when jsonb_typeof(e -> 'tentativas') = 'object' then e -> 'tentativas' else '{}'::jsonb end))::integer
  + (select count(*) from jsonb_object_keys(case when jsonb_typeof(e -> 'cartoes') = 'object' then e -> 'cartoes' else '{}'::jsonb end))::integer
  + (select count(*) from jsonb_object_keys(case when jsonb_typeof(e -> 'vocab' -> 'marcas') = 'object' then e -> 'vocab' -> 'marcas' else '{}'::jsonb end))::integer
$$;

create or replace function public.progresso_protege() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n_antigo integer := public.progresso_itens(old.estado);
  n_novo integer := public.progresso_itens(new.estado);
begin
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
  return new;
end
$$;

drop trigger if exists progresso_protege on public.progresso;
create trigger progresso_protege before update on public.progresso
  for each row execute function public.progresso_protege();
