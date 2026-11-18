# HSKK 中级 · prova oral

Plataforma pessoal de estudo para o **HSKK 中级** (汉语水平口语考试 · prova oral intermediária do HSK), feita com provas reais
e amostras oficiais. Você fala no microfone, o app grava, transcreve com o **ElevenLabs Scribe** e compara com o original.

## O que é o HSKK 中级

O HSKK é a parte **oral** do HSK — prova separada da escrita, com certificado próprio. O 中级 costuma ser feito por quem está
no HSK 3–4. Você fala num microfone e **a gravação é corrigida depois** (não há examinador conversando com você).

| parte | questões | o que fazer | tempo |
|---|---|---|---|
| 1 · 听后重复 (ouvir e repetir) | 1–10 | ouvir uma frase **uma vez só** e repetir | 3 min nas provas antigas · 5 min no 样题 de 2023 |
| 2 · 看图说话 (falar sobre a figura) | 11–12 | descrever cada figura | 2 min cada |
| 3 · 回答问题 (responder à pergunta) | 13–14 | responder a perguntas impressas (com pinyin) | 2 min cada |

- **10 min de preparação** depois da parte 1, para as questões 11–14 juntas (pode anotar no caderno).
- Duração total: ~21 min nas provas antigas, ~23 min no 样题 atual (os dois números estão nas capas dos cadernos).
- Antes das questões o áudio pergunta nome, nacionalidade e número de inscrição (序号) — não vale nota.
- No formato atual cada frase da parte 1 termina com um “嘀” e você tem ~10 s; nas provas antigas não há bip e são ~7 s.
- **Nota: 0 a 100, aprovação com 60.** A correção é feita por avaliadores ouvindo a gravação.
- **Não achamos rubrica oficial** por parte/faixa (评分标准 por 档次) para o 中级; a correção oficial é holística. O app mostra
  os critérios que materiais de preparação usam — completude, fluência, pronúncia/tons, gramática, variedade de vocabulário —
  como **orientação, não como regra oficial**.

A página **Regras** do app explica tudo isso com dicas para cada parte.

## O que o app faz

- **Modo prova** — toca o **áudio original** da prova do começo ao fim, como no dia (abertura, instruções, frases, 嘀,
  10 min de preparação, 2 min por resposta). O microfone liga e desliga sozinho em cada janela de resposta (MediaRecorder).
  Sem texto, pinyin nem tradução; figuras e perguntas aparecem como no caderno, com um campo para anotações na preparação.
  Fechou a aba no meio? Dá para continuar da última questão começada. No fim, a **revisão da prova**: cada gravação ao lado
  do original, transcrição automática e, na parte 1, % de acerto por caractere.
- **Modo estudo** — questão a questão:
  - parte 1: toca **só o trecho daquela frase** do áudio original (ou “como na prova”, com o número e o 嘀), velocidade
    0,6×–1×, texto com karaokê, pinyin (`P`) e **tradução por hover** (`T`); você grava (`G`), ouve de volta e recebe a
    **comparação caractere a caractere** com a frase + % de acerto;
  - partes 2–3: figura/pergunta, cronômetro de preparação, anotações, gravação de 2 min com contagem regressiva,
    **transcrição do que você disse** (caracteres e ritmo) e depois **2 respostas-modelo por questão** (nível HSK 3 e HSK 4,
    com pinyin e tradução frase a frase — **geradas para estudo, não oficiais**), vocabulário útil e estruturas.
- **Revisão espaçada (FSRS)** — frases da parte 1 em que você ficou **abaixo de 80 %** (ajustável em ⚙) entram sozinhas na
  revisão: o cartão toca o áudio original, você repete (dá para gravar e conferir) e vê texto, pinyin e tradução.
- Progresso salvo em `progresso/progresso.json` (backup diário em `progresso/backups/`) e gravações em
  `progresso/gravacoes/` — tudo no seu computador, fora do git.

Sem microfone (ou com a permissão negada) o app continua funcionando: o modo prova roda “sem gravar” e o estudo mostra o
motivo. Sem o servidor local (site estático do `dist/`), as gravações ficam só na aba e não há transcrição.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5181
npm run build      # checa os tipos (tsc) e gera o site estático em dist/
```

A transcrição usa a chave `ELEVENLABS_API_KEY` do arquivo `.env` (não versionado). Ela fica **só no servidor local**
(`servidor/gravacoes.ts`): o navegador manda o nome da gravação, o servidor chama o Scribe e guarda o resultado em cache
(`progresso/gravacoes/<arquivo>.scribe.json`), então cada gravação é paga uma vez só. Dá para desligar a transcrição
automática em ⚙ e pedir na mão.

Use fone de ouvido no modo prova, senão o microfone grava o áudio da prova junto.

## Provas incluídas e procedência

| prova | caderno (figuras e perguntas) | texto das 10 frases (parte 1) | áudio | formato |
|---|---|---|---|---|
| **YANGTI** — 样题 atual (2023) | **oficial** (PDF do chinesetest.cn) | **transcrito do áudio** (o site não publica o texto) | **oficial** (MP3 do chinesetest.cn) | atual, com 嘀 |
| **H81003** — 样卷 do Hanban (2013) | **oficial** (PDF do Hanban, espelhado em tuttocina.it e LSE) | **transcrito do áudio** | **oficial** (MP3 do 样卷) | antigo, sem 嘀 |
| **H81001** — prova real | PDF com layout do Hanban (via pandachinese.online) | **redigitado por terceiros** (PDF de 2025), conferido com o áudio | YouTube (canal “Free HSK”) | antigo, sem 嘀 |
| **H81002** — prova real | PDF com layout do Hanban (via pandachinese.online) | **redigitado por terceiros**, conferido com o áudio | YouTube (“Free HSK”) | antigo, sem 嘀 |
| **H81311** — prova real | **frames de vídeo** (Hancai Chinese) — sem o PDF | texto dos **frames do vídeo**, conferido com o áudio | YouTube (“Free HSK”) | atual, com 嘀 |
| **H81312** — prova real | **frames de vídeo** (Hancai Chinese) — sem o PDF | texto dos **frames do vídeo**, conferido com o áudio | YouTube (“Free HSK”) | atual, com 嘀 |

- As 10 frases de cada prova batem com o áudio (conferidas com Whisper e, de novo, com o ElevenLabs Scribe). Únicas dúvidas:
  **他/她** (soam iguais) no YANGTI nº 3 e no H81002 nº 5 — o reconhecimento trata os dois como iguais.
- No H81001 o PDF de terceiros diz “第1到15题” na instrução; no áudio é “第1到10题，请听后重复”.
- Figuras: recortadas dos PDFs (YANGTI, H81001–H81003) e dos frames de vídeo (H81311, H81312, cortando a marca d’água).
- Os originais de H81311 existem em cii.ie, mas o site bloqueia download automático (dá para baixar à mão).
- **Traduções, respostas-modelo, vocabulário e estruturas foram escritos para estudo — não são oficiais.**
- Lista completa de links e observações: `fontes/CATALOGO.md`.

As provas são material do Hanban / Chinese Testing International — este repositório é **privado e para estudo pessoal**.

## Como os dados são produzidos

```
fontes/raw/<ID>/          PDFs e frames baixados (não versionados)
fontes/audio/<ID>.mp3     áudio original (não versionado) → public/audio/<ID>.mp3 (mono 48 kbps, o que o app toca)
scripts/scribe.py         ElevenLabs Scribe no áudio inteiro (uma passada por prova) → fontes/scribe/<ID>.json
scripts/tempos.py         Scribe (tempo por caractere) + ffmpeg silencedetect → data/tempos/<ID>.json:
                          início/fim de cada frase, o 嘀, as janelas de resposta, os 10 min de preparação e os 2 min
                          de cada resposta; avisa se alguma frase não bate com o que o Scribe ouviu
data/provas/<ID>.json     frases + tradução, figuras, perguntas, respostas-modelo, vocabulário, estruturas (editável)
data/meta.json            título, formato e procedência de cada prova
data/lexico_pt.json       glosas PT das palavras novas (data/lexico_base.json = glossário herdado do app do HSK 3)
scripts/monta.py          tudo acima + segmentação (jieba + listas HSK) e pinyin (scripts/textos.py)
                          → public/conteudo/provas/<ID>.json, index.json, lexico.json
public/img/<ID>/11.jpg …  figuras do 第二部分
```

```bash
python scripts/scribe.py            # só chama a API para provas ainda sem cache
python scripts/tempos.py
python scripts/monta.py
```

Dicionário de apoio: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) (CC BY-SA 4.0) e listas oficiais
HSK 2.0 via [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (em `fontes/dic/`).

## Limites honestos

- O % da parte 1 mede quantos caracteres o reconhecimento de voz entendeu da sua repetição — é um bom termômetro, não a
  nota do HSKK. Reconhecimento automático erra às vezes (para mais e para menos).
- Para as partes 2–3 o app não dá nota: mostra o que você disse, quanto falou e as respostas-modelo para comparar.
- Não há rubrica oficial publicada por faixas; os critérios mostrados são orientação de materiais de preparação.
