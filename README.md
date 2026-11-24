# HSK · simulados reais

Plataforma de estudo para o **HSK 1, 2 e 3 (formato HSK 2.0)** e o **HSKK 中级 (prova oral)**, feita **só com provas
oficiais já aplicadas**: caderno, gabarito e áudio originais. Tem modo prova cronometrado, modo estudo com áudio
sincronizado palavra por palavra, tradução por hover, revisão espaçada (FSRS) e uma aba de vocabulário.

| Nível | Provas | Questões | Áudio original | Texto do áudio |
|---|---|---|---|---|
| **HSK 1** | 24 | 960 | ~6 h | 11 oficiais · 13 transcritas do áudio |
| **HSK 2** | 2 | 120 | ~1 h | oficiais |
| **HSK 3** | 22 | 1.760 | ~13 h | 8 oficiais · 14 transcritas do áudio |
| **HSKK 中级** | 6 | 84 | ~2 h | ver [docs/hskk.md](docs/hskk.md) |

> Texto do áudio alinhado a 98,7–100 % dos caracteres · todas as frases traduzidas para o português · explicação
> para cada questão · glossário de 1.473 palavras · 602 palavras na aba Vocabulário (HSK 1–3).

---

## Como usar

```bash
npm install
npm run dev          # abre em http://localhost:5180
```

A primeira tela é a **escolha de nível** (HSK 1, 2, 3 ou HSKK). Cada nível mostra as regras do exame e as provas.

Use sempre pelo `npm run dev`: é o servidor local que grava o seu progresso em disco (ver abaixo).
`npm run build` gera um site estático em `dist/` (nesse caso o progresso fica só no navegador).

### Site público
O mesmo app pode ir ao ar como site gratuito (Vercel + Supabase + Cloudflare R2): cada pessoa entra só com o e-mail e o
progresso fica salvo na nuvem; áudio e figuras vêm de um bucket, a voz sintética só do que já foi gerado e o HSKK grava sem
transcrição automática. É ligado no build por variáveis `VITE_` — sem elas, nada muda aqui. Passo a passo, custos e a
nota de direitos autorais: **[docs/deploy.md](docs/deploy.md)**. Numa cópia que já existia, depois de puxar estas
mudanças rode `npm install` uma vez (com o `npm run dev` parado): o `package.json` ganhou o `@supabase/supabase-js` e o
`@aws-sdk/client-s3`.

### Modo prova
Igual ao dia do exame: o listening toca do começo ao fim **sem pausa** (cada item é lido duas vezes), depois o tempo
para passar as respostas para a folha e o tempo da leitura (e da escrita, no HSK 3), sem tradução.

| | Listening | Leitura | Escrita | Nota |
|---|---|---|---|---|
| HSK 1 | 20 questões (~15 min) | 20 · 17 min | — | total 200, aprovação 120 |
| HSK 2 | 35 questões (~25 min) | 25 · 22 min | — | total 200, aprovação 120 |
| HSK 3 | 40 questões (~35 min) | 30 · 30 min | 10 · 15 min | total 300, aprovação 180 |

No HSK 1 e 2 o caderno real traz pinyin sobre os caracteres, e o app também (dá para esconder no HSK 1).
No fim: nota por seção (cada uma vale 100), aproveitamento por tipo de questão,
revisão das erradas e o botão para mandar todas as erradas para a revisão espaçada.
Se você fechar a aba no meio, a prova continua de onde parou.

### Modo estudo
Questão a questão, com correção imediata e **explicação em português** de por que a resposta oficial é a certa
(o trecho que justifica fica destacado).

- **Correção por blocos**: questões que dividem as mesmas alternativas (ex.: 1–5, 41–45) só são corrigidas quando o
  bloco inteiro estiver respondido. Assim a resposta de uma não entrega a da outra. Dá para desligar em ⚙.
- **Nota do estudo**: cada prova mostra uma nota estimada (≈ x/300 no HSK 3, x/200 no HSK 1 e 2), calculada a partir
  do aproveitamento nas questões que você já fez.

- **Áudio original** de cada questão: 1ª leitura, 2ª leitura, velocidade de 0,6× a 1,15×.
- **Transcrição sincronizada**: a palavra falada acende enquanto toca e **clicar numa palavra pula o áudio para ela**.
- **Modo tradução** (`T`): passe o mouse numa palavra → pinyin, tradução e nível HSK; embaixo, a frase inteira
  traduzida. Selecionar um trecho mostra todas as palavras dele. Desliga quando quiser.
- **Pinyin** sobre os caracteres (`P`), com tons de 一/不 e 儿化 como nos livros.
- **Áudio completo + texto** rolando junto (bom para shadowing).
- **Voz sintética** (ElevenLabs), com velocidade de 0,5× a 1×, nas questões que não têm áudio original (leitura e escrita): 🔊 lê o enunciado e
  cada alternativa. Cada trecho é gerado **uma única vez** e fica salvo em `public/tts/` — depois toca na hora,
  sem gastar créditos. Também funciona na correção das provas. Sem chave, usa a voz chinesa do navegador.
- **Rascunho**: **botão direito** numa alternativa (ou figura) risca/desrisca — para ir eliminando opções,
  inclusive no modo prova.
- Atalhos: `←`/`→` navegar · `A`–`F` responder · `V`/`F` certo/errado · `espaço` tocar · `Enter` próxima.

### Vocabulário
A aba **Vocabulário** tem as 602 palavras do HSK 1 a 3 em cartões (汉字 → pinyin → significado), com filtro por nível,
busca, embaralhar, pinyin sempre visível, marcação de acerto/erro (✓/✗) e voz. As marcações ficam no mesmo progresso.

### Quick Listen 🔥
Treino rápido de ouvido (`#/quick`, no menu e na escolha de nível). Cada rodada sorteia **5 áudios** de listening das
provas reais (qualquer prova, ou só do HSK 1, 2 ou 3) e mostra o texto em hanzi com **3 palavras faltando**, para
**digitar** — vale o hanzi ou o pinyin, com ou sem tom (`ni3` também). Dá para ouvir quantas vezes quiser; com tempo, são
**30 s por áudio**, contados a partir do fim da 1ª escuta (ou jogue sem tempo). Enquanto o áudio toca, um dragão chinês
voa atrás da pérola no ritmo do trecho, e a palavra falada acende no texto (a lacuna pisca na vez dela).

- **Pontos**: 100 por palavra certa; acertou as 3, +2 por segundo que sobrou; áudios perfeitos seguidos fazem combo 🔥
  (+50, +100…). No fim: recorde (por nível e tempo), sequência de dias, a correção de cada áudio com pinyin e tradução,
  e um botão que manda as palavras que escaparam para a revisão espaçada (com a frase e o áudio da prova).
- **Lacunas**: só palavras do glossário, nunca partículas (的, 了, 吗…) nem a pergunta lida (问), nunca uma palavra que
  aparece de novo no texto; pronomes e palavras muito curtas só quando faltam outras. Textos com menos de 7 palavras
  ficam de fora (≈ 1.150 questões servem). As questões das últimas 30 rodadas não se repetem.
- Lógica em `src/quick/sorteio.ts` (sorteio, lacunas, conferência, pontos) e `src/quick/historico.ts`; tela em
  `src/paginas/QuickListen.tsx`; dragão em `src/quick/Dragao.tsx`. As rodadas ficam no mesmo progresso (`quick.sessoes`).

### HSKK 中级 (prova oral)
O cartão **HSKK** na escolha de nível abre a parte oral: você fala no microfone, o app grava, transcreve com o
ElevenLabs Scribe e compara com o original. Tem modo prova (o áudio original do começo ao fim, com o microfone
ligando sozinho), modo estudo por questão e revisão espaçada das frases. O progresso fica separado, em
`progresso/hskk.json`. Detalhes, fontes e pipeline: **[docs/hskk.md](docs/hskk.md)**.

### Revisão espaçada
Errou → o app pergunta se você quer revisar e sugere cartões:
**refazer a questão real**, a **frase-chave** com o trecho do áudio original e as **palavras-chave** (inclusive
as que você consultou no hover). Agendamento com **FSRS** (o algoritmo do Anki moderno), limite de novos por dia
configurável.

### Progresso
- Fica **num arquivo local**: `progresso/progresso.json` (+ cópia diária em `progresso/backups/`).
  Esse arquivo é a única fonte da verdade — o navegador não restaura nada por conta própria.
- **⟲ resetar simulado** (na tela inicial e no modo estudo): recomeça uma prova do zero; as tentativas antigas ficam
  arquivadas no histórico e os cartões continuam.
- **⚙ → Formatar todo o progresso**: apaga tudo (digite FORMATAR para confirmar; o estado anterior fica em
  `progresso/backups/antes-*.json`).
- **⚙ → Backup**: baixar/restaurar um `.json` manualmente.
- O HSKK tem arquivo, backups e formatação próprios (`progresso/hskk.json`). Um backup de uma parte não é restaurado
  na outra.
- `progresso/` não é versionado (dados pessoais).

---

## De onde vêm as provas

### HSK 3

| Provas | Caderno e gabarito | Áudio | Texto do áudio (听力材料) |
|---|---|---|---|
| H31001–H31005 | **oficial** — chinesetest.cn (汉考国际 / CTI) | oficial, chinesetest.cn | oficial |
| 样卷 (prova-modelo) | **oficial** — 大纲 HSK 三级 (Hanban) | YouTube (Hancai Chinese, “H30000”) | oficial |
| H31327–H31330, H31332, H31333 | tuttocina.it (Centro Oriente, Turim) | Instituto Confúcio de Manchester / tuttocina.it | oficial só no H31333 |
| H31006–H31009, H31110, H31111, H31218–H31221 | acervo tiengtrungnet.com (via GitHub `cahyowidiantoro99-ux/MANDARIN`) | GitHub / YouTube (Hancai Chinese) | oficial só no H31008 |

### HSK 1 e HSK 2

| Provas | Caderno e gabarito | Áudio | Texto do áudio |
|---|---|---|---|
| H10901, H10902, H11003–H11005 | **oficial**: chinesetest.cn | oficial, chinesetest.cn | oficial |
| 样卷 HSK 1 (H1AMOSTRA) | **oficial**: 大纲 HSK 一级 (Hanban) | oficial | oficial (limpo do pinyin intercalado) |
| H11006–H11009, H11112, H11113, H11220–H11223, H11333, H11440 | acervo tiengtrungnet.com (via GitHub) | GitHub / YouTube | oficial em H11006–H11008 e H11333 |
| H11329–H11332, H11334, H11335 | tuttocina.it | tuttocina.it / YouTube | oficial só no H11335 |
| H20901, H20902 (HSK 2) | **oficial**: chinesetest.cn | oficial, chinesetest.cn | oficial |

### Todas
- Todo áudio foi **verificado contra a sua prova** por reconhecimento de fala (cada um só bate com a prova certa).
- Gabaritos de H31007 e H31218–H31221 estavam em imagem / texto corrompido e foram **lidos da página renderizada**
  (`data/gabaritos/`). No H31007 a resposta da 72 não batia com as peças do caderno — vale o caderno (anotado).
- **27 provas (14 do HSK 3, 13 do HSK 1) não têm o 听力材料 publicado**: o texto foi reconstruído **a partir do áudio original** (whisper +
  ElevenLabs Scribe como segunda escuta independente + agentes revisores, sempre coerente com o gabarito oficial).
  Essas provas mostram o aviso “texto do áudio transcrito”. Nos casos de 他/她, que soam iguais, vale a figura da
resposta certa. As poucas dúvidas restantes (grafia de nomes, por exemplo)
  estão em `data/transcricoes/<ID>.json → duvidas`.
- Traduções, explicações, palavras-chave e glossário em português foram preparados por agentes e **revisados por um
  segundo agente independente** em cada prova.

A origem de cada prova está no campo `origem` de `data/provas/<ID>.json`; o catálogo do HSKK está em `data/hskk/CATALOGO.md`.

---

## Como os dados são produzidos

```
fontes/raw/<ID>/<ID>.pdf    PDFs baixados                          (não versionado)
fontes/audio/<ID>.mp3       áudio original                         (não versionado)

scripts/parse_pdf.py        PDF → data/provas/<ID>.json: questões, gabarito, roteiro do áudio, figuras (public/img/)
scripts/parse_hsk1.py       idem para o HSK 1 (recortes manuais de figuras em data/ajustes/<ID>.json)
scripts/parse_hsk2.py       idem para o HSK 2
scripts/verifica_provas.py  checagens estruturais (opções, letras únicas por grupo, peças = gabarito…)
scripts/transcreve.py       provas sem 听力材料: rascunho do whisper + voz (homem/mulher) pelo tom
scripts/scribe.py           segunda escuta com o ElevenLabs Scribe e comparação questão a questão
scripts/alinha.py           alinhamento global por caractere (programação dinâmica) → tempo de cada caractere
scripts/textos.py           segmentação (jieba + listas HSK + correções em data/segmentacao.json), pinyin
scripts/enriquece.py        junta tudo → public/conteudo/provas/<ID>.json, lexico.json, index.json
scripts/valida_traducoes.py confere traduções/explicações contra a prova
scripts/vocabulario.py      data/vocabulario/hsk1–3.txt → public/conteudo/vocabulario.json (aba Vocabulário)
scripts/exemplos.py         exemplos (例如) do início de cada parte, por nível → public/conteudo/exemplos.json

data/traducoes/<ID>.json    traduções PT, explicações, trecho e palavras-chave por questão
data/transcricoes/<ID>.json texto do áudio reconstruído (provas sem 听力材料)
data/lexico_pt/             glossário PT
data/trabalho/              instruções e dossiês usados pelos agentes
data/vocabulario/           listas do HSK 1, 2 e 3 (汉字|pinyin|significado, uma palavra por linha)
data/ajustes/<ID>.json      correções pontuais da prova e recortes manuais de figuras

src/hskk/, scripts/hskk/, data/hskk/, public/hskk/   a parte do HSKK (ver docs/hskk.md)
```

Refazer tudo depois de mudar algo em `data/`: `python -W ignore scripts/enriquece.py tudo`
(e `python scripts/vocabulario.py` depois de mexer nas listas de vocabulário).
O alinhamento usa as palavras com tempo do ElevenLabs Scribe (em cache em `fontes/scribe/`) e o `faster-whisper`
para reajustar trechos curtos; precisa do áudio em `fontes/audio/`. O Scribe e a voz sintética precisam de
`ELEVENLABS_API_KEY` no `.env` (não versionado; a chave precisa das permissões *Speech to Text* e *Text to Speech*).
A voz é gerada pelo servidor local (`servidor/vozSintetica.ts`) — a chave nunca vai para o navegador.

**Stack**: Vite + React + TypeScript · ts-fsrs · Python (PyMuPDF, jieba, pypinyin, faster-whisper, numpy).
**Dicionários**: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) (CC BY-SA 4.0) e listas HSK 2.0 de
[complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary).

---

As provas são material do Hanban / Chinese Testing International, reunidas aqui só para estudo. Traduções,
explicações e código: livres para estudar e compartilhar com colegas.
