# Catálogo — HSKK 中级 (provas reais / amostras oficiais)

Os arquivos baixados ficam fora do git: `fontes/raw/hskk/<ID>/` (PDFs, frames, textos) e `fontes/audio/hskk/<ID>.mp3`
(áudio original). O que o app usa fica em `public/hskk/` e os dados editáveis em `data/hskk/`.

Coletado em 17/11/2026. IDs de prova do HSKK 中级 são **H81xxx** (H21xxx é HSK 2, não HSKK).
Áudio verificado = trecho do 第一部分 transcrito com faster-whisper small e comparado frase a frase com o texto.

| ID | 题本 | 录音文本 | Áudio | Verificado |
|---|---|---|---|---|
| YANGTI | PDF oficial | transcrição Whisper revisada | MP3 oficial | 10/10 |
| H81003 | PDF oficial | transcrição Whisper revisada | MP3 | 10/10 |
| H81001 | PDF | PDF transcrito por terceiro | MP3 (YouTube) | 10/10 |
| H81002 | PDF | PDF transcrito por terceiro | MP3 (YouTube) | 10/10 |
| H81311 | só frames do vídeo | texto dos frames | MP3 (YouTube) | 10/10 |
| H81312 (extra) | só frames do vídeo | texto dos frames | MP3 (YouTube) | 10/10 |

## YANGTI — 样题 oficial atual (HSK口语（中级）样题)
- Fonte: site oficial chinesetest.cn (página /HSKK/2, link "样卷").
  - 题本: https://download.chinesetest.cn/newhsk-site/model/HSK8_yj.pdf → `fontes/raw/hskk/YANGTI/YANGTI_tiben.pdf`
  - Áudio: https://download.chinesetest.cn/newhsk-site/audio/HSK8.mp3 → `fontes/audio/hskk/YANGTI.mp3` (128 kbps, 23:24)
- Script: o site não publica 听力材料. `fontes/raw/hskk/YANGTI/YANGTI_luyin_cailiao.txt` = Whisper + revisão manual.
- Notas: editado pelo 教育部中外语言交流合作中心 (PDF de 10/2023), sem número de prova.
  Formato novo no cabeçalho: 听后重复 10题/**5分钟**, total **23分钟** (antes era 3分钟/21分钟). Mesma estrutura de 14 questões.
  Q13: 你认为自己最吸引别人的地方是什么？ Q14: 有没有什么事情让你觉得后悔？如果再给你一次机会，你会怎么做？

## H81003 — 样卷 antigo do Hanban (国家汉办/孔子学院总部, PDF de 2013)
- 题本: https://www.tuttocina.it/tuttocina/lingua/H81003.pdf (o mesmo arquivo, byte a byte, em https://www.lse.ac.uk/cibl/assets/documents/qualifications/HSKK-2.pdf) → `fontes/raw/hskk/H81003/H81003_tiben.pdf`
- Áudio: https://www.tuttocina.it/tuttocina/lingua/H81003.mp3 → `fontes/audio/hskk/H81003.mp3` (320 kbps, 22:32)
- Script: não encontrado. `fontes/raw/hskk/H81003/H81003_luyin_cailiao.txt` = Whisper + revisão.
- Q13: 你喜欢和什么样的人交朋友？为什么？ Q14: 你对减肥是什么态度？为什么？

## H81001
- 题本 + 录音材料: zip no Google Drive linkado em https://pandachinese.online/hsk/hskk-mock-test/
  (https://drive.google.com/file/d/1BlHaL9T4Qnfr4sJxrdSkQEkumfD4TABZ) → `fontes/raw/hskk/H81001/H81001_tiben.pdf`, `H81001_luyin_cailiao.pdf`
- Áudio: YouTube "Free HSK" https://youtu.be/zIt_5oWoPZA → `fontes/audio/hskk/H81001.mp3`
- Notas: o 题本 tem cara de original (layout do Hanban). O 录音材料 foi **redigitado por terceiro** (PDF de 2025) e tem um erro
  ("第1到15题…请在嘀声后重复"; no áudio é "第1到10题。请听后重复"). As 10 frases batem com o áudio.

## H81002
- 题本 + 录音材料: mesmo Drive da pandachinese (https://drive.google.com/file/d/11nFW6Wk5YsG-qce5YFJh4K4oJeOIca37) → `fontes/raw/hskk/H81002/`
- Áudio: YouTube "Free HSK" https://youtu.be/1005i2ZVIx0 → `fontes/audio/hskk/H81002.mp3`
- Notas: 录音材料 também foi redigitado por terceiro; as 10 frases batem com o áudio.

## H81311
- **Falta o 题本 em PDF.** O original existe em https://www.cii.ie/t4media/H81311试卷.pdf e o script oficial em
  https://www.cii.ie/t4media/H81311卷录音材料.pdf, mas o site responde 403 a downloads automáticos. Dá pra baixar à mão no navegador.
- O que temos: frames do vídeo Hancai Chinese https://youtu.be/7sWteGrhYR0 (fotos do 第二部分, perguntas do 第三部分, 听力材料)
  → `fontes/raw/hskk/H81311/*.png` + `H81311_texto.txt`
- Áudio: YouTube "Free HSK" https://youtu.be/X23eAX31mF0 → `fontes/audio/hskk/H81311.mp3`

## H81312 (extra, mesma situação do H81311)
- Frames: Hancai https://youtu.be/So0fDUmPuiU → `fontes/raw/hskk/H81312/*.png` + `H81312_texto.txt`; áudio: https://youtu.be/DkXaiEtjdDU → `fontes/audio/hskk/H81312.mp3`

## Outras provas reais encontradas (não baixadas)
Lista completa da Hancai: https://www.youtube.com/playlist?list=PLBILrnmnFOm6cpADdFUyH-O3qFb7upO7T
(H81004, H81105–H81107, H81208–H81210, H81416, todos "with text material"). Os áudios estão no canal Free HSK (H81004, H81105, H81106, H81107, H81210, H81416).

## Pontuação / 评分标准
- Oficial encontrado: nota máxima 100, aprovação com 60 (brochura HSK口试 em https://www.csuohio.edu/sites/default/files/HSK-koushi.pdf;
  folha do Confucius Institute UK https://www.confuciusinstitute.ac.uk/wp-content/uploads/2020/12/HSKK-Intermediate-Level-Mar-2020.pdf).
  A correção é feita sobre a gravação, não por examinador ao vivo.
- **Não achei** a rubrica oficial por faixas (评分标准 por parte/档次) do HSKK 中级. Sites de preparação só dão dicas, nada oficial.
