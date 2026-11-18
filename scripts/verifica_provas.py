"""Checagens estruturais das provas extraídas (data/provas/<ID>.json).

    python scripts/verifica_provas.py [<ID> ...]   (sem IDs: todas)

HSK 1 e HSK 2 são conferidos pelo `verifica` de parse_hsk1.py / parse_hsk2.py.
Para o HSK 3, confere o que o formato garante: quantidade de opções, letras únicas por grupo,
exemplo não reutilizado, peças do "ordenar" = frase do gabarito, etc.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PONT = re.compile(r"[，。？！、：；“”‘’（）《》…—\s.,!?;:]")


def verifica(p: dict, exige_transcricao: bool = True) -> list[str]:
    e: list[str] = []
    q = {x["n"]: x for x in p["questoes"]}
    G = p["grupos"]
    if len(q) != 80:
        e.append(f"{len(q)} questões (esperado 80)")

    # ----- grupos
    for g, letras_ops, ex in (("R1a", "ABCDEF", True), ("R1b", "ABCDE", False), ("R2a", "ABCDEF", True), ("R2b", "ABCDEF", True)):
        ops = (G.get(g) or {}).get("opcoes") or {}
        if "".join(sorted(ops)) != letras_ops:
            e.append(f"{g}: opções {sorted(ops)} (esperado {letras_ops})")
        for l, t in ops.items():
            if not t or len(t) > 60:
                e.append(f"{g} opção {l} suspeita: {t!r}")
        exm = (G.get(g) or {}).get("exemplo")
        if ex and not (exm and exm.get("resposta")):
            e.append(f"{g}: sem exemplo/resposta do exemplo")
    for g, n_imgs in (("L1a", 6), ("L1b", 5)):
        ims = (G.get(g) or {}).get("imagens") or {}
        if len(ims) != n_imgs:
            e.append(f"{g}: {len(ims)} figuras (esperado {n_imgs})")
    if (G.get("L1a") or {}).get("exemploUsa") is None:
        e.append("L1a: letra do exemplo não encontrada")

    # ----- respostas por grupo: únicas e diferentes do exemplo
    def grupo_unico(nums, letras, exemplo):
        rs = [q[n].get("resposta") for n in nums if n in q]
        c = Counter(rs)
        rep = [r for r, k in c.items() if k > 1]
        if rep:
            e.append(f"questões {nums[0]}–{nums[-1]}: letra repetida no gabarito {rep}")
        for n in nums:
            r = q.get(n, {}).get("resposta")
            if not isinstance(r, str) or r not in letras:
                e.append(f"{n}: resposta {r!r} fora de {letras}")
            if exemplo and r == exemplo:
                e.append(f"{n}: resposta igual à letra do exemplo ({exemplo})")

    grupo_unico(range(1, 6), "ABCDEF", (G.get("L1a") or {}).get("exemploUsa"))
    grupo_unico(range(6, 11), "ABCDE", None)
    grupo_unico(range(41, 46), "ABCDEF", ((G.get("R1a") or {}).get("exemplo") or {}).get("resposta"))
    grupo_unico(range(46, 51), "ABCDE", None)
    grupo_unico(range(51, 56), "ABCDEF", ((G.get("R2a") or {}).get("exemplo") or {}).get("resposta"))
    grupo_unico(range(56, 61), "ABCDEF", ((G.get("R2b") or {}).get("exemplo") or {}).get("resposta"))

    for n in range(11, 21):
        x = q.get(n, {})
        if not isinstance(x.get("resposta"), bool):
            e.append(f"{n}: resposta V/F inválida {x.get('resposta')!r}")
        if not x.get("afirmacao"):
            e.append(f"{n}: sem afirmação ★")
    for n in list(range(21, 41)) + list(range(61, 71)):
        x = q.get(n, {})
        if "".join(sorted(x.get("opcoes") or {})) != "ABC":
            e.append(f"{n}: opções {x.get('opcoes')}")
        if x.get("resposta") not in ("A", "B", "C"):
            e.append(f"{n}: resposta {x.get('resposta')!r}")
    for n in range(61, 71):
        x = q.get(n, {})
        if not x.get("texto") or not x.get("pergunta"):
            e.append(f"{n}: texto/pergunta faltando")
    for n in range(41, 61):
        if not q.get(n, {}).get("enunciado"):
            e.append(f"{n}: sem enunciado")
    for n in range(51, 61):
        if "（＿＿）" not in (q.get(n, {}).get("enunciado") or ""):
            e.append(f"{n}: enunciado sem lacuna")
    for n in range(71, 76):
        x = q.get(n, {})
        pecas = "".join(x.get("pecas") or [])
        resp = x.get("resposta") or ""
        if Counter(PONT.sub("", pecas)) != Counter(PONT.sub("", resp)):
            e.append(f"{n}: peças {x.get('pecas')} ≠ resposta {resp!r}")
    for n in range(76, 81):
        x = q.get(n, {})
        if not x.get("pinyin") or x.get("antes") is None or not x.get("depois") and x.get("depois") != "":
            e.append(f"{n}: frase/pinyin incompletos {x.get('antes')!r} {x.get('pinyin')!r} {x.get('depois')!r}")
        if not x.get("resposta") or len(x["resposta"]) != 1:
            e.append(f"{n}: resposta {x.get('resposta')!r}")

    # ----- transcrição
    if exige_transcricao:
        for n in range(1, 41):
            f = q.get(n, {}).get("audioTexto") or []
            if not f:
                e.append(f"{n}: sem transcrição")
                continue
            if n <= 10 and len(f) < 2:
                e.append(f"{n}: diálogo com {len(f)} fala(s)")
            if 11 <= n <= 20 and not any(x["fal"] == "★" for x in f):
                e.append(f"{n}: transcrição sem ★")
            if n >= 21 and not any(x["fal"] == "问" for x in f):
                e.append(f"{n}: transcrição sem 问")
            for x in f:
                if not x["txt"] or len(x["txt"]) > 160:
                    e.append(f"{n}: fala suspeita {x['txt'][:40]!r}…")
        if not p.get("roteiro"):
            e.append("sem roteiro do áudio")
    return e


def por_nivel(p: dict) -> list[str]:
    """HSK 3 usa as checagens daqui; HSK 1 e 2 usam as do próprio parser (formatos diferentes)."""
    nivel = p.get("nivel") or int(p["id"][1])
    if nivel == 1:
        import parse_hsk1

        return parse_hsk1.verifica(p)
    if nivel == 2:
        import parse_hsk2

        return parse_hsk2.verifica(p)
    return verifica(p)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    sys.stdout.reconfigure(encoding="utf-8")
    ids = sys.argv[1:] or sorted(a.stem for a in (RAIZ / "data" / "provas").glob("H*.json"))
    for pid in ids:
        p = json.loads((RAIZ / "data" / "provas" / f"{pid}.json").read_text(encoding="utf-8"))
        es = por_nivel(p)
        print(f"{pid}: {'OK' if not es else f'{len(es)} problema(s)'}")
        for x in es:
            print("   -", x)
