# Instruções — glossário PT (tooltip de tradução por palavra)

Entrada: `data/trabalho/lexico-loteN.json` — lista de `{"w": palavra, "py": pinyin no contexto, "en": glosa do CC-CEDICT (pode faltar), "hsk": nível HSK 2.0 ou null, "exemplo": uma frase da prova onde a palavra aparece}`.

Saída: `data/lexico_pt/loteN.json` — objeto `{ "<palavra exatamente como em w>": "<glosa PT>" }` com TODAS as palavras do lote.

Regras da glosa (português do Brasil, para um estudante de HSK 3 vendo um balãozinho ao passar o mouse):
- Curta: 1 a 4 sentidos separados por "; ", o sentido usado no `exemplo` PRIMEIRO. Máx. ~60 caracteres.
- Verbos no infinitivo ("esperar; aguardar"), substantivos sem artigo, adjetivos no masculino.
- Partículas/gramática: diga a função entre parênteses, ex.: 了 → "(partícula: ação concluída / mudança de estado)",
  的 → "(partícula: de; posse/atributo)", 把 → "(partícula: põe o objeto antes do verbo)", 得 → "(partícula: grau/resultado após verbo)".
- Classificadores: "(classificador de …)", ex.: 条 → "(classificador de coisas longas: rua, calça, rio)".
- Nomes próprios e números: 北京 → "Pequim", 王 → "Wang (sobrenome); rei" etc.
- Combinações que não são palavra de dicionário (ex.: 打篮球) → traduza a expressão ("jogar basquete").
- Não invente sentidos; use o `en` e o exemplo como guia, mas corrija se o `en` estiver estranho para o contexto.

Ao terminar, confira com um script: todas as chaves `w` do lote presentes, nenhuma glosa vazia, nenhuma com caracteres chineses.
