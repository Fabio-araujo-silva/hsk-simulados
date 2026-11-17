# Instruções — traduções, explicações e palavras-chave de uma prova HSK 3

Você prepara o material de estudo em **português do Brasil** para UMA prova oficial do HSK 3 (formato 2.0).
O estudante é brasileiro, nível HSK 2→3, e vai usar isto para passar no exame. **Não altere nada em chinês**:
o texto chinês é o oficial. Você só escreve português.

## Entradas (leia as duas)

- `data/trabalho/<ID>.md` — a prova inteira, questão por questão, com o áudio transcrito, opções e a **resposta oficial**.
- `data/trabalho/<ID>-frases.json` — lista de TODOS os textos chineses da prova: `[{"zh": "...", "ctx": "...", "lacuna"?: true}]`.

## Saída: `data/traducoes/<ID>.json` (UTF-8, JSON válido)

```json
{
  "frases":  { "<zh exatamente como na lista>": "<tradução PT>" },
  "lacunas": { "<zh com （＿＿）>": "<tradução PT com ___ no lugar da palavra que falta>" },
  "questoes": {
    "1": { "explicacao": "...", "trecho": "...", "palavras": ["...", "..."] }
  },
  "aceitas": { "73": ["outra ordem também correta"] }
}
```

### `frases`
- Uma entrada para **cada** item da lista (exceto os marcados `"lacuna": true`, que vão em `lacunas`).
  A chave é o `zh` copiado **byte a byte** (mesma pontuação chinesa, mesmos números).
- Tradução natural e fiel, no registro da frase (conversa informal ≠ instrução da prova). Nada de explicação
  dentro da tradução. Nomes próprios: mantenha em pinyin (小王 → Xiao Wang; 周明 → Zhou Ming).
- Itens que são só uma palavra (opções do banco de palavras, opções curtas) → tradução curta da palavra
  no sentido em que aparece (ex.: `附近` → "perto; arredores").
- Unidades: 元/块 → "yuan"; 斤 → "jin (meio quilo)"; horários por extenso como em PT.

### `lacunas`
- Para cada item `"lacuna": true`: traduza a frase deixando `___` exatamente onde está a palavra que falta,
  **sem entregar a resposta** (não traduza a palavra ausente, nem dê pistas extras). Ex.:
  `电影马上就要开始了，（＿＿）手机关了吧。` → "O filme já vai começar, ___ desligue o celular."

### `questoes` — uma entrada para cada número 1–80
- `explicacao` (2–4 frases, PT): por que a **resposta oficial** é a correta, citando o que no áudio/texto prova
  isso; quando houver pegadinha, diga por que as outras opções erram. Tom de professor direto, nada de enrolação.
  - Listening (1–40): diga o que foi dito que leva à resposta (ex.: "Ela diz 我九点前必须回到办公室…").
  - V/F (11–20): diga se a frase ★ é certa ou errada e qual parte do áudio confirma/contradiz.
  - Leitura parte 2 (51–60): explique o uso/gramática da palavra (ex.: 把 + objeto + verbo + complemento).
  - Escrita parte 1 (71–75): explique a estrutura da frase (sujeito, advérbio, 把/被, complemento de grau…).
  - Escrita parte 2 (76–80): explique o caractere: palavra que forma, significado, componentes que ajudam a lembrar.
  - **Nunca contradiga a resposta oficial.** Se achar que o gabarito está errado, explique mesmo assim a lógica
    oficial e anote a dúvida no relatório final (não no JSON).
- `trecho`: substring **exata** (copiada do `.md`) do texto da questão — fala do áudio, texto de leitura,
  afirmação, linha — que justifica a resposta. Curto (4–25 caracteres). Para 71–80 use a frase correta ou o
  caractere. Precisa existir literalmente nos textos daquela questão.
- `palavras`: 1–4 palavras-chave de vocabulário (chinês, sem pinyin) que a pessoa precisa saber para
  acertar; de preferência HSK 2–4; cada uma deve aparecer literalmente nos textos da questão.

### `aceitas` (só 71–75, opcional)
- Outras ordens das peças que também formam frase **gramatical e natural** usando TODAS as peças
  (ex.: advérbio de tempo no início ou depois do sujeito). Seja conservador; na dúvida, não inclua.
  Copie a pontuação final da resposta oficial.

## Antes de terminar

Rode a validação e corrija até passar sem erros:

```bash
python scripts/valida_traducoes.py <ID>
```

Relatório final (curto): quantas frases/explicações, dúvidas sobre o gabarito, qualquer coisa estranha no texto.
