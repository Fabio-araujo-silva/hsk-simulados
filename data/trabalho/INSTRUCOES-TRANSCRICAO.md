# Instruções — transcrição do listening de uma prova SEM 听力材料 oficial

A prova é real (caderno e gabarito oficiais), mas o texto do áudio (听力材料) não foi publicado.
Você vai reconstruí-lo **a partir do áudio original**, com a ajuda do reconhecimento de fala.
O estudante vai ler esse texto palavra por palavra, clicar nele para ouvir — então ele precisa ser o que
**de fato foi falado**, em caracteres simplificados e com a pontuação no padrão dos 听力材料 oficiais.

## Entradas

- `data/trabalho/<ID>-asr.md` — o caderno (afirmações ★ das questões 11–20 e opções das 21–40, com gabarito)
  + o reconhecimento de fala (whisper-medium) em ordem, com tempos e a voz estimada pelo tom (男/女/?).
- Para ver o formato oficial, compare com uma prova completa: `data/provas/H31001.json` → campo `audioTexto`
  de cada questão, e `data/trabalho/H31001.md`.
- O áudio: `public/audio/<ID>.mp3`. Se um trecho estiver ambíguo, você pode recortar e reconhecer de novo com
  outro modelo, por exemplo:
  ```python
  from faster_whisper import WhisperModel
  m = WhisperModel("medium", device="cpu", compute_type="int8")
  segs, _ = m.transcribe("public/audio/<ID>.mp3", language="zh", clip_timestamps=[inicio, fim], initial_prompt="以下是普通话的句子。")
  ```

## Como o áudio do HSK 3 é organizado (sempre igual)

Música → 3× 大家好！欢迎参加HSK（三级）考试。→ instruções → **parte 1** (exemplo 喂，请问张经理在吗？…; questões 1–10:
diálogos de 2 falas) → **parte 2** (exemplos; questões 11–20: um trecho narrado + a frase ★, que também é lida)
→ **parte 3** (questões 21–30: diálogo de 2 falas + 问：pergunta) → **parte 4** (questões 31–40: diálogo de 4–5
falas + 问：pergunta) → 听力考试现在结束。 **Cada questão é lida DUAS vezes seguidas** — use as duas leituras para
corrigir uma à outra. As instruções e os exemplos são idênticos aos das outras provas: não transcreva.

## Saída: `data/transcricoes/<ID>.json`

```json
{
  "questoes": {
    "1":  [{"fal": "女", "txt": "你一直看手表，有什么着急的事情吗？"}, {"fal": "男", "txt": "我九点前必须回到办公室，经理有事情找我，再见。"}],
    "11": [{"fal": null, "txt": "我以前以为北京话就是普通话，到北京两年后，我才发现不是这样的。"}, {"fal": "★", "txt": "北京话和普通话是相同的。"}],
    "21": [{"fal": "女", "txt": "…"}, {"fal": "男", "txt": "…"}, {"fal": "问", "txt": "男的怎么了？"}]
  },
  "duvidas": {"23": "não deu para ouvir se é 他 ou 她 — usei 他 pelo contexto"}
}
```

Regras:
- Todas as questões 1–40. `fal`: "男"/"女" nas falas de diálogo (use a voz estimada, mas confira pelo conteúdo e pela
  alternância — os diálogos alternam homem/mulher), "问" na pergunta final (21–40), `null` no trecho narrado da parte 2
  e "★" na frase ★ (11–20; ela deve bater com a afirmação impressa no caderno — use o texto do caderno).
- Texto: caracteres simplificados, pontuação chinesa (，。？！、“”), números como foram falados no estilo dos 听力材料
  (horas/dinheiro geralmente em caracteres: 九点、两千多块钱), sem espaços, sem o número da questão.
- O texto precisa ser **coerente com o gabarito oficial** (se a sua transcrição levar a outra resposta, reouça o trecho).
  As opções do caderno ajudam a acertar palavras (o diálogo costuma conter ou parafrasear a opção correta).
- Não "melhore" a fala: se o locutor disse 那还是我做饭吧, é isso que vai.
- Liste em `duvidas` qualquer palavra que não ficou 100% clara.

Ao terminar, confira: 40 questões; 11–20 terminam com ★ igual ao caderno; 21–40 terminam com 问.
