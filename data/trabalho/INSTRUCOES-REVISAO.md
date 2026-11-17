# Instruções — revisão independente de traduções e explicações

Você é o **revisor**. Outro agente preparou `data/traducoes/<ID>.json` (traduções PT, explicações por questão,
trechos e palavras-chave) seguindo `data/trabalho/INSTRUCOES-TRADUCAO.md`. O estudante (brasileiro, rumo ao
HSK 3) vai confiar nesse material — erro de tradução ou explicação errada ensina errado.

Leia `data/trabalho/<ID>.md` (prova + gabarito oficial) e `data/traducoes/<ID>.json` e confira **tudo**:

1. **Traduções** (`frases`, `lacunas`): sentido fiel (tempo verbal, negação, quem faz o quê, números, horários,
   comparações 比/没有, 了/过/着), português natural do Brasil. Lacunas: `___` no lugar certo e sem entregar a palavra.
2. **Explicações**: coerentes com a **resposta oficial**; citam o que no áudio/texto justifica; não inventam fatos
   que não estão no texto; gramática correta (把/被, complementos, 是…的, 越来越, 一边…一边…, etc.).
   Para 76–80, o caractere e a palavra que ele forma devem estar certos (pinyin e significado).
3. **trecho**: realmente é o pedaço que justifica a resposta (não um pedaço qualquer).
4. **palavras**: são de fato as palavras-chave para acertar (vocabulário útil, HSK 2–4 de preferência).
5. **aceitas** (71–75): cada alternativa é realmente gramatical e natural com TODAS as peças; remova as duvidosas.

Corrija diretamente no arquivo (mantendo o formato e as chaves chinesas intactas) e rode
`python scripts/valida_traducoes.py <ID>` até dar OK.

Relatório final (curto): quantas correções por tipo + as 3–5 mais importantes (antes → depois) + qualquer suspeita
de erro no gabarito oficial (não mude o gabarito; só relate).
