# Cadeia completa para uma prova SEM 听力材料 oficial (<ID>)

1. **Transcrição** — siga `data/trabalho/INSTRUCOES-TRANSCRICAO.md` usando `data/trabalho/<ID>-asr.md`
   → grave `data/transcricoes/<ID>.json`. A voz vem como [男/女 + tom mediano em Hz] por turno
   (~125 Hz ≈ homem, ~220 Hz ≈ mulher; valores no meio podem errar — use a alternância do diálogo e o conteúdo).
   **Não invente 儿化**: o reconhecimento costuma cortar o 儿 final; só escreva 儿 se o caderno imprimir a palavra
   com 儿 ou se as duas leituras indicarem claramente — senão escreva sem 儿 e registre em `duvidas`.
   Cada questão é lida 2×: compare as duas leituras para corrigir erros do reconhecimento (homófonos 在/再 etc.).
2. **Integração** — rode:
   ```
   python scripts/parse_pdf.py <ID> fontes/raw/<ID>/<ID>.pdf
   python scripts/verifica_provas.py <ID>            (tem de dar OK; senão corrija a transcrição)
   python -W ignore scripts/enriquece.py dossie <ID>
   ```
3. **Tradução e explicações** — siga `data/trabalho/INSTRUCOES-TRADUCAO.md` → `data/traducoes/<ID>.json`
   (as figuras de 1–10 estão em `public/img/<ID>/`, L1a-*.png = 1–5, L1b-*.png = 6–10; olhe-as).
   Escolha `palavras` que existam em `public/conteudo/lexico.json` sempre que possível.
   `python scripts/valida_traducoes.py <ID>` tem de dar OK.

Memória da máquina está apertada (outros reconhecimentos de fala rodando): **não rode o whisper**,
a não ser num recorte de poucos segundos com o modelo "small" quando for impossível decidir uma palavra.
Python: `sys.stdout.reconfigure(encoding='utf-8')` antes de imprimir chinês; JSON em UTF-8 com ensure_ascii=False.
Não mexa em outros arquivos, não faça commit. Scripts auxiliares fora do repositório.

Relatório final (< 150 palavras): dúvidas da transcrição, incoerências com o gabarito, contagens.
