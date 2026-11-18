"""HSKK — acha no áudio original de cada prova onde fica cada frase e cada janela de resposta.

    python scripts/hskk/tempos.py <ID> [<ID> ...]      (sem IDs = todas de data/hskk/provas/)

Entradas:
  data/hskk/provas/<ID>.json     — as 10 frases do 第一部分 (texto de referência)
  fontes/scribe/hskk/<ID>.json   — transcrição do ElevenLabs Scribe com tempo por caractere (scripts/hskk/scribe.py)
  fontes/audio/hskk/<ID>.mp3     — áudio original (o ffmpeg silencedetect acha os blocos de som/silêncio)

Saída: data/hskk/tempos/<ID>.json
  aquecimento: [{zh, s, e, rs, re}]    perguntas iniciais (nome, país, nº de inscrição) — não valem nota
  q: {n: {p, s, e, bip, rs, re, chars}} p = início do número falado, [s,e] = a frase, bip = fim do "嘀",
                                        [rs,re] = janela em que o candidato responde (gravação),
                                        chars = tempo [início, fim] de cada caractere da frase (karaokê)
  preparo: {s, e}                      os 10 minutos de preparação das questões 11–14
  q11..q14 em q: {p, rs, re}           p = início da instrução "现在开始第N题", [rs,re] = os ~2 min de resposta
  fim: instante do "考试现在结束"

Confere sozinho: frases que não batem com o que o Scribe ouviu, janelas com duração estranha.
"""
from __future__ import annotations

import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATA = RAIZ / "data" / "hskk"
AUDIO = RAIZ / "fontes" / "audio" / "hskk"
SCRIBE = RAIZ / "fontes" / "scribe" / "hskk"
HAN = re.compile(r"[㐀-鿿]")
DIG = {"0": "零", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九"}


def le(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def blocos_de_som(pid: str) -> list[tuple[float, float]]:
    """Intervalos com som (o complemento do silencedetect)."""
    cache = SCRIBE / f"{pid}-blocos.json"
    if cache.exists():
        return [tuple(b) for b in le(cache)]
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(AUDIO / f"{pid}.mp3"), "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    ss = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    se = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    out, prev = [], 0.0
    for a, b in zip(ss, se):
        if a > prev + 0.01:
            out.append((round(prev, 3), round(a, 3)))
        prev = b
    out.append((round(prev, 3), round(prev + 0.5, 3)))
    cache.write_text(json.dumps(out), encoding="utf-8")
    return out


def chars_scribe(pid: str) -> list[tuple[str, float, float]]:
    """Caracteres chineses ouvidos pelo Scribe, cada um com [início, fim]. Algarismos viram 一二三…"""
    d = le(SCRIBE / f"{pid}.json")
    out = []
    for w in d["words"]:
        if w["type"] != "word":
            continue
        txt = "".join(DIG.get(c, c) for c in w["text"])
        cs = [c for c in txt if HAN.match(c)]
        if not cs:
            continue
        passo = (w["end"] - w["start"]) / len(cs)
        for i, c in enumerate(cs):
            out.append((c, w["start"] + i * passo, w["start"] + (i + 1) * passo))
    return out


def so_han(t: str) -> str:
    return "".join(HAN.findall(unicodedata.normalize("NFKC", t)))


def acha_frase(alvo: str, S: str, desde: int) -> tuple[int, int, float]:
    """Melhor janela de S (a partir de `desde`) parecida com `alvo`: (ini, fim, semelhança)."""
    melhor = (desde, desde, 0.0)
    L = len(alvo)
    for i in range(desde, min(len(S), desde + 600)):
        for dl in range(-3, 4):
            j = i + L + dl
            if j <= i or j > len(S):
                continue
            r = difflib.SequenceMatcher(None, alvo, S[i:j], autojunk=False).ratio()
            if r > melhor[2] + 1e-9:
                melhor = (i, j, r)
    return melhor


def bloco_em(blocos, t: float, folga=0.25):
    for b in blocos:
        if b[0] - folga <= t <= b[1] + folga:
            return b
    return None


def processa(pid: str):
    prova = le(DATA / "provas" / f"{pid}.json")
    blocos = blocos_de_som(pid)
    cs = chars_scribe(pid)
    S = "".join(c for c, _, _ in cs)
    avisos: list[str] = []
    q: dict[str, dict] = {}

    # ---------------------------------------------------------- aquecimento
    aquec = []
    for zh in ("你叫什么名字", "你是哪国人", "你的序号是多少"):
        k = S.find(zh)
        if k < 0:
            avisos.append(f"aquecimento「{zh}」não achado")
            continue
        fim = cs[k + len(zh) - 1][2]
        b = bloco_em(blocos, fim) or (fim, fim)
        prox = next((x for x in blocos if x[0] > b[1] + 0.5), None)
        aquec.append({"zh": zh + "？", "s": round(cs[k][1] - 0.3, 2), "e": round(b[1], 2), "rs": round(b[1] + 0.1, 2), "re": round((prox[0] if prox else b[1] + 8) - 0.1, 2)})

    # ---------------------------------------------------------- 第一部分
    cursor = S.find("重复") if "重复" in S else 0
    for item in prova["parte1"]:
        n = item["n"]
        alvo = so_han(item["zh"])
        i, j, r = acha_frase(alvo, S, cursor)
        ouvido = S[i:j]
        if ouvido != alvo:
            ops = [f"{op} 「{alvo[a1:a2]}」→「{ouvido[b1:b2]}」" for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, alvo, ouvido, autojunk=False).get_opcodes() if op != "equal"]
            avisos.append(f"q{n} texto ≠ Scribe ({r:.2f}): {'; '.join(ops)}")
        if r < 0.6:
            avisos.append(f"q{n} NÃO ACHADA (semelhança {r:.2f})")
            continue
        cursor = j
        # tempo de cada caractere do alvo (pelo alinhamento com o que o Scribe ouviu)
        sm = difflib.SequenceMatcher(None, alvo, ouvido, autojunk=False)
        tempos: list[list[float] | None] = [None] * len(alvo)
        for a, b, size in sm.get_matching_blocks():
            for k in range(size):
                c = cs[i + b + k]
                tempos[a + k] = [round(c[1], 2), round(c[2], 2)]
        s = cs[i][1]
        e = cs[j - 1][2]
        bs = bloco_em(blocos, s)
        be = bloco_em(blocos, e)
        s = min(s, bs[0]) - 0.1 if bs else s - 0.2
        e = max(e, be[1]) + 0.1 if be else e + 0.3
        # o número da questão ("一、") é o bloco curto logo antes da frase
        ant = [b for b in blocos if b[1] < s + 0.05 and b[1] > s - 3]
        p = ant[-1][0] - 0.1 if ant and ant[-1][1] - ant[-1][0] < 0.8 else s - 1.4
        # o "嘀" (prova nova): bloco de ~0,6 s logo depois da frase
        bip = next((b for b in blocos if e - 0.05 < b[0] < e + 3.5 and 0.45 < b[1] - b[0] < 0.8), None)
        rs = (bip[1] + 0.05) if bip else e + 0.1
        q[str(n)] = {"p": round(p, 2), "s": round(s, 2), "e": round(e, 2), **({"bip": round(bip[1], 2)} if bip else {}), "rs": round(rs, 2), "chars": tempos}

    for n in range(1, 11):
        a = q.get(str(n))
        if not a:
            continue
        b = q.get(str(n + 1))
        if b:
            a["re"] = round(b["p"] - 0.1, 2)
        else:
            prox = next((x for x in blocos if x[0] > a["rs"] + 0.3), None)
            a["re"] = round(prox[0] - 0.1, 2) if prox else round(a["rs"] + 10, 2)
        d = a["re"] - a["rs"]
        if not 5 <= d <= 16:
            avisos.append(f"q{n} janela de resposta estranha: {d:.1f} s")

    # ---------------------------------------------------------- preparação e 11–14
    k = S.find("十分钟")
    if k < 0:
        k = S.find("准备时间为")
    fim_instr = cs[k + 2][2] if k >= 0 else q["10"]["re"] + 10
    b = bloco_em(blocos, fim_instr)
    prep_s = round((b[1] if b else fim_instr) + 0.1, 2)
    # grupos de fala depois da preparação (instruções "现在开始第N题")
    depois = [x for x in blocos if x[0] > prep_s]
    grupos: list[list[tuple[float, float]]] = []
    for x in depois:
        if grupos and x[0] - grupos[-1][-1][1] < 1.5:
            grupos[-1].append(x)
        else:
            grupos.append([x])
    instr = [g for g in grupos if any(y[1] - y[0] >= 1.0 for y in g)]
    if len(instr) < 5:
        avisos.append(f"só {len(instr)} instruções depois da preparação (esperava 5)")
    else:
        instr = instr[:5]
        prep_e = instr[0][0][0]
        if not 580 <= prep_e - prep_s <= 620:
            avisos.append(f"preparação com {prep_e - prep_s:.0f} s")
        for idx, n in enumerate(range(11, 15)):
            g, h = instr[idx], instr[idx + 1]
            rs, re_ = g[-1][1] + 0.1, h[0][0] - 0.1
            q[str(n)] = {"p": round(g[0][0] - 0.1, 2), "rs": round(rs, 2), "re": round(re_, 2)}
            if not 105 <= re_ - rs <= 130:
                avisos.append(f"q{n} janela de {re_ - rs:.0f} s")
        out_fim = instr[4][-1][1]
    preparo = {"s": prep_s, "e": round(instr[0][0][0] - 0.1, 2)} if len(instr) >= 5 else None
    res = {"aquecimento": aquec, "q": q, "preparo": preparo, "fim": round(out_fim + 0.5, 2) if len(instr) >= 5 else None}
    dest = DATA / "tempos" / f"{pid}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    jan = " ".join(f"{n}:{q[str(n)]['re'] - q[str(n)]['rs']:.0f}s" for n in range(1, 15) if str(n) in q and "re" in q[str(n)])
    print(f"{pid}: preparo {preparo and round(preparo['e'] - preparo['s'])} s | janelas {jan} | bip: {'sim' if 'bip' in q.get('1', {}) else 'não'}")
    for a in avisos:
        print("   ⚠", a)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ids = sys.argv[1:] or sorted(p.stem for p in (DATA / "provas").glob("*.json"))
    for pid in ids:
        processa(pid)
