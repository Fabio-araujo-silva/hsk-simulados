# Complemento para provas do HSK 2

Siga `data/trabalho/INSTRUCOES-TRADUCAO.md` (formato do arquivo, `frases`, `lacunas`, `questoes`, validação) e o estilo de
`INSTRUCOES-TRADUCAO-HSK1.md` (explicações curtas, 1–3 frases, sem jargão, citando a palavra-chave em chinês).
A prova tem **60 questões** (35 de áudio + 25 de leitura) e não tem escrita; não há `aceitas` (use `"aceitas": {}`).

| Questões | Tipo | O que explicar |
|---|---|---|
| 1–10 | ouvir uma frase + **uma figura** → certo/errado | o que foi dito e por que a figura (descrita em poucas palavras) bate ou não |
| 11–20 | diálogo curto ↔ figura A–F (dois grupos) | a palavra do diálogo que leva à figura certa e o que a figura mostra |
| 21–30 | diálogo curto + pergunta (问) → A/B/C | a fala que responde à pergunta; se houver pegadinha (número, distrator), diga qual |
| 31–35 | diálogo longo + pergunta → A/B/C | idem; diga em que linha do diálogo está a resposta |
| 36–40 | frase ↔ figura A–F | sentido da frase e o que a figura mostra |
| 41–45 | lacuna com banco de palavras | uso da palavra (verbo + complemento 完/过, 几+千, 在…旁边 etc.) |
| 46–50 | frase do texto + afirmação ★ → certo/errado | por que a afirmação é verdadeira/falsa, citando o trecho do texto |
| 51–60 | frase ↔ resposta/réplica A–F / A–E (dois grupos) | por que a réplica responde (ou continua) a frase |

- As figuras estão em `public/img/<ID>/`. **Olhe as figuras** em 1–20 e 36–40 e descreva a correta em poucas palavras.
- `trecho` deve existir literalmente nos textos da questão (áudio, enunciado, afirmação/texto, opções do grupo).
- `palavras`: 1–3 palavras do HSK 1–2, de preferência presentes em `public/conteudo/lexico.json`.
- O gabarito oficial é a autoridade: dúvidas vão no relatório, nunca no JSON.
