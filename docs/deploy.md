# Site público (Vercel + Supabase)

Este passo a passo coloca o app no ar como **site público e gratuito**: qualquer pessoa cria uma conta com o Google ou
só com o e-mail (sem senha) e estuda, com o progresso salvo na nuvem. A versão local (`npm run dev`) continua igual: nada aqui muda o
jeito de usar no seu computador.

## Como fica

| peça | serviço (plano grátis) | o que guarda |
|---|---|---|
| o site (páginas, `conteudo/*.json`, voz sintética de `public/tts`) **e** o áudio original e as figuras das provas | **Vercel** (Hobby: 100 GB de tráfego por mês) | ~560 MB (~550 MB de `audio/`, `img/`, `hskk/audio/`, `hskk/img/`) |
| contas (login com o Google ou por e-mail) e progresso de cada pessoa | **Supabase** (Free: 500 MB de banco) | tabela `progresso`, uma linha por pessoa e parte (HSK / HSKK), poucos KB cada |
| e-mails de login | um SMTP grátis (ex.: **Brevo**) ligado ao Supabase | — |
| *(opcional)* áudio e figuras fora da Vercel | **Cloudflare R2** (Free: 10 GB, tráfego de saída grátis) | os mesmos ~550 MB — só se o tráfego passar de ~100 GB/mês da Vercel Hobby (passo 2) |

O modo público é ligado **no build**, pelas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (configuradas só
na Vercel). Sem elas, o build é o de sempre. `VITE_MIDIA_URL` é opcional: sem ela (ou com `mesmo-site`) o áudio e as
figuras vão junto no site, servidos pela própria Vercel (o build só avisa disso no log). O que muda no site público:

- **Entrar** no cabeçalho → **Entrar com Google** (ou, como segunda opção, e-mail → link mágico ou código) → o progresso
  passa a ser salvo na nuvem (“✓ salvo na nuvem”).
  Sem conta, fica **só neste navegador** (o aviso no cabeçalho convida a entrar). Ao entrar, o que foi feito sem conta é
  **juntado** ao da conta (a mesma mescla do “restaurar backup”).
- Backup (baixar/restaurar) e formatar continuam em ⚙. Se um salvamento apagar boa parte do progresso (formatar, por exemplo),
  o banco guarda antes uma **cópia de segurança** (as 3 últimas de cada parte) — em **Conta → cópias de segurança** dá
  para restaurar.
- **Vários aparelhos na mesma conta**: cada gravação confere se outro aparelho gravou no meio; se gravou, o app relê a
  nuvem, junta as duas coisas e grava de novo (nada é sobrescrito às cegas). A aba que volta a aparecer também relê.
- **Sem internet**: o que não subiu fica guardado no navegador e sobe quando a conexão voltar. Sair da conta nessa hora
  pede confirmação; se sair mesmo assim, o pendente fica neste navegador e sobe quando a mesma conta entrar de novo aqui.
- **Voz sintética**: só toca o que já foi gerado e está em `public/tts`; o que falta mostra um aviso (e usa a voz do
  navegador, se ele tiver voz chinesa). A chave da ElevenLabs nunca vai para o site.
- **HSKK**: gravar funciona (a gravação fica só na aba); a transcrição automática não existe no site — você ouve a sua voz ao
  lado do original e, na parte 1, diz como foi (“faltou um pouco/bastante” manda a frase para a revisão espaçada).

- **Progresso compacto na nuvem**: no disco e no navegador o progresso continua no formato de sempre; para a nuvem ele vai
  compactado e comprimido (`src/compacta.ts`). As frases dos cartões viram uma referência à questão da prova (o app
  confere com uma soma que é a mesma frase), datas viram diferenças, as respostas viram uma string — e o resultado vai
  com gzip. Medido (18/11/2026):

  | progresso | formato normal | gzip do normal | guardado na nuvem |
  |---|---|---|---|
  | real: 1 estudo completo (80 respostas), 35 cartões | 41 KB | 8,8 KB | **4,0 KB** |
  | médio: 10 provas, 150 cartões | 144 KB | 29 KB | **8,0 KB** |
  | pesado: as 48 provas 2× (96 tentativas, 7.200 respostas), 1.500 cartões, 600 marcações do vocabulário | 1,49 MB | 352 KB | **73 KB** (~180 KB se as provas não carregarem na hora de gravar) |

  O banco não enxerga dentro do estado comprimido, então o app manda junto a contagem de itens (para as cópias de
  segurança) e um resumo (para a página do admin). Linhas gravadas por uma versão anterior do app continuam abrindo.

> ⚠ Não ponha as variáveis `VITE_SUPABASE_*` no `.env` desta pasta: o `npm run dev` passaria a funcionar como o site
> público. Elas ficam só na Vercel. As do R2 (`R2_*`, se usar o R2) podem ficar no `.env` — elas só servem para o
> script de envio.

> Os nomes dos menus abaixo são os dos painéis em novembro de 2026. Os painéis mudam de vez em quando: se um nome não
> bater, procure o equivalente (os nomes alternativos mais comuns estão entre parênteses).

---

## Passo 0 · O código no GitHub (e a pasta que você usa)

A Vercel publica o que está no GitHub, não o que está no seu computador.

1. Faça o commit das mudanças do site público e mande para o GitHub (`git push`) na branch que a Vercel vai usar
   (`main`). Os ~550 MB de áudio e figuras já estão no repositório e vão junto para o site (o `.vercelignore` tira
   só o que não serve para o build: `fontes/`, `progresso/`, `data/` e o `.env`).
2. **Na pasta em que você estuda (`hsk3-simulados`)**, depois de puxar estas mudanças, rode `npm install` uma vez,
   com o `npm run dev` parado — o `package.json` ganhou duas bibliotecas (`@supabase/supabase-js` e, para o envio ao R2,
   `@aws-sdk/client-s3`). O modo local não usa a do Supabase (o `vite.config.ts` troca por um substituto vazio), então
   o `npm run dev` abre mesmo antes disso; mas o `npm run build` (que confere os tipos) e o `publica_midia.mjs` precisam.

## Passo 1 · Supabase (contas e progresso)

1. Crie uma conta em <https://supabase.com> e um **New project** (região **South America (São Paulo)**). Guarde a senha
   do banco num lugar seguro (o app não usa, mas o Supabase pede).
2. No projeto, abra **SQL Editor → New query**, cole o conteúdo inteiro de [`supabase/schema.sql`](../supabase/schema.sql)
   e clique em **Run**. Deve aparecer “Success. No rows returned”. (Pode rodar de novo sem problema.)
   Isso cria a tabela `progresso`, as regras de segurança (cada pessoa só vê e grava o próprio progresso), as cópias
   de segurança automáticas, a contagem de acessos por dia e as funções da página do admin.
   **Já rodou uma versão anterior?** Rode de novo: ele acrescenta as colunas `itens` e `resumo`, troca o teto de 2 MB
   pelo de 256 KB (sem barrar linhas antigas maiores — a próxima gravação do app já manda compactado) e cria o resto.
3. **Authentication → Sign In / Providers → Email**: deixe **Enable Email provider** ligado e **Confirm email** ligado.
   **Login com o Google** (o botão principal da tela de entrar):
   - no Google Cloud (<https://console.cloud.google.com>) crie (ou escolha) um projeto → **APIs e serviços → Tela de
     permissão OAuth** (*Google Auth Platform → Branding*): tipo **Externo**, nome do app, e-mail de suporte; em
     *Público-alvo* (*Audience*) clique em **Publicar app** (senão só os e-mails de teste conseguem entrar). Os escopos
     padrão (`email`, `profile`, `openid`) bastam;
   - **Credenciais → Criar credenciais → ID do cliente OAuth** (*Clients → Create client*): tipo **Aplicativo da Web**;
     em **URIs de redirecionamento autorizados** ponha
     `https://vfgnqhggdxkqqdqpowkv.supabase.co/auth/v1/callback` (é o endereço do Supabase, não o do site) e, em
     **Origens JavaScript autorizadas**, o endereço do site (`https://hsk-simulados.vercel.app`). Copie o **Client ID** e o
     **Client Secret**;
   - no Supabase, **Authentication → Sign In / Providers → Google** → **Enable Sign in with Google** → cole o Client ID e
     o Client Secret → **Save**. (O *Callback URL* que o Supabase mostra ali tem de ser o mesmo que você pôs no Google.)
   - O retorno do Google cai na raiz do site com `?code=…` — o mesmo caminho do link mágico, que já está liberado nas
     **Redirect URLs** do item 4. Sem o provedor ligado, o botão leva a uma página de erro do Supabase; o login por
     e-mail continua funcionando.
4. **Authentication → URL Configuration**:
   - **Site URL**: o endereço do site na Vercel (você só vai saber no passo 4 — volte aqui depois), ex.
     `https://hsk-simulados.vercel.app`
   - **Redirect URLs** → *Add URL*: `https://hsk-simulados.vercel.app/**`
5. **Authentication → Emails → Templates**: nos modelos **Confirm signup** e **Magic Link**, acrescente o código, para quem
   abrir o e-mail em outro aparelho (o link só funciona no mesmo navegador em que o e-mail foi pedido):

   ```html
   <h2>Entrar no HSK · simulados reais</h2>
   <p><a href="{{ .ConfirmationURL }}">Clique aqui para entrar</a></p>
   <p>Ou digite este código no site: <b>{{ .Token }}</b></p>
   ```
6. **E-mail de verdade (obrigatório para o público)**: o e-mail embutido do Supabase só manda mensagens para os membros
   da equipe do projeto e tem limite de poucas por hora. Ligue um SMTP grátis:
   - crie conta na **Brevo** (<https://www.brevo.com>, 300 e-mails/dia grátis), confirme o seu e-mail como remetente
     (*Senders*) e gere uma **SMTP key** (*SMTP & API → SMTP*);
   - no Supabase, **Authentication → Emails → SMTP Settings → Enable custom SMTP**: host `smtp-relay.brevo.com`, porta
     `587`, usuário = o login SMTP da Brevo, senha = a SMTP key, remetente = o e-mail confirmado.
   - **Authentication → Rate Limits**: o limite de e-mails por hora vale para o **projeto inteiro**, não por pessoa.
     Comece baixo (ex.: 30 por hora) — mais do que isso só com a proteção do item 7 ligada.
7. **Proteção contra robôs (faça antes de divulgar)**: sem ela, qualquer um pode pedir o link de acesso em série para
   endereços quaisquer — isso manda e-mail não pedido a terceiros, esgota a cota da Brevo (300/dia, e ela pode suspender
   a conta por spam) e trava o login de todo mundo.
   - Na Cloudflare (conta grátis em <https://dash.cloudflare.com>; a mesma do R2, se um dia usar o passo 2),
     **Turnstile → Add widget** (*Add site*): nome `hsk-simulados`, domínio `hsk-simulados.vercel.app` (e `localhost`
     se quiser testar), modo **Managed**. Copie a **Site Key** e a **Secret Key**.
   - No Supabase, **Authentication → Attack Protection** (*Bot and Abuse Protection*) → **Enable Captcha protection** →
     provedor **Turnstile** → cole a **Secret Key**.
   - Na Vercel (passo 4.3), a **Site Key** vai em `VITE_TURNSTILE_SITEKEY`. O app mostra o desafio ao lado do campo de
     e-mail. (Ligar no Supabase sem pôr a Site Key na Vercel faz o login falhar com “verificação anti-robô falhou”.)
8. **Project Settings → API Keys** (*Data API*): copie a **Project URL** (`https://xxxx.supabase.co`) e a chave
   **anon / publishable** (é pública por natureza — quem protege os dados são as regras do passo 2). **Nunca** use a
   `service_role`/secret no site.

> O plano grátis **pausa o projeto depois de 7 dias sem nenhum acesso**. Com gente usando, não pausa; se pausar, é só
> entrar no painel e clicar em *Restore* (os dados ficam).

**Espaço do banco.** O plano grátis tem 500 MB; quando enche, o projeto fica **só leitura** e ninguém mais salva. O
progresso vai compactado (veja a tabela no começo): uma conta normal ocupa **poucos KB** por parte (4 KB com uma prova
e 35 cartões; 73 KB no caso extremo de todas as provas duas vezes e 1.500 cartões). O banco limita cada linha a
**256 KB** e guarda só **3 cópias de segurança** por parte, então uma conta ocupa no máximo ~2 MB somando tudo — e na
prática dezenas de KB: 500 MB dão para dezenas de milhares de contas. A contagem de acessos guarda uma linha por conta e
dia, só dos últimos 180 dias. Veja o uso em **Reports → Database** (ou *Project Settings → Usage*) ou na página
**Admin** (abaixo). Se crescer de um jeito estranho, ache as contas maiores no SQL Editor:

```sql
select u.email, sum(octet_length(p.estado::text)) / 1024 as kb
  from public.progresso p join auth.users u on u.id = p.user_id
 group by u.email order by kb desc limit 20;
```

e apague as abusivas (abaixo). Apagar cópias antigas libera espaço também:
`delete from public.progresso_copias where criado < now() - interval '30 days';`

**Apagar uma conta** (a pessoa pediu, pela LGPD ela tem esse direito; ou é abuso): **Authentication → Users** → na linha
do e-mail, **⋯ → Delete user**. O progresso, as cópias e a contagem de acessos dela são apagados junto
(`on delete cascade`).

**Página do admin (quem está usando e quanto).** Para a sua conta ver a página **Admin** (aparece no menu do site depois
de entrar), rode uma vez no SQL Editor, com o e-mail com que você entra no site:

```sql
insert into public.admins (email) values ('seu@email');
```

Ela mostra o total de contas, as ativas hoje / em 7 / em 30 dias, um gráfico de acessos e contas novas por dia (30 dias),
o espaço usado no banco e uma tabela (ordenável) com cada conta: como entra (Google / e-mail), quando foi criada, último
acesso, dias e acessos nos últimos 30 dias, respostas, provas terminadas/abertas, cartões e o tamanho do progresso. Só os
e-mails da tabela `admins` conseguem esses dados (o banco confere quem pede); ninguém consegue se pôr na tabela pelo
site. Para tirar alguém: `delete from public.admins where email = '...';`. O acesso é contado uma vez a cada abertura do
site com login (e de novo se a aba voltar a aparecer depois de 30 min); a página **Sobre** avisa disso.

## Passo 2 · Cloudflare R2 (opcional: áudio e figuras fora da Vercel)

**Pule este passo no primeiro lançamento.** Sem `VITE_MIDIA_URL`, o áudio original e as figuras (~550 MB) vão junto no
site e a própria Vercel os serve (com cache de 7 dias no navegador, `vercel.json`). O plano Hobby da Vercel inclui
~100 GB de tráfego por mês; um simulado completo baixa uns 10–20 MB de áudio, então isso dá para alguns milhares de
provas por mês. Se o painel da Vercel (**Usage**) mostrar o tráfego chegando perto do limite, mova a mídia para o R2,
que não cobra tráfego de saída:

1. Crie uma conta em <https://dash.cloudflare.com>, abra **R2 Object Storage** e ative (a Cloudflare pede um cartão,
   mas o uso aqui fica dentro do grátis: 10 GB guardados, leituras à vontade para este tamanho, tráfego de saída sem custo).
2. **Create bucket** → nome `hsk-midia` → localização automática.
3. No bucket, **Settings → Public access → R2.dev subdomain** (*Public Development URL*) **→ Allow access**. Copie o endereço
   (`https://pub-xxxxxxxx.r2.dev`) — esse é o `VITE_MIDIA_URL`.
   (O r2.dev tem limite de tráfego e a Cloudflare recomenda um domínio próprio para uso grande: se um dia tiver um domínio,
   use **Custom Domains** e troque o `VITE_MIDIA_URL`.)
4. **Settings → CORS policy → Add CORS policy**:

   ```json
   [
     {
       "AllowedOrigins": ["https://hsk-simulados.vercel.app"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   (Hoje o app toca o áudio e mostra as figuras sem precisar de CORS; a regra deixa pronto para qualquer uso futuro.)
5. Chave para enviar os arquivos: **R2 → Manage API tokens → Create API token** → permissão **Object Read & Write**,
   só no bucket `hsk-midia`. Copie o **Access Key ID**, o **Secret Access Key** e o **Account ID** (aparece na página do R2).
6. No `.env` desta pasta (não vai para o git), acrescente:

   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=hsk-midia
   ```
7. Envie a mídia:

   ```bash
   node scripts/publica_midia.mjs --simular   # mostra o que vai subir (1.250 arquivos, ~549 MB na primeira vez)
   node scripts/publica_midia.mjs             # envia (só o que mudou; rodar de novo não reenvia nada)
   ```

   Sempre que um áudio ou figura mudar (ex.: depois de `enriquece.py`), rode de novo.
8. Confira abrindo no navegador `https://pub-xxxxxxxx.r2.dev/audio/H31001.mp3` — tem de tocar.
9. Na Vercel, crie a variável `VITE_MIDIA_URL` com esse endereço e faça o redeploy (passo 4.6). Para deixar de mandar
   os ~550 MB para a Vercel a cada deploy, volte a listar `public/audio`, `public/img`, `public/hskk/audio` e
   `public/hskk/img` no `.vercelignore` (com `VITE_MIDIA_URL` definida, o build já os deixa fora do `dist/`).

## Passo 3 · Voz sintética (opcional, gasta créditos da ElevenLabs)

No site só toca a voz que já foi gerada. Para saber quanto falta:

```bash
node scripts/gera_tts.mjs --simular
```

Hoje (18/11/2026): **3.666 falas** possíveis (botões 🔊 das questões de leitura/escrita do HSK 1–3 e as palavras do
Vocabulário), **19 já geradas**, **3.647 faltando — 41.920 caracteres ≈ 41.920 créditos** e ~90 MB a mais em `public/tts`.
Para gerar (gasta créditos!): `node scripts/gera_tts.mjs --gerar` (ou aos poucos: `--gerar --limite 300`). Os arquivos
novos em `public/tts/` precisam ir para o git para chegarem à Vercel. Sem gerar, o site funciona do mesmo jeito: nos trechos
sem voz aparece o aviso.

## Passo 4 · Vercel (o site)

1. Crie uma conta em <https://vercel.com> entrando com o GitHub.
2. **Add New → Project → Import** o repositório `hsk-simulados` (pode ser privado). A Vercel lê o `vercel.json`: build
   `npm run build`, saída `dist`, cache e cabeçalhos de segurança (o site não pode ser aberto dentro de outro site, o que
   protege a tela de login contra *clickjacking*). Publique **só pelo GitHub**: o `vercel deploy` da linha de comando
   mandaria os arquivos da pasta (o `.vercelignore` já exclui o `.env` com as chaves, mas não há motivo para arriscar).
3. Antes de clicar em **Deploy**, abra **Environment Variables** e crie, marcando **só _Production_**:

   | nome | valor |
   |---|---|
   | `VITE_SUPABASE_URL` | a Project URL do passo 1.8 |
   | `VITE_SUPABASE_ANON_KEY` | a chave anon / publishable do passo 1.8 |
   | `VITE_MIDIA_URL` | **opcional** — deixe sem (ou `mesmo-site`) no primeiro lançamento: a mídia vai junto no site. Só se usar o R2 (passo 2): o endereço r2.dev do passo 2.3, sem `/` no fim |
   | `VITE_TURNSTILE_SITEKEY` | a Site Key do Turnstile (passo 1.7) |
   | `VITE_CONTATO` | o seu e-mail (ou o link das *issues* do GitHub) — aparece na página **Sobre** para pedidos de retirada de material e de exclusão de conta |

   Por que só *Production*: os deploys de teste (*Preview*, um por branch/PR) gravariam no mesmo banco das pessoas e o
   login falharia neles (a Redirect URL do passo 1.4 é só a do site principal). Sem as variáveis, um Preview sai como a
   versão estática de sempre, sem contas — bom para conferir o visual.
4. **Deploy**. Sem `VITE_MIDIA_URL`, o log do build avisa `[nuvem-do-build] build público sem bucket de mídia` e o site
   publicado tem uns 560 MB (a mídia vai junto). Com o R2, aparece
   `[midia-fora-do-build] public/ copiado sem audio, img, hskk/audio, hskk/img` e o site fica com uns 6 MB.
5. Copie o endereço do site (ex. `https://hsk-simulados.vercel.app`) e volte ao **passo 1.4** (Site URL e Redirect URLs),
   ao **passo 1.3** (Origens JavaScript autorizadas do Google), ao **passo 1.7** (domínio do Turnstile) e, se usar o R2,
   ao **passo 2.4** (CORS) para colocar esse endereço.
6. Mudou uma variável? **Deployments → ⋯ → Redeploy** (as variáveis `VITE_` entram no build).

A cada `git push` a Vercel publica de novo sozinha.

## Passo 5 · Testar

1. Abra o site numa janela anônima: o cabeçalho mostra **só neste navegador · entre para salvar na nuvem**.
2. Abra o HSK 3 → uma prova → modo estudo: o áudio toca (do próprio site, ou do R2 se usar) e as figuras aparecem.
3. Responda uma questão, clique em **Entrar** → **Entrar com Google** e escolha a conta. Volta para o site já logado.
   O cabeçalho passa a **✓ salvo na nuvem** e a questão respondida continua lá. Teste também o e-mail, numa janela
   anônima: digite o e-mail (o desafio anti-robô aparece ao lado), abra o e-mail e clique no link (ou digite o código).
4. No Supabase, **Table Editor → progresso**: aparece uma linha com o seu `user_id`, `parte = hsk`, o `estado` como
   `{"_z": "…"}` (comprimido) e as colunas `itens` e `resumo` preenchidas.
5. Abra o site em outro navegador/celular, entre com o mesmo e-mail: o progresso aparece.
6. Numa questão de leitura, 🔊: as falas já geradas tocam; as outras mostram o aviso.
7. HSKK → estudo → grave a parte 1: aparece a gravação, o aviso de que a transcrição só existe na versão local e os botões
   de autoavaliação.
8. Rodapé → **Sobre**: a nota de direitos autorais, a origem de cada prova e o seu contato (`VITE_CONTATO`).
9. Depois de se pôr na tabela `admins` (passo 1): recarregue o site — aparece **Admin** no menu, com você na tabela.

## Direitos autorais (leia antes de divulgar)

As provas (cadernos, gabaritos e áudios) são material do **Hanban / Chinese Testing International (CTI, 汉考国际)** — os
direitos são deles, e **publicar sem autorização tem risco**. Manter o site gratuito, não comercial e citando a origem
**diminui** esse risco, mas não o elimina: não é uma licença. Para manter o risco baixo:

- não cobre acesso, não ponha anúncios nem peça doações em troca do material;
- mantenha a página **Sobre** (rodapé), que diz de quem são os direitos, lista a origem de cada prova (campo `origem` de
  `conteudo/provas/index.json`) e dá o seu contato para pedidos de retirada — **preencha `VITE_CONTATO`** (passo 4.3);
- se o detentor dos direitos pedir, tire o material do ar logo (apagar a prova de `public/conteudo` e a mídia dela, ou
  pausar o projeto na Vercel);
- o glossário vem do **CC-CEDICT**, licença **CC BY-SA 4.0**: a atribuição está na página Sobre e o material derivado
  dele segue a mesma licença.

O plano Hobby da Vercel também é só para uso pessoal e não comercial, o que combina com isso.

**Privacidade.** O site guarda o e-mail, o progresso de cada pessoa e quantas vezes por dia cada conta abre o site (só a
contagem, 180 dias); Supabase, Vercel, Cloudflare, o Google (no login por ele) e a Brevo registram dados técnicos (IP,
navegador) nos próprios logs — a página Sobre avisa isso. Quem pedir para apagar a conta (pelo
contato da página Sobre) tem esse direito pela LGPD: veja “Apagar uma conta” no passo 1.

## Variáveis, resumo

| variável | onde | para quê |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel | liga o modo público (contas + nuvem) |
| `VITE_MIDIA_URL` | Vercel (opcional) | áudio e figuras do R2; também tira essas pastas do `dist/`. Sem ela (ou `mesmo-site`), vão no próprio site |
| `VITE_TURNSTILE_SITEKEY` | Vercel | desafio anti-robô no pedido do link de acesso |
| `VITE_CONTATO` | Vercel | contato na página Sobre (retirada de material, exclusão de conta) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | `.env` local | `scripts/publica_midia.mjs` (só se usar o R2) |
| `ELEVENLABS_API_KEY` | `.env` local | versão local (voz e Scribe) e `scripts/gera_tts.mjs --gerar` |

## Onde fica cada coisa no código

```
src/publico.ts          lê as variáveis VITE_ e decide o modo (local × público)
src/nuvem.ts            Supabase: login (Google / link mágico / código), leitura e gravação do progresso, cópias de
                        segurança, acessos por dia e dados da página do admin
src/compacta.ts         formato compacto do progresso na nuvem (referência às frases das provas, gzip + base64)
src/fonteNuvem.ts       de onde o formato compacto tira as frases (provas e léxico de public/conteudo)
src/sincronia.ts        destino do progresso (disco do servidor local, nuvem ou navegador) — usado pelo HSK e pelo HSKK
src/dados.ts            urlMidia(): áudio e figuras do bucket (VITE_MIDIA_URL) ou de public/
src/tts.ts              voz sintética: no público, só o cache public/tts (mesmo hash do servidor)
src/paginas/Conta.tsx   entrar, sair, cópias de segurança      src/paginas/Sobre.tsx   origem, direitos e privacidade
src/paginas/Admin.tsx   página do admin (#/admin)
vite.config.ts          midiaForaDoBuild: tira as pastas de mídia do dist/ quando há um bucket (VITE_MIDIA_URL);
                        nuvemDoBuild: a biblioteca do Supabase só entra no build público
supabase/schema.sql     tabela, RLS, versão da linha (vários aparelhos), teto de tamanho, gatilho das cópias,
                        acessos por dia e funções do admin
scripts/publica_midia.mjs   envio da mídia ao R2 (só o que mudou)
scripts/gera_tts.mjs        inventário (e geração) da voz sintética
vercel.json             build, cache (assets com hash: 1 ano; áudio, figuras e voz: 7 dias; conteudo/*.json: sem
                        cache) e cabeçalhos de segurança
```
