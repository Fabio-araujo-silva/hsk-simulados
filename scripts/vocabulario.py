"""Vocabulário do HSK 1 a 3 (formato 2.0) para a aba Vocabulário do app.

As listas vieram da página de revisão hsk3-revisao.html (constantes DADOS1, DADOS2 e DADOS3) e ficam em
data/vocabulario/hsk1.txt, hsk2.txt e hsk3.txt: uma palavra por linha, "汉字|pinyin|significado", na ordem
da página. HSK 2 e HSK 3 trazem só as palavras novas de cada nível.

Comandos:
  python scripts/vocabulario.py                 → public/conteudo/vocabulario.json (a partir dos .txt)
  python scripts/vocabulario.py extrai <html>   → (re)cria os .txt a partir das listas da página
  python scripts/vocabulario.py confere <html>  → confere se os .txt batem linha a linha com a página

Cada item do JSON: {"hz", "py", "pt", "nivel", "n"}, com n = posição (1, 2, 3…) na lista do nível.
As marcações do app usam a chave "汉字|pinyin": duas linhas com a mesma chave dividiriam a marcação,
por isso o script recusa duplicatas.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PASTA = RAIZ / "data" / "vocabulario"
SAIDA = RAIZ / "public" / "conteudo" / "vocabulario.json"
NIVEIS = (1, 2, 3)


def arquivo(nivel: int) -> Path:
    return PASTA / f"hsk{nivel}.txt"


def listas_da_pagina(html: Path) -> dict[int, list[str]]:
    """As linhas de DADOS1/2/3 exatamente como a página as lê (txt.trim().split("\\n"))."""
    txt = html.read_text(encoding="utf-8")
    achadas = {int(k): corpo for k, corpo in re.findall(r"const DADOS(\d)\s*=\s*`(.*?)`;", txt, flags=re.S)}
    if sorted(achadas) != list(NIVEIS):
        raise SystemExit(f"{html}: esperava DADOS1, DADOS2 e DADOS3; achei {sorted(achadas)}")
    out = {}
    for nivel, corpo in achadas.items():
        if "${" in corpo or "\\" in corpo:
            raise SystemExit(f"DADOS{nivel} tem interpolação ou escape de template: extraia à mão")
        # o JavaScript troca CRLF por LF dentro de template strings
        out[nivel] = corpo.replace("\r\n", "\n").replace("\r", "\n").strip().split("\n")
    return out


def le_listas() -> dict[int, list[str]]:
    out = {}
    for nivel in NIVEIS:
        p = arquivo(nivel)
        if not p.exists():
            raise SystemExit(f"falta {p.relative_to(RAIZ)} (rode: python scripts/vocabulario.py extrai <html>)")
        linhas = p.read_text(encoding="utf-8").split("\n")
        if linhas and linhas[-1] == "":
            linhas.pop()
        out[nivel] = linhas
    return out


def palavras(listas: dict[int, list[str]]) -> list[dict]:
    itens, erros = [], []
    for nivel in NIVEIS:
        for n, linha in enumerate(listas[nivel], 1):
            partes = linha.split("|")
            if len(partes) != 3 or any(not x.strip() for x in partes):
                erros.append(f"hsk{nivel}.txt:{n}: esperava 汉字|pinyin|significado, veio {linha!r}")
                continue
            hz, py, pt = (x.strip() for x in partes)
            itens.append({"hz": hz, "py": py, "pt": pt, "nivel": nivel, "n": n})
    if erros:
        raise SystemExit("\n".join(erros))
    return itens


def relatorio(itens: list[dict]) -> None:
    por_nivel = {nv: sum(1 for p in itens if p["nivel"] == nv) for nv in NIVEIS}
    print(" + ".join(f"HSK {nv}: {k}" for nv, k in por_nivel.items()), f"= {len(itens)} palavras")
    chaves: dict[str, list[str]] = defaultdict(list)
    leituras: dict[str, list[str]] = defaultdict(list)
    for p in itens:
        chaves[f"{p['hz']}|{p['py']}"].append(f"HSK {p['nivel']} nº {p['n']}")
        if p["py"] not in leituras[p["hz"]]:
            leituras[p["hz"]].append(p["py"])
    duplicadas = {c: onde for c, onde in chaves.items() if len(onde) > 1}
    if duplicadas:
        raise SystemExit("chaves 汉字|pinyin repetidas: " + "; ".join(f"{c} ({', '.join(o)})" for c, o in duplicadas.items()))
    print("duplicatas: nenhuma")
    varias = {hz: pys for hz, pys in leituras.items() if len(pys) > 1}
    if varias:
        print("mesmo caractere com outra leitura (entradas diferentes):", ", ".join(f"{hz} {'/'.join(pys)}" for hz, pys in varias.items()))


def gera() -> None:
    itens = palavras(le_listas())
    relatorio(itens)
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    corpo = ",\n".join(json.dumps(p, ensure_ascii=False, separators=(",", ":")) for p in itens)
    SAIDA.write_text(f"[\n{corpo}\n]\n", encoding="utf-8", newline="\n")
    print(f"→ {SAIDA.relative_to(RAIZ)}")


def extrai(html: Path) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    for nivel, linhas in listas_da_pagina(html).items():
        arquivo(nivel).write_text("\n".join(linhas) + "\n", encoding="utf-8", newline="\n")
        print(f"{arquivo(nivel).relative_to(RAIZ)}: {len(linhas)} linhas")


def confere(html: Path) -> None:
    pagina, nossas = listas_da_pagina(html), le_listas()
    ok = True
    for nivel in NIVEIS:
        a, b = pagina[nivel], nossas[nivel]
        difs = [i + 1 for i in range(max(len(a), len(b))) if (a[i] if i < len(a) else None) != (b[i] if i < len(b) else None)]
        print(f"HSK {nivel}: página {len(a)} · hsk{nivel}.txt {len(b)} · " + ("idênticas" if not difs else f"diferem nas linhas {difs[:10]}"))
        ok &= not difs
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if not args:
        gera()
    elif args[0] in ("extrai", "confere") and len(args) == 2:
        (extrai if args[0] == "extrai" else confere)(Path(args[1]))
    else:
        raise SystemExit(__doc__)
