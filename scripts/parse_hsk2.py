"""Extrai uma prova oficial do HSK 2 (formato 2.0) de PDF(s) para JSON.

    python scripts/parse_hsk2.py <ID> <pdf> [<pdf2> ...] [--paginas a-b]

HSK 2: 听力 35 (~25 min) + 阅读 25 (22 min), sem escrita; o caderno imprime pinyin sobre os
caracteres (linhas de pinyin intercaladas no texto do PDF, descartadas aqui como no HSK 1).

  L1  1–10  figura + frase ouvida → √/×              (imagem-vf)
  L2 11–15  diálogo ↔ figura A–F (exemplo usa uma)    (imagem, grupo L2a)
     16–20  diálogo ↔ figura A–E (sem exemplo)        (imagem, grupo L2b)
  L3 21–30  diálogo curto + pergunta → A/B/C texto    (abc)
  L4 31–35  diálogo longo + pergunta → A/B/C texto    (abc)
  R1 36–40  frase ↔ figura A–F (exemplo usa uma)      (imagem, grupo R1)
  R2 41–45  lacuna com banco de palavras A–F          (lacuna, grupo R2)
  R3 46–50  frase + afirmação ★ → √/×                 (vf: texto + afirmacao)
  R4 51–55  frase ↔ resposta A–F (exemplo usa uma)    (pareamento, grupo R4a)
     56–60  frase ↔ resposta A–E (sem exemplo)        (pareamento, grupo R4b)

Reaproveita os auxiliares de parse_pdf.py (texto, roteiro, gabarito) e de parse_hsk1.py
(pinyin, figuras, opções). Nada é inventado: o que não for achado fica null e aparece no relatório.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).parent))
import parse_hsk1 as h1  # noqa: E402
import parse_pdf as base  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
CJK = h1.CJK
VAZIO = re.compile(r"（\s*）")
LETRA_FINAL = re.compile(r"([A-F])\s*$")

GRUPOS_FIG = {  # grupo: (regex do título da página, letras)
    "L2a": (r"第\s*11\s*-\s*15\s*题", "ABCDEF"),
    "L2b": (r"第\s*16\s*-\s*20\s*题", "ABCDE"),
    "R1": (r"第\s*36\s*-\s*40\s*题", "ABCDEF"),
}


# ------------------------------------------------------------------ figuras


def figuras(pdf: Path, pid: str, paginas: tuple[int, int] | None):
    """Recorta as figuras de L1 (uma por questão) e dos grupos L2a, L2b, R1."""
    destino = RAIZ / "public" / "img" / pid
    destino.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    por_q: dict[int, str] = {}
    grupos: dict[str, dict[str, str]] = {}
    antes_l2 = True  # L1 ocupa as páginas antes do título "第11-15题"
    for num, pg in enumerate(doc):
        if paginas and not (paginas[0] <= num + 1 <= paginas[1]):
            continue
        txt = pg.get_text()
        if "听力材料" in txt or "卷答案" in txt:
            continue
        if re.search(GRUPOS_FIG["L2a"][0], txt):
            antes_l2 = False
        rs = h1.retangulos(pg)
        # --- L1: o número fica na coluna da esquerda e a figura na do meio
        if antes_l2:
            for n, rr in h1.rotulos_questao(pg, range(1, 11)).items():
                cy = (rr.y0 + rr.y1) / 2
                cand = [r for r in rs if r.x0 > rr.x1 and r.y0 - 25 <= cy <= r.y1 + 25]
                if cand:
                    r = min(cand, key=lambda r: abs((r.y0 + r.y1) / 2 - cy))
                    por_q[n] = h1.salva(pg, r, destino, f"q{n}.png", pid)
        # --- grupos de figuras: rótulo à esquerda da figura
        for g, (titulo, letras) in GRUPOS_FIG.items():
            if not re.search(titulo, txt):
                continue
            ex_y = min((r.y0 for t, r in h1.palavras(pg) if t.startswith("例如")), default=pg.rect.height)
            q_y = min((r.y0 for t, r in h1.palavras(pg) if re.fullmatch(r"\d{2}[．.]", t)), default=pg.rect.height)
            lim = min(ex_y, q_y)
            vistos = {}
            for t, rr in h1.palavras(pg):
                if len(t) == 1 and t in letras and rr.y1 < lim and t not in vistos:
                    cy = (rr.y0 + rr.y1) / 2
                    cand = [r for r in rs if r.x0 >= rr.x1 - 2 and r.y0 - 12 <= cy <= r.y1 + 12 and r.y1 < lim + 5]
                    if cand:
                        vistos[t] = min(cand, key=lambda r: r.x0 - rr.x1)
            grupos[g] = {t: h1.salva(pg, r, destino, f"{g}-{t}.png", pid) for t, r in sorted(vistos.items())}
    return por_q, grupos


# ------------------------------------------------------------------ caderno


def linhas_limpas(bl: list[str]) -> list[str]:
    return [base.normaliza(x) for x in bl if base.normaliza(x)]


def letra_exemplo(bloco: list[str], primeira: int) -> str | None:
    """Letra (A–F) impressa no fim da linha do exemplo, antes da 1ª questão do bloco."""
    ini = next((i for i, l in enumerate(bloco) if "例如" in l), None)
    if ini is None:
        return None
    fim = next((i for i in range(ini, len(bloco)) if re.match(rf"^\s*{primeira}\s*[．.]", bloco[i])), len(bloco))
    m = LETRA_FINAL.search(h1.junta(bloco[ini:fim]))
    return m.group(1) if m else None


def falas_txt(bl: list[str], rotulos=r"男|女") -> str:
    """Junta as linhas de um item; quebra linha a cada fala 男：/女：."""
    falas, buf = [], []
    for l in linhas_limpas(bl):
        if re.match(rf"^({rotulos})[：:]", l) and buf:
            falas.append(h1.junta(buf))
            buf = []
        buf.append(l)
    if buf:
        falas.append(h1.junta(buf))
    return "\n".join(re.sub(r"\s+", "", f) for f in falas)


def opcoes_grupo(linhas: list[str], letras: str) -> dict[str, str]:
    """Opções A–F de várias linhas cada (rótulo sozinho na linha, texto nas seguintes)."""
    ops: dict[str, str] = {}
    atual = None
    for s in linhas_limpas(linhas):
        m = re.match(rf"^([{letras}])(?:\s+(.*))?$", s)
        if m and m.group(1) not in ops:
            atual = m.group(1)
            ops[atual] = m.group(2) or ""
            continue
        if atual:
            ops[atual] += s
    return {k: re.sub(r"\s+", "", v) for k, v in ops.items()}


def parse_caderno(linhas: list[str]):
    L = h1.renumera(h1.sem_pinyin(linhas))
    q: dict[int, dict] = {}
    grupos: dict[str, dict] = {}

    # L1 — só números (figura + frase ouvida)
    for n in range(1, 11):
        q[n] = {"n": n, "secao": "L", "parte": 1, "tipo": "imagem-vf"}

    # L2 — dois grupos de figuras
    bloco = base.fatia(L, r"第\s*11\s*-\s*15\s*题", r"第\s*16\s*-\s*20\s*题")
    grupos["L2a"] = {"questoes": list(range(11, 16)), "letras": list("ABCDEF"), "exemploUsa": letra_exemplo(bloco, 11)}
    grupos["L2b"] = {"questoes": list(range(16, 21)), "letras": list("ABCDE"), "exemploUsa": None}
    for n in range(11, 21):
        q[n] = {"n": n, "secao": "L", "parte": 2, "tipo": "imagem", "grupo": "L2a" if n <= 15 else "L2b"}

    # L3/L4 — opções A/B/C em texto
    for parte, (a, b), ate in ((3, (21, 30), r"第四部分"), (4, (31, 35), r"阅\s*读")):
        bloco = base.fatia(L, rf"第\s*{a}\s*-\s*{b}\s*题", ate)
        for n, bl in base.blocos_por_numero(bloco, a, b).items():
            ops = h1.opcoes_letras(bl, "ABC")
            q[n] = {"n": n, "secao": "L", "parte": parte, "tipo": "abc", "opcoes": {k: re.sub(r"\s+", "", v) for k, v in ops.items()}}

    # R1 — frase ↔ figura
    bloco = base.fatia(L, r"第\s*36\s*-\s*40\s*题", r"第二部分")
    grupos["R1"] = {"questoes": list(range(36, 41)), "letras": list("ABCDEF"), "exemploUsa": letra_exemplo(bloco, 36)}
    for n, bl in base.blocos_por_numero(bloco, 36, 40).items():
        q[n] = {"n": n, "secao": "R", "parte": 1, "tipo": "imagem", "grupo": "R1", "enunciado": re.sub(r"\s+", "", h1.junta(bl))}

    # R2 — banco de palavras + lacunas
    bloco = base.fatia(L, r"第\s*41\s*-\s*45\s*题", r"第三部分")
    ex_i = next((i for i, l in enumerate(bloco) if "例如" in l), len(bloco))
    banco = " ".join(linhas_limpas(bloco[1:ex_i]))
    ops = {m.group(1): m.group(2) for m in re.finditer(r"([A-F])\s*([^\sA-F]+)", banco)}
    fim_ex = next((i for i in range(ex_i, len(bloco)) if re.match(r"^\s*41\s*[．.]", bloco[i])), len(bloco))
    ex_txt = re.sub(r"^例如[：:]", "", falas_txt(bloco[ex_i:fim_ex]))
    mres = re.search(r"（\s*([A-F])\s*）", ex_txt)
    grupos["R2"] = {
        "questoes": list(range(41, 46)),
        "opcoes": ops,
        "exemplo": {"texto": re.sub(r"（\s*[A-F]\s*）", "（＿＿）", ex_txt), "resposta": mres.group(1) if mres else None},
    }
    for n, bl in base.blocos_por_numero(bloco, 41, 45).items():
        q[n] = {"n": n, "secao": "R", "parte": 2, "tipo": "lacuna", "grupo": "R2", "enunciado": VAZIO.sub("（＿＿）", falas_txt(bl))}

    # R3 — frase + afirmação ★ → √/×
    bloco = base.fatia(L, r"第\s*46\s*-\s*50\s*题", r"第四部分")
    for n, bl in base.blocos_por_numero(bloco, 46, 50).items():
        s = re.sub(r"\s+", "", h1.junta(bl))
        texto, _, afirm = s.partition("★")
        afirm = VAZIO.sub("", afirm)
        q[n] = {"n": n, "secao": "R", "parte": 3, "tipo": "vf", "texto": texto or None, "afirmacao": afirm or None}

    # R4 — frase ↔ frase (dois grupos)
    for g, (a, b), letras, ate in (("R4a", (51, 55), "ABCDEF", r"第\s*56\s*-\s*60\s*题"), ("R4b", (56, 60), "ABCDE", None)):
        bloco = base.fatia(L, rf"第\s*{a}\s*-\s*{b}\s*题", ate)
        ex_i = next((i for i, l in enumerate(bloco) if "例如" in l), None)
        q1 = next((i for i, l in enumerate(bloco) if re.match(rf"^\s*{a}\s*[．.]", l)), len(bloco))
        ops = opcoes_grupo(bloco[1 : ex_i if ex_i is not None else q1], letras)
        exemplo = None
        if ex_i is not None:
            ex_txt = re.sub(r"\s+", "", h1.junta(bloco[ex_i:q1]))
            ex_txt = re.sub(r"^例如[：:]", "", ex_txt)
            m = LETRA_FINAL.search(ex_txt)
            exemplo = {"texto": ex_txt[: m.start()] if m else ex_txt, "resposta": m.group(1) if m else None}
        grupos[g] = {"questoes": list(range(a, b + 1)), "opcoes": ops, "exemplo": exemplo}
        for n, bl in base.blocos_por_numero(bloco, a, b).items():
            q[n] = {"n": n, "secao": "R", "parte": 4, "tipo": "pareamento", "grupo": g, "enunciado": re.sub(r"\s+", "", h1.junta(bl))}
    return q, grupos


# ------------------------------------------------------------------ roteiro


def separa_exemplo_l1(segmentos: list[dict] | None):
    """O 1º exemplo do áudio são duas frases soltas (uma √, uma ×) que parse_falas junta numa só."""
    for s in segmentos or []:
        if s.get("tipo") == "exemplo":
            fs = s["falas"]
            if len(fs) == 1 and fs[0]["fal"] is None:
                partes = [x for x in re.split(r"(?<=[。！？])", fs[0]["txt"]) if x]
                s["falas"] = [{"fal": None, "txt": x} for x in partes]
            return


# ------------------------------------------------------------------ principal


def main():
    args = sys.argv[1:]
    paginas = None
    if "--paginas" in args:
        i = args.index("--paginas")
        a, b = args[i + 1].split("-")
        paginas = (int(a), int(b))
        del args[i : i + 2]
    pid, pdfs = args[0], [Path(a) for a in args[1:]]
    base.PAGINAS = paginas
    caderno, roteiro_l, gabarito_l = base.divide(base.texto_paginas(pdfs), pid)
    q, grupos = parse_caderno(caderno)
    segmentos, falas_q = base.parse_roteiro(roteiro_l)
    separa_exemplo_l1(segmentos)
    gab = base.parse_gabarito(gabarito_l)
    manual = RAIZ / "data" / "gabaritos" / f"{pid}.json"
    if manual.exists():
        for k, v in json.loads(manual.read_text(encoding="utf-8"))["respostas"].items():
            gab[int(k)] = v
    por_q, gr_img = figuras(pdfs[0], pid, paginas)
    for g, ims in gr_img.items():
        grupos.setdefault(g, {})["imagens"] = ims

    transcricao = "oficial" if segmentos else None
    for n, it in q.items():
        r = gab.get(n)
        if it["tipo"] in ("imagem-vf", "vf") and r:
            r = r == "√"
        it["resposta"] = r
        if n in por_q:
            it["imagem"] = por_q[n]
        if it["secao"] == "L":
            falas = falas_q.get(n)
            it["audioTexto"] = falas
            if falas and it["tipo"] == "abc":
                perg = [f for f in falas if f["fal"] == "问"]
                it["pergunta"] = perg[-1]["txt"] if perg else None

    ajustes = RAIZ / "data" / "ajustes" / f"{pid}.json"
    if ajustes.exists():
        aj = json.loads(ajustes.read_text(encoding="utf-8"))
        for caminho, valor in aj.get("set", {}).items():
            alvo: dict = {"grupos": grupos, "q": {str(k): v for k, v in q.items()}}
            partes = caminho.split(".")
            for p in partes[:-1]:
                alvo = alvo.setdefault(p, {})
            alvo[partes[-1]] = valor

    prova = {
        "id": pid,
        "nivel": 2,
        "transcricao": transcricao,
        "fontes": [str(p) for p in pdfs],
        "grupos": grupos,
        "roteiro": segmentos,
        "questoes": [q[n] for n in sorted(q)],
    }
    saida = RAIZ / "data" / "provas" / f"{pid}.json"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(prova, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    probs = verifica(prova)
    print(f"{pid}: {len(q)} questões; figuras {len(por_q)}+{sum(len(v) for v in gr_img.values())}; problemas: {len(probs)}")
    for p in probs[:30]:
        print("  -", p)


def verifica(p: dict, exige_transcricao: bool = True) -> list[str]:
    e = []
    q = {x["n"]: x for x in p["questoes"]}
    G = p["grupos"]
    if len(q) != 60:
        e.append(f"{len(q)} questões (esperado 60)")
    for n in list(range(1, 11)) + list(range(46, 51)):
        if not isinstance(q.get(n, {}).get("resposta"), bool):
            e.append(f"{n}: resposta √/× {q.get(n, {}).get('resposta')!r}")
    for n in range(1, 11):
        if not q[n].get("imagem"):
            e.append(f"{n}: sem figura")
    for g, k in (("L2a", 6), ("L2b", 5), ("R1", 6)):
        if len((G.get(g) or {}).get("imagens") or {}) != k:
            e.append(f"{g}: {len((G.get(g) or {}).get('imagens') or {})} figuras (esperado {k})")
    for g in ("L2a", "R1"):
        if not (G.get(g) or {}).get("exemploUsa"):
            e.append(f"{g}: letra do exemplo não achada")
    for g, letras in (("R2", "ABCDEF"), ("R4a", "ABCDEF"), ("R4b", "ABCDE")):
        ops = (G.get(g) or {}).get("opcoes") or {}
        if "".join(sorted(ops)) != letras or any(not v or len(v) > 60 for v in ops.values()):
            e.append(f"{g}: opções {ops}")
    for g in ("R2", "R4a"):
        if not ((G.get(g) or {}).get("exemplo") or {}).get("resposta"):
            e.append(f"{g}: sem resposta do exemplo")
    for n in range(21, 36):
        if "".join(sorted(q[n].get("opcoes") or {})) != "ABC" or any(not v for v in q[n]["opcoes"].values()):
            e.append(f"{n}: opções {q[n].get('opcoes')}")
        if q[n].get("resposta") not in ("A", "B", "C"):
            e.append(f"{n}: resposta {q[n].get('resposta')!r}")
    for n in range(36, 61):
        if n in range(46, 51):
            if not q[n].get("texto") or not q[n].get("afirmacao"):
                e.append(f"{n}: texto/afirmação ★ faltando")
        elif not q[n].get("enunciado"):
            e.append(f"{n}: sem enunciado")
    for n in range(41, 46):
        if "（＿＿）" not in (q[n].get("enunciado") or ""):
            e.append(f"{n}: sem lacuna")
    # letras únicas por grupo e diferentes da letra do exemplo
    for faixa, g, letras, ex in (
        (range(11, 16), "L2a", "ABCDEF", (G.get("L2a") or {}).get("exemploUsa")),
        (range(16, 21), "L2b", "ABCDE", None),
        (range(36, 41), "R1", "ABCDEF", (G.get("R1") or {}).get("exemploUsa")),
        (range(41, 46), "R2", "ABCDEF", ((G.get("R2") or {}).get("exemplo") or {}).get("resposta")),
        (range(51, 56), "R4a", "ABCDEF", ((G.get("R4a") or {}).get("exemplo") or {}).get("resposta")),
        (range(56, 61), "R4b", "ABCDE", None),
    ):
        rs = [q[n].get("resposta") for n in faixa]
        if len(set(rs)) != len(rs):
            e.append(f"{g}: letras repetidas no gabarito {rs}")
        if ex in rs:
            e.append(f"{g}: gabarito usa a letra do exemplo ({ex})")
        for n, r in zip(faixa, rs):
            if not isinstance(r, str) or r not in letras:
                e.append(f"{n}: resposta {r!r} fora de {letras}")
    if exige_transcricao and p.get("roteiro"):
        for n in range(1, 36):
            f = q[n].get("audioTexto") or []
            if not f:
                e.append(f"{n}: sem transcrição")
            elif n > 10 and len(f) < 2:
                e.append(f"{n}: diálogo com {len(f)} fala(s)")
            elif n > 20 and not any(x["fal"] == "问" for x in f):
                e.append(f"{n}: transcrição sem 问")
            elif n > 20 and q[n].get("pergunta") is None:
                e.append(f"{n}: sem pergunta")
    elif exige_transcricao:
        e.append("sem roteiro do áudio")
    return e


if __name__ == "__main__":
    main()
