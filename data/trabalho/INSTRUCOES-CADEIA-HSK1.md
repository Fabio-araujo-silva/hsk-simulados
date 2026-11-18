# Cadeia completa — prova do HSK 1 SEM 听力材料 oficial (<ID>)

A prova é real (caderno e gabarito oficiais); só o texto do áudio não foi publicado. Ele vai ser reconstruído
a partir do áudio original, com o reconhecimento do ElevenLabs Scribe já feito.

## 1 · Transcrição → `data/transcricoes/<ID>.json`

Leia `data/trabalho/INSTRUCOES-TRANSCRICAO.md` (formato, regras de 儿化, dúvidas) — mas a ORGANIZAÇÃO do áudio
do HSK 1 é esta (sempre igual; instruções e exemplos idênticos aos do H10901, não transcreva):

música → 3× 大家好！欢迎参加HSK（一级）考试。→ instruções →
- **parte 1 (1–5)**: uma expressão curta (ex.: `打电话`, `坐出租车`), lida 2× → `[{"fal": null, "txt": "打电话"}]`
  (as provas oficiais escrevem essas expressões SEM pontuação final);
- **parte 2 (6–10)**: uma frase → `[{"fal": null, "txt": "今天天气很冷。"}]`;
- **parte 3 (11–15)**: diálogo de 2 falas → `[{"fal": "男", "txt": "…"}, {"fal": "女", "txt": "…"}]`;
- **parte 4 (16–20)**: uma frase + a pergunta → `[{"fal": null, "txt": "…"}, {"fal": "问", "txt": "…？"}]`
→ 听力考试现在结束。

Entradas: `data/trabalho/<ID>-asr.md` (caderno com gabarito + o que o Scribe ouviu, com tempos e ids de falante).
Exemplos de transcrição OFICIAL do mesmo formato: `data/provas/H10901.json`, `H11003.json` (campo `audioTexto`).
- Cada questão é lida DUAS vezes: use as duas leituras para corrigir uma à outra (homófonos 在/再, 他/她…).
- Tem de ser coerente com o gabarito oficial e com as figuras (`public/img/<ID>/…`; veja com o Read).
- Falante 男/女: use os ids do Scribe, a alternância do diálogo e o conteúdo. Na dúvida, registre em `duvidas`.
- Números como no padrão oficial (o 听力材料 do HSK 1 escreve horas/idades/preços com algarismos ou caracteres
  conforme o caderno; prefira a forma impressa no caderno quando a palavra aparece lá).
- Só se for impossível decidir uma palavra: reconheça de novo um recorte de poucos segundos com o whisper "small"
  (memória apertada — nunca o arquivo inteiro):
  ```python
  from faster_whisper import WhisperModel
  m = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=2)
  segs, _ = m.transcribe("public/audio/<ID>.mp3", language="zh", clip_timestamps=[inicio, fim])
  ```

## 2 · Integração e alinhamento

```
python scripts/parse_hsk1.py <ID> fontes/raw/<ID>/<ID>.pdf      (o comando exato de cada prova está abaixo)
python scripts/verifica_provas.py <ID>                         (tem de dar 0 problemas)
python scripts/alinha.py <ID>                                  (usa o cache do Scribe; anote a % de caracteres casados)
python -W ignore scripts/enriquece.py dossie <ID>
```
Comandos de extração especiais: H11006/H11008 recebem também `fontes/raw/<ID>/<ID>_tingli.pdf` (não é o seu caso
nas provas sem 听力材料). Para as demais, o comando acima basta (gabaritos corrigidos à mão de H11220–H11223
estão em `data/gabaritos/` e são lidos sozinhos).
Se o alinhamento casar menos de ~95 % dos caracteres de alguma questão, revise a transcrição dela.

## 3 · Tradução e explicações → `data/traducoes/<ID>.json`

Siga `data/trabalho/INSTRUCOES-TRADUCAO.md` + `data/trabalho/INSTRUCOES-TRADUCAO-HSK1.md`.
`python scripts/valida_traducoes.py <ID>` tem de dar OK.

## Regras
- Python: `sys.stdout.reconfigure(encoding='utf-8')` antes de imprimir chinês; JSON UTF-8 com ensure_ascii=False.
- Não mexa em arquivos de outras provas, não faça commit. Scripts auxiliares fora do repositório.
- NÃO chame o Scribe/ElevenLabs de novo (o reconhecimento já está em cache) — a chave é compartilhada.
