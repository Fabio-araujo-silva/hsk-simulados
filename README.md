# HSK 3 · simulados reais

Plataforma pessoal de estudo para o **HSK 3 (formato HSK 2.0)** feita **só com provas oficiais já aplicadas** —
caderno, gabarito e áudio originais — com modo prova cronometrado, modo estudo com áudio sincronizado palavra por
palavra, tradução por hover e revisão espaçada (FSRS).

> 22 provas · 1.760 questões · 22 áudios originais (~13 h) · texto do áudio alinhado a 98,7–99,8 % dos caracteres ·
> todas as frases traduzidas para o português · explicação para cada questão · glossário de 1.447 palavras.

---

## Como usar

```bash
npm install
npm run dev          # abre em http://localhost:5180
```

Use sempre pelo `npm run dev`: é o servidor local que grava o seu progresso em disco (ver abaixo).
`npm run build` gera um site estático em `dist/` (nesse caso o progresso fica só no navegador).

### Modo prova
Igual ao dia do exame: o listening toca do começo ao fim **sem pausa** (cada item é lido duas vezes), depois
**5 min** para revisar o listening, **30 min** de leitura e **15 min** de escrita, sem tradução e sem pinyin.
No fim: nota por seção (cada uma vale 100; total 300; **aprovação com 180**), aproveitamento por tipo de questão,
revisão das erradas e o botão para mandar todas as erradas para a revisão espaçada.
Se você fechar a aba no meio, a prova continua de onde parou.

### Modo estudo
Questão a questão, com correção imediata e **explicação em português** de por que a resposta oficial é a certa
(o trecho que justifica fica destacado).

- **Áudio original** de cada questão: 1ª leitura, 2ª leitura, velocidade de 0,6× a 1,15×.
- **Transcrição sincronizada**: a palavra falada acende enquanto toca e **clicar numa palavra pula o áudio para ela**.
- **Modo tradução** (`T`): passe o mouse numa palavra → pinyin, tradução e nível HSK; embaixo, a frase inteira
  traduzida. Selecionar um trecho mostra todas as palavras dele. Desliga quando quiser.
- **Pinyin** sobre os caracteres (`P`), com tons de 一/不 e 儿化 como nos livros.
- **Áudio completo + texto** rolando junto (bom para shadowing).
- **Voz sintética** (ElevenLabs) nas questões que não têm áudio original (leitura e escrita): 🔊 lê o enunciado e
  cada alternativa. Cada trecho é gerado **uma única vez** e fica salvo em `public/tts/` — depois toca na hora,
  sem gastar créditos. Também funciona na correção das provas. Sem chave, usa a voz chinesa do navegador.
- **Rascunho**: **botão direito** numa alternativa (ou figura) risca/desrisca — para ir eliminando opções,
  inclusive no modo prova.
- Atalhos: `←`/`→` navegar · `A`–`F` responder · `V`/`F` certo/errado · `espaço` tocar · `Enter` próxima.

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
- `progresso/` não é versionado (dados pessoais).

---

## De onde vêm as provas

| Provas | Caderno e gabarito | Áudio | Texto do áudio (听力材料) |
|---|---|---|---|
| H31001–H31005 | **oficial** — chinesetest.cn (汉考国际 / CTI) | oficial, chinesetest.cn | oficial |
| 样卷 (prova-modelo) | **oficial** — 大纲 HSK 三级 (Hanban) | YouTube (Hancai Chinese, “H30000”) | oficial |
| H31327–H31330, H31332, H31333 | tuttocina.it (Centro Oriente, Turim) | Instituto Confúcio de Manchester / tuttocina.it | oficial só no H31333 |
| H31006–H31009, H31110, H31111, H31218–H31221 | acervo tiengtrungnet.com (via GitHub `cahyowidiantoro99-ux/MANDARIN`) | GitHub / YouTube (Hancai Chinese) | oficial só no H31008 |

- Todo áudio foi **verificado contra a sua prova** por reconhecimento de fala (cada um só bate com a prova certa).
- Gabaritos de H31007 e H31218–H31221 estavam em imagem / texto corrompido e foram **lidos da página renderizada**
  (`data/gabaritos/`). No H31007 a resposta da 72 não batia com as peças do caderno — vale o caderno (anotado).
- **14 provas não têm o 听力材料 publicado**: o texto foi reconstruído **a partir do áudio original** (whisper +
  ElevenLabs Scribe como segunda escuta independente + agentes revisores, sempre coerente com o gabarito oficial).
  Essas provas mostram o aviso “texto do áudio transcrito”; as poucas dúvidas restantes (他/她, grafia de nomes)
  estão em `data/transcricoes/<ID>.json → duvidas`.
- Traduções, explicações, palavras-chave e glossário em português foram preparados por agentes e **revisados por um
  segundo agente independente** em cada prova.

Detalhes, links e hashes: `fontes/raw/CATALOGO.md` e `fontes/audio/FONTES-AUDIO.md` (pasta local, não versionada).

---

## Como os dados são produzidos

```
fontes/raw/<ID>/<ID>.pdf    PDFs baixados                          (não versionado)
fontes/audio/<ID>.mp3       áudio original                         (não versionado)

scripts/parse_pdf.py        PDF → data/provas/<ID>.json: questões, gabarito, roteiro do áudio, figuras (public/img/)
scripts/verifica_provas.py  checagens estruturais (opções, letras únicas por grupo, peças = gabarito…)
scripts/transcreve.py       provas sem 听力材料: rascunho do whisper + voz (homem/mulher) pelo tom
scripts/scribe.py           segunda escuta com o ElevenLabs Scribe e comparação questão a questão
scripts/alinha.py           alinhamento global por caractere (programação dinâmica) → tempo de cada caractere
scripts/textos.py           segmentação (jieba + listas HSK + correções em data/segmentacao.json), pinyin
scripts/enriquece.py        junta tudo → public/conteudo/provas/<ID>.json, lexico.json, index.json
scripts/valida_traducoes.py confere traduções/explicações contra a prova

data/traducoes/<ID>.json    traduções PT, explicações, trecho e palavras-chave por questão
data/transcricoes/<ID>.json texto do áudio reconstruído (provas sem 听力材料)
data/lexico_pt/             glossário PT
data/trabalho/              instruções e dossiês usados pelos agentes
```

Refazer tudo depois de mudar algo em `data/`: `python -W ignore scripts/enriquece.py tudo`.
O alinhamento precisa do áudio em `fontes/audio/` e de `faster-whisper`; o Scribe e a voz sintética precisam de
`ELEVENLABS_API_KEY` no `.env` (não versionado; a chave precisa das permissões *Speech to Text* e *Text to Speech*).
A voz é gerada pelo servidor local (`servidor/vozSintetica.ts`) — a chave nunca vai para o navegador.

**Stack**: Vite + React + TypeScript · ts-fsrs · Python (PyMuPDF, jieba, pypinyin, faster-whisper, numpy).
**Dicionários**: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) (CC BY-SA 4.0) e listas HSK 2.0 de
[complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary).

---

As provas são material do Hanban / Chinese Testing International, reunidas aqui só para estudo. Traduções,
explicações e código: livres para estudar e compartilhar com colegas.
