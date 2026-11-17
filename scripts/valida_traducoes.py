"""Valida data/traducoes/<ID>.json contra data/trabalho/<ID>-frases.json e a prova.

    python scripts/valida_traducoes.py <ID> [<ID> ...]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
HAN = re.compile(r"[㐀-鿿]")


def textos_da_questao(p: dict, q: dict) -> str:
    partes = []
    for f in q.get("audioTexto") or []:
        partes.append(f["txt"])
    for k in ("afirmacao", "pergunta", "texto", "enunciado", "resposta", "antes", "depois"):
        if isinstance(q.get(k), str):
            partes.append(q[k])
    partes.extend((q.get("opcoes") or {}).values())
    partes.extend(q.get("pecas") or [])
    g = p["grupos"].get(q.get("grupo") or "", {})
    partes.extend((g.get("opcoes") or {}).values())
    if q["tipo"] == "hanzi":
        partes.append(f"{q.get('antes') or ''}{q.get('resposta') or ''}{q.get('depois') or ''}")
    return "\n".join(partes)


def valida(pid: str) -> list[str]:
    erros: list[str] = []
    arq = RAIZ / "data" / "traducoes" / f"{pid}.json"
    if not arq.exists():
        return [f"{arq} não existe"]
    try:
        tr = json.loads(arq.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"JSON inválido: {e}"]
    itens = json.loads((RAIZ / "data" / "trabalho" / f"{pid}-frases.json").read_text(encoding="utf-8"))
    p = json.loads((RAIZ / "data" / "provas" / f"{pid}.json").read_text(encoding="utf-8"))
    frases, lacunas = tr.get("frases", {}), tr.get("lacunas", {})
    for it in itens:
        alvo = lacunas if it.get("lacuna") else frases
        nome = "lacunas" if it.get("lacuna") else "frases"
        v = alvo.get(it["zh"])
        if not v or not str(v).strip():
            erros.append(f"{nome}: falta tradução de {it['zh']!r} ({it['ctx']})")
        elif HAN.search(v):
            erros.append(f"{nome}: tradução com caracteres chineses: {it['zh']!r} → {v!r}")
        if it.get("lacuna") and v and "___" not in v:
            erros.append(f"lacunas: sem ___ em {it['zh']!r} → {v!r}")
    conhecidas = {it["zh"] for it in itens}
    for k in list(frases) + list(lacunas):
        if k not in conhecidas:
            erros.append(f"chave desconhecida (zh alterado?): {k!r}")
    qs = tr.get("questoes", {})
    for q in p["questoes"]:
        n = str(q["n"])
        e = qs.get(n)
        if not e:
            erros.append(f"questão {n}: sem explicação")
            continue
        if not e.get("explicacao") or len(e["explicacao"]) < 25:
            erros.append(f"questão {n}: explicação vazia/curta")
        base = textos_da_questao(p, q)
        t = e.get("trecho")
        if not t:
            erros.append(f"questão {n}: sem trecho")
        elif t not in base:
            erros.append(f"questão {n}: trecho não aparece literalmente nos textos: {t!r}")
        pal = e.get("palavras") or []
        if not (1 <= len(pal) <= 4):
            erros.append(f"questão {n}: 'palavras' deve ter 1–4 itens")
        for w in pal:
            if w not in base:
                erros.append(f"questão {n}: palavra {w!r} não aparece nos textos da questão")
    for n, alts in (tr.get("aceitas") or {}).items():
        q = next((x for x in p["questoes"] if str(x["n"]) == n), None)
        if not q or q["tipo"] != "ordenar":
            erros.append(f"aceitas: {n} não é questão de ordenar")
            continue
        pecas = sorted(q.get("pecas") or [])
        for a in alts:
            a2 = re.sub(r"[。？！.?!]$", "", a)
            if sorted(a2) != sorted(re.sub(r"[。？！.?!]$", "", "".join(pecas))):
                erros.append(f"aceitas {n}: {a!r} não usa exatamente as peças {pecas}")
    return erros


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ruim = False
    for pid in sys.argv[1:]:
        es = valida(pid)
        if es:
            ruim = True
            print(f"{pid}: {len(es)} problema(s)")
            for e in es[:80]:
                print("  -", e)
        else:
            print(f"{pid}: OK")
    sys.exit(1 if ruim else 0)
