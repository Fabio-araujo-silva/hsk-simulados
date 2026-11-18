# Revisão independente — provas do HSK 1 e HSK 2

Siga `data/trabalho/INSTRUCOES-REVISAO.md` (o que conferir nas traduções, explicações, trecho e palavras) com estas
diferenças:

- O estudante está começando: explicações curtas (1–3 frases), corretas e úteis; `palavras` do HSK 1–2.
- **Figuras**: as questões com figura (HSK 1: 1–15 e 21–30; HSK 2: 1–20 e 36–40) estão em `public/img/<ID>/`
  (caminhos no dossiê `data/trabalho/<ID>.md`). Abra-as com o Read (folha de contato com PIL é ok) e confira se a
  explicação descreve a figura CERTA de verdade. Se uma figura estiver quebrada (em branco, só uma marca √/×, texto
  em vez de foto), NÃO corrija o recorte — relate o arquivo.
- **Texto do áudio transcrito** (provas com `data/transcricoes/<ID>.json`, sem 听力材料 oficial): confira com o
  dossiê/figuras/gabarito. Atenção especial a **他/她** (soam iguais: quem decide é a figura ou o contexto) e a
  homófonos (在/再, 的/得, 做/坐, 买/卖 com tom). Se o texto estiver errado, corrija em `data/transcricoes/<ID>.json`
  e refaça a cadeia dessa prova:
  ```
  python scripts/parse_hsk1.py <ID> fontes/raw/<ID>/<ID>.pdf
  python scripts/verifica_provas.py <ID>
  python scripts/alinha.py <ID>
  python -W ignore scripts/enriquece.py dossie <ID>
  ```
  e ajuste as chaves de `frases` em `data/traducoes/<ID>.json` que mudaram (a chave é o texto chinês exato).
- Provas com texto OFICIAL (sem arquivo em `data/transcricoes/`, ou com `"substituiOficial": true`): não mude o texto
  chinês; só relate se algo parecer errado.

`python scripts/valida_traducoes.py <ID>` tem de dar OK no fim. Não chame o ElevenLabs/Scribe. Não faça commit.
Python: `sys.stdout.reconfigure(encoding='utf-8')`; JSON UTF-8 com ensure_ascii=False; scripts auxiliares fora do repositório.
