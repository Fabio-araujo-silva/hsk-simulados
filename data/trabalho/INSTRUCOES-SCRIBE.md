# Fechar a transcrição com a segunda escuta (ElevenLabs Scribe) — prova <ID>

O texto do áudio de <ID> foi reconstruído com whisper + revisão. Agora temos uma segunda escuta independente,
bem mais precisa (Scribe): `data/trabalho/<ID>-scribe.md` mostra, por questão, o texto atual e o que o Scribe ouviu
em cada uma das duas leituras, com o falante que ele separou (ids numéricos de falante, consistentes na prova toda).

## Decida cada `≠`
- **Ignore**: números de questão falados ("一，", "二十。" no começo de uma leitura), pontuação, e leituras cortadas
  pela janela de tempo (uma leitura vazia e a outra com o texto duas vezes).
- **Aceite o Scribe** quando as duas leituras dele concordam entre si e divergem do texto atual — em especial **儿**
  (点儿、块儿、一会儿、哪儿…), palavras trocadas e palavras faltando/sobrando.
- **Homófonos que não se distinguem pelo ouvido** (他/她/它, 的/地/得, 在/再 quando ambíguo): decida pelo contexto e pelo
  caderno; o Scribe não é árbitro aqui.
- **Números**: mantenha o estilo dos 听力材料 oficiais (horas, dinheiro e datas por extenso em caracteres é o comum;
  se o texto atual já usa algarismos como no caderno, pode manter).
- **Falantes (男/女)**: o Scribe separa as vozes com ids. Descubra qual id é homem e qual é mulher pelas falas cujo gênero
  é certo (ex.: o exemplo 喂，请问张经理在吗？ é homem; 他正在开会… é mulher; trechos narrados da parte 2 e as perguntas
  问 têm um locutor fixo) e corrija `fal` onde o texto atual contradiz o Scribe nas duas leituras.
- Se a leitura 1 e a 2 do Scribe discordam entre si, mantenha o texto atual (a não ser que o caderno/gabarito decida).

## Aplique
1. Edite `data/transcricoes/<ID>.json` (atualize `duvidas`: remova o que o Scribe resolveu).
2. Rode:
   ```
   python scripts/parse_pdf.py <ID> fontes/raw/<ID>/<ID>.pdf
   python scripts/verifica_provas.py <ID>
   python -W ignore scripts/enriquece.py dossie <ID>
   ```
3. Em `data/traducoes/<ID>.json`, ajuste as chaves de `frases` que mudaram (renomeie para o novo `zh` — mudanças como
   儿 normalmente não mudam a tradução; traduza frases realmente novas; remova as que sumiram) e confira se `trecho` e
   `palavras` ainda aparecem literalmente nos textos. `python scripts/valida_traducoes.py <ID>` tem de dar OK.

Não rode reconhecimento de fala (o Scribe já fez). Python: `sys.stdout.reconfigure(encoding='utf-8')`; JSON UTF-8 com
ensure_ascii=False. Scripts auxiliares numa subpasta sua da pasta temporária. Não mexa em outras provas, não faça commit.

Relatório (≤ 80 palavras por prova): quantas falas mudaram, exemplos principais, o que ficou incerto.
