"""Alinha o áudio original da prova com a transcrição oficial, caractere a caractere.

    python scripts/alinha.py <ID> [--modelo small] [--refaz]

1. Converte o áudio (fontes/audio/<ID>.mp3) para o formato servido pelo app
   (public/audio/<ID>.mp3, mono 48 kbps CBR — busca precisa no navegador).
2. Reconhece a fala com faster-whisper (timestamps por palavra) — cache em fontes/whisper/<ID>.json.
3. Alinha a sequência esperada (instruções, exemplos e cada questão LIDA DUAS VEZES)
   contra o texto reconhecido com programação dinâmica semi-global (vetorizada em numpy):
   caractere igual +2, homófono (mesmo pinyin sem tom) +1, diferente −1,
   lacuna no áudio −1, caractere extra no áudio −0,5.
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


def fluxo(palavras: list[dict]):
    """Caracteres reconhecidos com tempo (distribuindo o tempo da palavra entre seus caracteres)."""
    chars, ini, fim = [], [], []
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
    return chars, np.array(ini), np.array(fim)


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
    rc, ri, rf = fluxo(palavras)

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

    # tempos por unidade/caractere (interpolando os sem par dentro da unidade)
    tempos: list[list[list[float] | None]] = [[None] * len(t) for _, t in us]
    qualidade = [[0, 0] for _ in us]
    for k, (u, pos) in enumerate(origem):
        qualidade[u][1] += 1
        if par[k] >= 0 and tipo[k] > 0:
            qualidade[u][0] += 1
        if par[k] >= 0 and tipo[k] != 0:
            tempos[u][pos] = [float(ri[par[k]]), float(rf[par[k]])]
    for u, (_c, txt) in enumerate(us):
        t = tempos[u]
        conhecidos = [i for i, x in enumerate(t) if x]
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

    # agrega por questão/segmento
    def faixa(listas):
        vals = [c for l in listas for c in l if c]
        return (min(v[0] for v in vals), max(v[1] for v in vals)) if vals else (None, None)

    res = {"duracao": dur, "modelo": modelo, "questoes": {}, "segmentos": [], "qualidade": {}}
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

    # relatório
    ruins = []
    for n in range(1, 41):
        ok, tot = res["qualidade"].get(str(n), [0, 1])
        r = res["questoes"].get(str(n), {})
        if tot == 0 or ok / tot < 0.6 or "s" not in r or "s2" not in r:
            ruins.append(f"{n} ({ok}/{tot}{'' if 's2' in r else ', sem 2ª leitura'})")
    total_ok = sum(v[0] for v in res["qualidade"].values())
    total = sum(v[1] for v in res["qualidade"].values()) or 1
    print(f"{pid}: {total_ok}/{total} caracteres das questões casados ({100*total_ok/total:.1f}%); questões fracas: {', '.join(ruins) or 'nenhuma'}")
    ordem = [res["questoes"].get(str(n), {}).get("s") for n in range(1, 41)]
    if any(a is not None and b is not None and b < a for a, b in zip(ordem, ordem[1:])):
        print("  ATENÇÃO: questões fora de ordem no tempo")


if __name__ == "__main__":
    main()
