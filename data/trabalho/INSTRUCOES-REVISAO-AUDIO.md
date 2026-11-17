# Revisão independente de uma prova com listening TRANSCRITO DO ÁUDIO (<ID>)

Outro agente reconstruiu o texto do áudio (`data/transcricoes/<ID>.json`, com a lista `duvidas`) e fez traduções e
explicações (`data/traducoes/<ID>.json`). Você é o revisor independente: o estudante vai ler esse texto clicando
palavra por palavra enquanto ouve — ele tem de ser **exatamente o que foi falado**.

## 1. Transcrição — reouça
- Para **cada item de `duvidas`** e para cada fala que pareça estranha, reconheça o recorte com o modelo **medium**
  (agora há memória livre; use só recortes curtos, um por vez):
  ```python
  import json, sys
  sys.stdout.reconfigure(encoding="utf-8")
  from faster_whisper import WhisperModel
  m = WhisperModel("medium", device="cpu", compute_type="int8")
  segs, _ = m.transcribe("public/audio/<ID>.mp3", language="zh", clip_timestamps=[ini, fim],
                         initial_prompt="以下是普通话的句子。", beam_size=5)
  print("".join(s.text for s in segs))
  ```
  Os tempos de cada questão estão em `data/alinhamento/<ID>.json` (`questoes[n].s/e` = 1ª leitura, `s2/e2` = 2ª).
  Confira nas DUAS leituras. Em `data/trabalho/<ID>-asr.md` há o reconhecimento do modelo small e o tom (Hz) de cada turno.
- **儿化**: só mantenha 儿 se for ouvido (ou impresso no caderno). Gênero dos falantes: confira pelo tom e pela alternância.
- Corrija `data/transcricoes/<ID>.json` e atualize `duvidas` (remova o que você resolveu; deixe o que continua incerto).

## 2. Se mudou a transcrição
```
python scripts/parse_pdf.py <ID> fontes/raw/<ID>/<ID>.pdf
python scripts/verifica_provas.py <ID>
python -W ignore scripts/enriquece.py dossie <ID>
```
Depois, ajuste `data/traducoes/<ID>.json`: as chaves de `frases` precisam bater com o novo `data/trabalho/<ID>-frases.json`
(traduza as frases novas, remova as que sumiram) e as explicações/trechos têm de continuar coerentes.

## 3. Traduções e explicações
Siga `data/trabalho/INSTRUCOES-REVISAO.md` (fidelidade, coerência com o gabarito, trecho, palavras, aceitas).

`python scripts/valida_traducoes.py <ID>` e `python scripts/verifica_provas.py <ID>` têm de dar OK.
Python: `sys.stdout.reconfigure(encoding='utf-8')`; JSON UTF-8 com ensure_ascii=False. Scripts auxiliares numa subpasta
SUA da pasta temporária. Não mexa em outros arquivos, não faça commit.

Relatório final (< 150 palavras): o que mudou na transcrição (antes → depois), o que continua incerto, correções de tradução.
