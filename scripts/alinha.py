"""Alinha o áudio original da prova com a transcrição oficial, caractere a caractere.

    python scripts/alinha.py <ID> [--modelo small] [--refaz]

1. Converte o áudio (fontes/audio/<ID>.mp3) para o formato servido pelo app
   (public/audio/<ID>.mp3, mono 48 kbps CBR — busca precisa no navegador).
2. Reconhece a fala: usa o ElevenLabs Scribe se houver fontes/scribe/<ID>.json (scripts/scribe.py); senão,
   faster-whisper (timestamps por palavra) — cache em fontes/whisper/<ID>.json.
3. Alinha a sequência esperada (instruções, exemplos e cada questão LIDA DUAS VEZES)
   contra o texto reconhecido com programação dinâmica semi-global (vetorizada em numpy):
   caractere igual +2, homófono (mesmo pinyin sem tom) +1, diferente −1,
   lacuna no áudio −1, caractere extra no áudio −0,5.
   Consertos de tempo (não mexem em alinhamento limpo): trechos em que o Scribe "colapsou" os tempos dentro de
   uma questão são refeitos com o whisper (remenda_colapsos); caractere casado longe do resto da fala perde o
   tempo; fala com deslocamento entre as duas leituras fora do padrão da questão copia o tempo da outra leitura
   (confere_leituras).
4. Grava data/alinhamento/<ID>.json com o tempo de cada caractere de cada fala.

A transcrição oficial manda; o whisper só serve para achar onde cada caractere cai.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import textos  # noqa: E402
from pypinyin import Style, lazy_pinyin  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
DIGITOS = dict(zip("0123456789", "零一二三四五六七八九"))


def prepara_audio(pid: str) -> Path:
    origem = next((p for p in (RAIZ / "fontes" / "audio").glob(f"{pid}.*")), None)
    if origem is None:
        raise SystemExit(f"sem áudio em fontes/audio/{pid}.*")
    destino = RAIZ / "public" / "audio" / f"{pid}.mp3"
    if not destino.exists() or destino.stat().st_mtime < origem.stat().st_mtime:
        destino.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(origem), "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "48k", str(destino)],
            check=True,
        )
    return destino


def duracao(arq: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(arq)], capture_output=True, text=True)
    return float(out.stdout.strip())


def reconhece(pid: str, audio: Path, modelo: str, refaz: bool) -> list[dict]:
    scribe = RAIZ / "fontes" / "scribe" / f"{pid}.json"
    if scribe.exists() and not refaz:
        d = json.loads(scribe.read_text(encoding="utf-8"))
        return [{"w": w["text"], "s": w["start"], "e": w["end"], "p": 1.0} for w in d.get("words", []) if w.get("type") == "word"]
    cache = RAIZ / "fontes" / "whisper" / f"{pid}.json"
    if cache.exists() and not refaz:
        return json.loads(cache.read_text(encoding="utf-8"))
    # reaproveita o reconhecimento feito por transcreve.py (mesmo modelo), se houver
    outro = RAIZ / "fontes" / "whisper" / f"{pid}-{modelo}.json"
    if outro.exists() and not refaz:
        segs = json.loads(outro.read_text(encoding="utf-8"))
        return [{"w": w["w"], "s": w["s"], "e": w["e"], "p": 1.0} for s in segs for w in s["words"]]
    from faster_whisper import WhisperModel

    m = WhisperModel(modelo, device="cpu", compute_type="int8", cpu_threads=4)
    segs, _info = m.transcribe(
        str(audio),
        language="zh",
        word_timestamps=True,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        initial_prompt="以下是普通话的句子，使用简体中文。",
        beam_size=5,
    )
    palavras = []
    for s in segs:
        for w in s.words or []:
            palavras.append({"w": w.word, "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
        print(f"  {s.end:7.1f}s  {s.text[:60]}", flush=True)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(palavras, ensure_ascii=False), encoding="utf-8")
    return palavras


def normaliza_char(c: str) -> str | None:
    c = textos.trad_para_simp().get(c, c)
    if c in DIGITOS:
        return DIGITOS[c]
    if textos.HAN.match(c):
        return c
    return None


def marca_colapsos(palavras: list[dict]) -> None:
    """O Scribe às vezes empilha uma frase inteira num instante só (≥ 4 palavras seguidas com o mesmo início).
    Essas palavras ainda servem para o alinhamento, mas não para dar tempo: ficam marcadas com "colapso"."""
    k = 0
    while k < len(palavras):
        j = k
        while j + 1 < len(palavras) and abs(palavras[j + 1]["s"] - palavras[k]["s"]) < 0.01:
            j += 1
        if j - k >= 3:
            for w in palavras[k : j + 1]:
                w["colapso"] = True
        k = j + 1


def fluxo(palavras: list[dict]):
    """Caracteres reconhecidos com tempo (distribuindo o tempo da palavra entre seus caracteres).
    O 4º retorno marca os caracteres cujo tempo não presta (palavra colapsada)."""
    chars, ini, fim, ruim = [], [], [], []
    for w in palavras:
        cs = [normaliza_char(c) for c in w["w"]]
        cs = [c for c in cs if c]
        if not cs:
            continue
        d = (w["e"] - w["s"]) / len(cs)
        for k, c in enumerate(cs):
            chars.append(c)
            ini.append(w["s"] + k * d)
            fim.append(w["s"] + (k + 1) * d)
            ruim.append(bool(w.get("colapso")))
    return chars, np.array(ini), np.array(fim), np.array(ruim, dtype=bool)


def envelope(audio: Path) -> np.ndarray:
    """Energia (log RMS) do áudio em quadros de 10 ms."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = len(x) // 80
    return np.log(np.sqrt((x[: n * 80].reshape(n, 80) ** 2).mean(axis=1)) + 1e-4)


def remenda_colapsos(pid: str, audio: Path, palavras: list[dict], modelo: str, centros: list[float]) -> list[dict]:
    """O Scribe às vezes empilha uma frase inteira num instante só (≥ 4 palavras seguidas com o mesmo início) e
    desloca os tempos das vizinhas (uma leitura inteira pode ficar com o tempo da outra). Em volta de cada colapso
    (±30 s, bordas no silêncio) as palavras do Scribe dão lugar às do whisper, rodado em cada trecho de fala
    separadamente (assim ele não engole a 2ª leitura de frases curtas). Cache em fontes/whisper/<ID>-trechos.json.
    `centros`: inícios dos colapsos que caíram dentro de leituras de questão (ver main)."""
    env = envelope(audio)
    fim = len(env) / 100

    def silencio(t: float) -> float:  # meio dos 0,3 s mais silenciosos a até 3 s de t
        i0, i1 = int(max(0.0, t - 3) * 100), int(min(fim, t + 3) * 100)
        if i1 - i0 <= 30:
            return t
        m = np.convolve(env[i0:i1], np.ones(30) / 30, mode="valid")
        return (i0 + int(np.argmin(m)) + 15) / 100

    janelas: list[list[float]] = []
    for c in centros:
        a, b = max(0.0, c - 30), min(fim, c + 30)
        if janelas and a <= janelas[-1][1]:
            janelas[-1][1] = b
        else:
            janelas.append([a, b])
    janelas = [[round(silencio(a) if a > 0 else 0.0, 2), round(silencio(b) if b < fim else fim, 2)] for a, b in janelas]
    # trechos de fala: energia ≥ 15 dB acima do fundo da janela, juntando pausas < 0,4 s, ignorando < 0,15 s e > 20 s
    ilhas = []
    for a, b in janelas:
        e = env[int(a * 100) : int(b * 100)]
        fala = e > np.percentile(e, 10) + 1.73
        i = 0
        while i < len(fala):
            if not fala[i]:
                i += 1
                continue
            j = i
            while j < len(fala) and (fala[j] or fala[j : j + 40].any()):
                j += 1
            if 15 <= j - i <= 2000:
                ilhas.append([round(a + i / 100, 2), round(a + j / 100, 2)])
            i = j
    cache = RAIZ / "fontes" / "whisper" / f"{pid}-trechos.json"
    salvo = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    if salvo.get("modelo") == modelo and salvo.get("ilhas") == ilhas:
        novas = salvo["palavras"]
    else:
        from faster_whisper import WhisperModel

        m = WhisperModel(modelo, device="cpu", compute_type="int8", cpu_threads=2)
        novas = []
        for s0, s1 in ilhas:
            a = max(0.0, s0 - 0.15)
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(a), "-t", str(s1 + 0.15 - a), "-i", str(audio), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                                 capture_output=True, check=True).stdout
            segs, _info = m.transcribe(np.frombuffer(raw, dtype=np.float32).copy(), language="zh", word_timestamps=True,
                                       condition_on_previous_text=False, vad_filter=False, beam_size=5)
            for sg in segs:
                for w in sg.words or []:
                    novas.append({"w": w.word, "s": round(w.start + a, 3), "e": round(w.end + a, 3), "p": round(w.probability, 3)})
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({"modelo": modelo, "janelas": janelas, "ilhas": ilhas, "palavras": novas}, ensure_ascii=False), encoding="utf-8")
    for w in novas:
        w["trecho"] = next((j for j in janelas if j[0] - 1 <= w["s"] < j[1] + 1), janelas[0])
    print(f"  Scribe com tempos colapsados em {', '.join(f'{c:.0f}' for c in centros)} s → whisper-{modelo} em "
          + ", ".join(f"{a:.0f}–{b:.0f} s" for a, b in janelas) + f" ({len(ilhas)} trechos de fala)", flush=True)
    fora = [w for w in palavras if not any(a <= w["s"] < b for a, b in janelas)]
    return sorted(fora + novas, key=lambda w: w["s"])


def confere_leituras(us, tempos) -> list[str]:
    """As duas leituras de uma questão são a mesma gravação tocada duas vezes: em questões com ≥ 2 falas, o
    deslocamento (2ª − 1ª leitura) é o mesmo para todas. Vale o deslocamento da maioria das falas (no empate, o menor:
    a 2ª leitura vem logo depois da 1ª, a pausa de resposta é depois). Fala que foge > 1,5 s dele, ou que ficou sem
    tempo numa leitura, recebe os tempos da outra leitura ± o deslocamento; fica com o tempo a leitura em que a fala
    está mais perto das falas vizinhas."""
    porq: dict[int, dict[int, dict[int, int]]] = {}
    for u, (chave, _t) in enumerate(us):
        if chave[0] == "q":
            porq.setdefault(chave[1], {}).setdefault(chave[3], {})[chave[2]] = u

    def ini(u):
        xs = [x[0] for x in tempos[u] if x]
        return min(xs) if xs else None

    def fim(u):
        xs = [x[1] for x in tempos[u] if x]
        return max(xs) if xs else None

    feitos = []
    for n, falas in sorted(porq.items()):
        if len(falas) < 2 or any(len(p) != 2 for p in falas.values()):
            continue
        desl = {}
        for j, p in falas.items():
            d = [b[0] - a[0] for a, b in zip(tempos[p[1]], tempos[p[2]]) if a and b]
            if d:
                desl[j] = float(np.median(d))
        if not desl or (len(desl) == len(falas) and max(desl.values()) - min(desl.values()) <= 1.5):
            continue
        ref = min(desl.values(), key=lambda c: (-sum(abs(x - c) <= 1.5 for x in desl.values()), c))
        for j, p in sorted(falas.items()):
            if j in desl and abs(desl[j] - ref) <= 1.5:
                continue
            tem1, tem2 = any(tempos[p[1]]), any(tempos[p[2]])
            if tem1 and tem2:  # a leitura ruim é a que fica longe das falas vizinhas
                def afastamento(lei):
                    g = []
                    if j - 1 in falas and fim(falas[j - 1][lei]) is not None:
                        g.append(abs(ini(p[lei]) - fim(falas[j - 1][lei])))
                    if j + 1 in falas and ini(falas[j + 1][lei]) is not None:
                        g.append(abs(ini(falas[j + 1][lei]) - fim(p[lei])))
                    return max(g, default=0.0)

                ruim = 2 if afastamento(2) >= afastamento(1) else 1
            elif tem1 or tem2:
                ruim = 2 if tem1 else 1
            else:
                continue
            boa, sinal = (1, 1) if ruim == 2 else (2, -1)
            tempos[p[ruim]] = [[x[0] + sinal * ref, x[1] + sinal * ref] if x else None for x in tempos[p[boa]]]
            feitos.append(f"Q{n} fala {j + 1} da {ruim}ª leitura")
    return feitos


def unidades(prova: dict):
    """Sequência esperada no áudio: (chave, texto). Cada questão aparece duas vezes."""
    q = {x["n"]: x for x in prova["questoes"]}
    out = []
    for i, s in enumerate(prova.get("roteiro") or []):
        if s["tipo"] == "instrucao":
            out.append((("seg", i, 0), s["texto"]))
        elif s["tipo"] == "exemplo":
            for j, f in enumerate(s["falas"]):
                out.append((("ex", i, j), f["txt"]))
        elif s["tipo"] == "questao":
            n = s["n"]
            for leitura in (1, 2):
                for j, f in enumerate(q[n].get("audioTexto") or []):
                    out.append((("q", n, leitura, j), f["txt"]))
    return out


def sem_tom(c: str) -> str:
    return lazy_pinyin(c, style=Style.NORMAL)[0]


def alinha(esperado: list[str], recon: list[str]):
    """DP semi-global vetorizada. Retorna, para cada caractere esperado, o índice no reconhecido (ou -1) e o tipo."""
    N, M = len(esperado), len(recon)
    vocab: dict[str, int] = {}
    pyv: dict[str, int] = {}

    def cod(c):
        return vocab.setdefault(c, len(vocab))

    def codp(c):
        return pyv.setdefault(sem_tom(c), len(pyv))

    E = np.array([cod(c) for c in esperado], dtype=np.int32)
    R = np.array([cod(c) for c in recon], dtype=np.int32)
    EP = np.array([codp(c) for c in esperado], dtype=np.int32)
    RP = np.array([codp(c) for c in recon], dtype=np.int32)

    gE, gS = -1.0, -0.5  # pular caractere esperado / pular caractere reconhecido
    Hprev = np.zeros(M + 1, dtype=np.float32)
    dirs = np.zeros((N + 1, M + 1), dtype=np.uint8)  # 0 diag, 1 cima, 2 esquerda
    dirs[0, 1:] = 2
    k = np.arange(M + 1, dtype=np.float32)
    for i in range(1, N + 1):
        sc = np.where(R == E[i - 1], 2.0, np.where(RP == EP[i - 1], 1.0, -1.0)).astype(np.float32)
        D = np.empty(M + 1, dtype=np.float32)
        D[0] = Hprev[0] + gE
        diag = Hprev[:-1] + sc
        cima = Hprev[1:] + gE
        D[1:] = np.maximum(diag, cima)
        Hcur = k * gS + np.maximum.accumulate(D - k * gS)
        d = np.full(M + 1, 2, dtype=np.uint8)
        igual = np.isclose(Hcur, D)
        de_d = np.zeros(M + 1, dtype=bool)
        de_d[1:] = diag >= cima
        d[igual & de_d] = 0
        d[igual & ~de_d] = 1
        d[0] = 1
        dirs[i] = d
        Hprev = Hcur
    j = int(np.argmax(Hprev))
    i = N
    par = np.full(N, -1, dtype=np.int64)
    tipo = np.zeros(N, dtype=np.int8)  # 2 igual, 1 homófono, -1 trocado, 0 sem par
    while i > 0 and j >= 0:
        d = dirs[i, j]
        if d == 0 and j > 0:
            par[i - 1] = j - 1
            tipo[i - 1] = 2 if E[i - 1] == R[j - 1] else (1 if EP[i - 1] == RP[j - 1] else -1)
            i, j = i - 1, j - 1
        elif d == 1 or j == 0:
            i -= 1
        else:
            j -= 1
    return par, tipo


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    pid = args[0]
    modelo = args[args.index("--modelo") + 1] if "--modelo" in args else "small"
    refaz = "--refaz" in args

    prova = json.loads((RAIZ / "data" / "provas" / f"{pid}.json").read_text(encoding="utf-8"))
    audio = prepara_audio(pid)
    dur = duracao(audio)
    print(f"{pid}: áudio {dur/60:.1f} min → reconhecendo com whisper-{modelo}…", flush=True)
    palavras = reconhece(pid, audio, modelo, refaz)
    marca_colapsos(palavras)
    rc, ri, rf, rruim = fluxo(palavras)

    # sequência esperada, caractere a caractere, lembrando de onde veio cada um
    us = unidades(prova)
    esp, origem = [], []  # origem: (índice da unidade, posição no texto original)
    for u, (_chave, txt) in enumerate(us):
        for pos, c in enumerate(txt):
            cn = normaliza_char(c)
            if cn:
                esp.append(cn)
                origem.append((u, pos))
    print(f"  alinhando {len(esp)} caracteres esperados × {len(rc)} reconhecidos…", flush=True)
    par, tipo = alinha(esp, rc)
    # leitura de questão caída em palavras colapsadas do Scribe: refaz o tempo desses trechos com o whisper e realinha
    eq = np.array([us[u][0][0] == "q" for u, _pos in origem], dtype=bool)
    centros = sorted({round(float(ri[j]), 2) for j in par[(par >= 0) & eq] if rruim[j]})
    if centros:
        palavras = remenda_colapsos(pid, audio, palavras, modelo, centros)
        marca_colapsos(palavras)
        rc, ri, rf, rruim = fluxo(palavras)
        par, tipo = alinha(esp, rc)

    # tempos por unidade/caractere (interpolando os sem par dentro da unidade)
    tempos: list[list[list[float] | None]] = [[None] * len(t) for _, t in us]
    qualidade = [[0, 0] for _ in us]
    for k, (u, pos) in enumerate(origem):
        qualidade[u][1] += 1
        if par[k] >= 0 and tipo[k] > 0:
            qualidade[u][0] += 1
        if par[k] >= 0 and tipo[k] != 0 and not (eq[k] and rruim[par[k]]):
            tempos[u][pos] = [float(ri[par[k]]), float(rf[par[k]])]
    for u, (chave, txt) in enumerate(us):
        t = tempos[u]
        conhecidos = [i for i, x in enumerate(t) if x]
        if chave[0] == "q" and len(conhecidos) >= 3:
            # caractere casado a mais de 4 s de todos os outros da mesma fala (ex.: o último caractere trocado
            # pelo número da questão seguinte, já depois da pausa): o tempo dele não presta
            longe = [i for i in conhecidos if min(abs(t[i][0] - t[c][0]) for c in conhecidos if c != i) > 4.0]
            for i in longe:
                t[i] = None
            conhecidos = [i for i in conhecidos if i not in longe]
            # idem na ponta da fala: primeiro/último caractere separado do vizinho por > 1,8 s de silêncio
            while len(conhecidos) >= 3 and t[conhecidos[-1]][0] - t[conhecidos[-2]][1] > 1.8:
                t[conhecidos.pop()] = None
            while len(conhecidos) >= 3 and t[conhecidos[1]][0] - t[conhecidos[0]][1] > 1.8:
                t[conhecidos.pop(0)] = None
        if len(conhecidos) < max(2, 0.3 * sum(1 for c in txt if normaliza_char(c))):
            tempos[u] = [None] * len(txt)  # alinhamento fraco: melhor não inventar
            continue
        for i in range(len(t)):
            if t[i] is None and normaliza_char(txt[i]):
                antes = max((c for c in conhecidos if c < i), default=None)
                depois = min((c for c in conhecidos if c > i), default=None)
                if antes is not None and depois is not None:
                    a, b = t[antes][1], t[depois][0]
                    f = (i - antes) / (depois - antes)
                    x = a + (b - a) * f
                    t[i] = [x, x + max(0.05, (b - a) / (depois - antes))]
                elif antes is not None:
                    x = t[antes][1]
                    t[i] = [x, x + 0.2]
                elif depois is not None:
                    x = t[depois][0]
                    t[i] = [max(0, x - 0.2), x]
    gemeas = confere_leituras(us, tempos)

    # agrega por questão/segmento
    def faixa(listas):
        vals = [c for l in listas for c in l if c]
        return (min(v[0] for v in vals), max(v[1] for v in vals)) if vals else (None, None)

    res = {"duracao": dur, "modelo": modelo, "questoes": {}, "segmentos": [], "qualidade": {}}
    remendos = sorted({tuple(w["trecho"]) for w in palavras if w.get("trecho")})
    if remendos:  # trechos em que o tempo veio do whisper, não do Scribe (ver remenda_colapsos)
        res["remendos"] = [list(x) for x in remendos]
    if gemeas:  # falas cujo tempo veio da outra leitura (ver confere_leituras)
        res["gemeas"] = gemeas
    porq: dict[int, dict] = {}
    porseg: dict[int, dict] = {}
    for u, (chave, txt) in enumerate(us):
        ok, tot = qualidade[u]
        if chave[0] == "q":
            _, n, leitura, j = chave
            d = porq.setdefault(n, {"falas": [], "falas2": []})
            (d["falas"] if leitura == 1 else d["falas2"]).append(tempos[u])
            res["qualidade"].setdefault(str(n), [0, 0])
            res["qualidade"][str(n)][0] += ok
            res["qualidade"][str(n)][1] += tot
        else:
            _, i, j = chave
            d = porseg.setdefault(i, {"falas": [], "chars": None})
            if chave[0] == "ex":
                d["falas"].append(tempos[u])
            else:
                d["chars"] = tempos[u]
    for n, d in porq.items():
        s, e = faixa(d["falas"])
        s2, e2 = faixa(d["falas2"])
        reg = {"falas": d["falas"], "falas2": d["falas2"]}
        if s is not None:
            reg["s"], reg["e"] = max(0.0, s - 0.25), e + 0.35
        if s2 is not None:
            reg["s2"], reg["e2"] = max(0.0, s2 - 0.25), e2 + 0.35
        if s is not None and s2 is not None and reg["e"] > reg["s2"]:
            reg["e"] = reg["s2"] = (e + s2) / 2
        res["questoes"][str(n)] = reg
    for i, s in enumerate(prova.get("roteiro") or []):
        d = porseg.get(i)
        reg = {}
        if d:
            listas = d["falas"] if d["falas"] else [d["chars"] or []]
            a, b = faixa(listas)
            if a is not None:
                reg = {"s": max(0.0, a - 0.2), "e": b + 0.3}
            if d["falas"]:
                reg["falas"] = d["falas"]
            if d["chars"]:
                reg["chars"] = d["chars"]
        res["segmentos"].append(reg)

    saida = RAIZ / "data" / "alinhamento" / f"{pid}.json"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")

    # relatório (HSK 3: questões 1–40 no áudio; HSK 1: 1–20)
    nums = sorted(s["n"] for s in prova.get("roteiro") or [] if s["tipo"] == "questao") or list(range(1, 41))
    ruins = []
    for n in nums:
        ok, tot = res["qualidade"].get(str(n), [0, 1])
        r = res["questoes"].get(str(n), {})
        if tot == 0 or ok / tot < 0.6 or "s" not in r or "s2" not in r:
            ruins.append(f"{n} ({ok}/{tot}{'' if 's2' in r else ', sem 2ª leitura'})")
    total_ok = sum(v[0] for v in res["qualidade"].values())
    total = sum(v[1] for v in res["qualidade"].values()) or 1
    print(f"{pid}: {total_ok}/{total} caracteres das questões casados ({100*total_ok/total:.1f}%); questões fracas: {', '.join(ruins) or 'nenhuma'}")
    if gemeas:
        print("  tempo copiado da outra leitura: " + ", ".join(gemeas))
    ordem = [res["questoes"].get(str(n), {}).get("s") for n in nums]
    if any(a is not None and b is not None and b < a for a, b in zip(ordem, ordem[1:])):
        print("  ATENÇÃO: questões fora de ordem no tempo")


if __name__ == "__main__":
    main()
