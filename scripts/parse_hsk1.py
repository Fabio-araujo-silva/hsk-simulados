"""Extrai uma prova oficial do HSK 1 (formato 2.0) de PDF(s) para JSON.

    python scripts/parse_hsk1.py <ID> <pdf> [<pdf2> ...] [--paginas a-b]

HSK 1: 听力 20 (4 partes de 5) + 阅读 20 (4 partes de 5), sem escrita; o caderno imprime pinyin
sobre os caracteres (linhas de pinyin intercaladas no texto do PDF — são descartadas aqui; o app
gera o pinyin de novo, com tons de contexto).

  L1  1–5   figura + o que se ouve → √/×          (imagem-vf)
  L2  6–10  três figuras A/B/C                      (imagem-abc)
  L3 11–15  diálogo ↔ figura A–F (exemplo usa uma)  (imagem, grupo L3)
  L4 16–20  frase + pergunta → A/B/C em texto       (abc)
  R1 21–25  figura + palavra → √/×                  (imagem-vf)
  R2 26–30  frase ↔ figura A–F                      (imagem, grupo R2)
  R3 31–35  pergunta ↔ resposta A–F                 (pareamento, grupo R3)
  R4 36–40  lacuna com banco de palavras A–F        (lacuna, grupo R4)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).parent))
import parse_pdf as base  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
CJK = re.compile(r"[㐀-鿿]")
PY_CHARS = "A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙ'’"
LINHA_PINYIN = re.compile(rf"^[{PY_CHARS}\s,.?!;:，．。？！、…\-—\"“”]+$")
ROTULO_MAIS_PINYIN = re.compile(rf"^([A-F])\s+[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'’][{PY_CHARS}\s,.?!，．。？！]*$")


def sem_pinyin(linhas: list[str]) -> list[str]:
    """Remove as linhas de pinyin (mantém rótulos A–F soltos, números, √/×)."""
    out = []
    for ln in linhas:
        s = ln.strip()
        if not s:
            out.append("")
            continue
        m = ROTULO_MAIS_PINYIN.match(s)
        if m:
            out.append(m.group(1))
            continue
        if not CJK.search(s) and LINHA_PINYIN.match(s) and len(re.findall(rf"[{PY_CHARS}]", s)) >= 2:
            continue
        out.append(ln)
    return out


def junta(linhas: list[str]) -> str:
    return base.junta_linhas([l for l in linhas if l.strip()])


# ------------------------------------------------------------------ figuras


def retangulos(pg) -> list[fitz.Rect]:
    """Imagens da página, juntando as tiras de uma mesma figura (o PDF fatia as fotos)."""
    rs = [fitz.Rect(i["bbox"]) for i in pg.get_image_info(xrefs=True)]
    rs = [r for r in rs if r.width > 8 and r.height > 8]
    mudou = True
    while mudou:
        mudou = False
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]
                sobrepoe_x = min(a.x1, b.x1) - max(a.x0, b.x0) > -3
                sobrepoe_y = min(a.y1, b.y1) - max(a.y0, b.y0) > -3
                if sobrepoe_x and sobrepoe_y:
                    rs[i] = a | b
                    del rs[j]
                    mudou = True
                    break
            if mudou:
                break
    return [r for r in rs if r.width > 30 and r.height > 25]


def salva(pg, r: fitz.Rect, destino: Path, nome: str, pid: str) -> str:
    pix = pg.get_pixmap(clip=r, dpi=200)
    pix.save(destino / nome)
    return f"img/{pid}/{nome}"


def palavras(pg):
    return [(w[4], fitz.Rect(w[:4])) for w in pg.get_text("words")]


def rotulos_questao(pg, faixa: range):
    out = {}
    for t, r in palavras(pg):
        m = re.fullmatch(r"(\d{1,2})[．.]", t)
        if m and int(m.group(1)) in faixa:
            out[int(m.group(1))] = r
    if not out:  # PDF vetorial: só o número, sem o "．"
        for t, r in palavras(pg):
            if re.fullmatch(r"\d{1,2}", t) and int(t) in faixa and r.x0 < 135 and r.y0 > 180 and int(t) not in out:
                out[int(t)] = r
    return out


def figuras(pdf: Path, pid: str, paginas: tuple[int, int] | None):
    """Recorta as figuras de L1, L2, L3, R1, R2 → dict com caminhos."""
    destino = RAIZ / "public" / "img" / pid
    # não apaga nada: recortes feitos à mão (data/ajustes, scripts/recortes) sobrevivem a uma nova extração
    destino.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    por_q: dict[int, str] = {}
    abc: dict[int, dict[str, str]] = {}
    grupos: dict[str, dict[str, str]] = {}
    for num, pg in enumerate(doc):
        if paginas and not (paginas[0] <= num + 1 <= paginas[1]):
            continue
        txt = pg.get_text()
        rs = retangulos(pg)
        # --- uma figura por questão (L1 1–5, R1 21–25)
        for faixa in (range(1, 6), range(21, 26)):
            rot = rotulos_questao(pg, faixa)
            for n, rr in rot.items():
                cy = (rr.y0 + rr.y1) / 2
                cand = [r for r in rs if r.x0 > rr.x1 and r.y0 - 25 <= cy <= r.y1 + 25]
                if cand:
                    r = min(cand, key=lambda r: abs((r.y0 + r.y1) / 2 - cy))
                else:  # figura vetorial: recorta a região onde ela fica
                    r = fitz.Rect(rr.x1 + 55, cy - 42, rr.x1 + 215, cy + 42)
                por_q[n] = salva(pg, r, destino, f"q{n}.png", pid)
        # --- três figuras por questão (L2 6–10): rótulos A B C embaixo das figuras
        rot = rotulos_questao(pg, range(6, 11))
        if rot:
            letras = [(t, r) for t, r in palavras(pg) if t in ("A", "B", "C")]
            for n, rq in rot.items():
                if len(abc.get(n, {})) == 3:  # já recortada (o "7．" da página de 答案 não é questão)
                    continue
                linha = [(t, r) for t, r in letras if r.y0 > rq.y0 - 5]
                if not linha:
                    continue
                y = min(r.y0 for _, r in linha)
                linha = [(t, r) for t, r in linha if abs(r.y0 - y) < 6]
                abc[n] = {}
                for t, r in linha:
                    cx = (r.x0 + r.x1) / 2
                    cand = [im for im in rs if im.x0 - 25 <= cx <= im.x1 + 25 and im.y1 <= r.y0 + 8 and r.y0 - im.y1 < 70]
                    if cand:
                        im = min(cand, key=lambda im: r.y0 - im.y1)
                    else:  # figura vetorial: recorta acima do rótulo
                        im = fitz.Rect(cx - 58, r.y0 - 112, cx + 58, r.y0 - 4)
                    abc[n][t] = salva(pg, im, destino, f"q{n}-{t}.png", pid)
        # --- grupos de seis figuras (L3 11–15, R2 26–30): rótulo à esquerda da figura
        grupo = "L3" if re.search(r"第\s*11\s*-\s*15", txt) else "R2" if re.search(r"第\s*26\s*-\s*30", txt) else None
        if grupo:
            ex_y = min((r.y0 for t, r in palavras(pg) if t.startswith("例如")), default=pg.rect.height)
            vistos = {}
            for t, rr in palavras(pg):
                if t in "ABCDEF" and len(t) == 1 and rr.y1 < ex_y and t not in vistos:
                    cy = (rr.y0 + rr.y1) / 2
                    cand = [r for r in rs if r.x0 >= rr.x1 - 2 and r.y0 - 12 <= cy <= r.y1 + 12 and r.y1 < ex_y + 5]
                    if cand:
                        vistos[t] = min(cand, key=lambda r: r.x0 - rr.x1)
                    elif not rs:  # página toda vetorial: recorta à direita do rótulo
                        vistos[t] = fitz.Rect(rr.x1 + 8, cy - 55, rr.x1 + 190, cy + 55)
            grupos[grupo] = {t: salva(pg, r, destino, f"{grupo}-{t}.png", pid) for t, r in sorted(vistos.items())}
    return por_q, abc, grupos


# ------------------------------------------------------------------ caderno


def opcoes_letras(linhas: list[str], letras: str) -> dict[str, str]:
    """Opções 'A' / texto / 'B' / texto… (o rótulo pode vir sozinho ou com o texto na mesma linha)."""
    ops: dict[str, str] = {}
    atual = None
    pedacos = []
    for ln in linhas:
        pedacos.extend(re.split(rf"\s+(?=[{letras}](?:\s|$))", ln))
    for ln in pedacos:
        s = base.normaliza(ln)
        if not s:
            continue
        m = re.match(rf"^([{letras}])(?:\s+(.*))?$", s)
        if m and m.group(1) not in ops and (not m.group(2) or not re.match(r"^[a-z]", m.group(2))):
            atual = m.group(1)
            ops[atual] = base.normaliza(m.group(2) or "").replace("√", "").strip()
            continue
        if atual:
            ops[atual] += s.replace("√", "").strip()
    return {k: v for k, v in ops.items()}


def renumera(linhas: list[str]) -> list[str]:
    """Corrige numeração repetida por erro de impressão (ex.: 28．… 28．… → 28, 29)."""
    out, ultimo = [], 0
    for ln in linhas:
        m = re.match(r"^(\s*)(\d{1,2})(\s*[．.].*)$", ln)
        if m:
            n = int(m.group(2))
            if n == ultimo and 1 <= n < 40:
                ln = f"{m.group(1)}{n + 1}{m.group(3)}"
                n += 1
            if n == ultimo + 1 or n == 1:
                ultimo = n
        out.append(ln)
    return out


def parse_caderno(linhas: list[str]):
    L = renumera(sem_pinyin(linhas))
    q: dict[int, dict] = {}
    grupos: dict[str, dict] = {}

    for n in range(1, 6):
        q[n] = {"n": n, "secao": "L", "parte": 1, "tipo": "imagem-vf"}
    for n in range(6, 11):
        q[n] = {"n": n, "secao": "L", "parte": 2, "tipo": "imagem-abc"}

    # L3 — letra do exemplo no fim da linha do exemplo
    bloco = base.fatia(L, r"第\s*11\s*-\s*15\s*题", r"第四部分")
    ex = junta([l for l in bloco[next((i for i, l in enumerate(bloco) if "例如" in l), 0):] if not re.match(r"^\s*1[1-5]\s*[．.]", l)][:12])
    m = re.search(r"([A-F])\s*$", ex.split("11．")[0]) or re.search(r"([A-F])", ex[::-1])
    grupos["L3"] = {"questoes": list(range(11, 16)), "letras": list("ABCDEF"), "exemploUsa": m.group(1) if m else None}
    for n in range(11, 16):
        q[n] = {"n": n, "secao": "L", "parte": 3, "tipo": "imagem", "grupo": "L3"}

    # L4 — opções A/B/C em texto
    bloco = base.fatia(L, r"第\s*16\s*-\s*20\s*题", r"阅\s*读")
    for n, bl in base.blocos_por_numero(bloco, 16, 20).items():
        q[n] = {"n": n, "secao": "L", "parte": 4, "tipo": "abc", "opcoes": opcoes_letras(bl, "ABC")}

    # R1 — palavra ao lado da figura
    bloco = base.fatia(L, r"第\s*21\s*-\s*25\s*题", r"第二部分")
    for n, bl in base.blocos_por_numero(bloco, 21, 25).items():
        palavra = junta([x for x in bl if CJK.search(x)])
        q[n] = {"n": n, "secao": "R", "parte": 1, "tipo": "imagem-vf", "palavra": palavra}

    # R2 — frase ↔ figura
    bloco = base.fatia(L, r"第\s*26\s*-\s*30\s*题", r"第三部分")
    ex_ln = junta(bloco[next((i for i, l in enumerate(bloco) if "例如" in l), 0):][:20]).split("26．")[0]
    m = re.search(r"([A-F])\s*$", ex_ln)
    grupos["R2"] = {"questoes": list(range(26, 31)), "letras": list("ABCDEF"), "exemploUsa": m.group(1) if m else None}
    for n, bl in base.blocos_por_numero(bloco, 26, 30).items():
        q[n] = {"n": n, "secao": "R", "parte": 2, "tipo": "imagem", "grupo": "R2", "enunciado": junta(bl)}

    # R3 — pergunta ↔ resposta: cada linha traz a pergunta, a letra de uma resposta e o texto dela
    bloco = base.fatia(L, r"第\s*31\s*-\s*35\s*题", r"第四部分")
    ops: dict[str, str] = {}
    exemplo = None
    ini = next((i for i, l in enumerate(bloco) if "例如" in l), None)
    if ini is not None:
        fim = next((i for i in range(ini, len(bloco)) if re.match(r"^\s*31\s*[．.]", bloco[i])), len(bloco))
        txt = "\n".join(base.normaliza(x) for x in bloco[ini:fim] if x.strip())
        txt = re.sub(r"^例如[：:]", "", txt)
        m = re.search(r"^(.*?)\s*([A-F])\s+([A-F])\s*(.*)$", txt.replace("\n", ""), re.S)
        if m:
            exemplo = {"texto": m.group(1).strip(), "resposta": m.group(2)}
            ops[m.group(3)] = m.group(4).strip()
    for n, bl in base.blocos_por_numero(bloco, 31, 35).items():
        s = "".join(base.normaliza(x) for x in bl if x.strip())
        m = re.search(r"^(.*?[？?。！!])\s*([A-F])\s*(.*)$", s)
        if m:
            q[n] = {"n": n, "secao": "R", "parte": 3, "tipo": "pareamento", "grupo": "R3", "enunciado": m.group(1)}
            ops[m.group(2)] = m.group(3).strip()
        else:
            q[n] = {"n": n, "secao": "R", "parte": 3, "tipo": "pareamento", "grupo": "R3", "enunciado": s}
    grupos["R3"] = {"questoes": list(range(31, 36)), "opcoes": dict(sorted(ops.items())), "exemplo": exemplo}

    # R4 — banco de palavras + lacunas
    bloco = base.fatia(L, r"第\s*36\s*-\s*40\s*题")
    ex_i = next((i for i, l in enumerate(bloco) if "例如" in l), len(bloco))
    banco = "".join(base.normaliza(x) for x in bloco[1:ex_i] if x.strip())
    ops = {m.group(1): m.group(2) for m in re.finditer(r"([A-F])\s*([^\sA-F]+)", banco)}
    ex_txt = junta(bloco[ex_i : next((i for i in range(ex_i, len(bloco)) if re.match(r"^\s*36\s*[．.]", bloco[i])), len(bloco))])
    ex_txt = re.sub(r"^例如[：:]", "", ex_txt)
    mres = re.search(r"（\s*([A-F])\s*）", ex_txt)
    grupos["R4"] = {
        "questoes": list(range(36, 41)),
        "opcoes": ops,
        "exemplo": {"texto": re.sub(r"（\s*[A-F]\s*）", "（＿＿）", ex_txt), "resposta": mres.group(1) if mres else None},
    }
    for n, bl in base.blocos_por_numero(bloco, 36, 40).items():
        falas, buf = [], []
        for l in bl:
            l2 = base.normaliza(l)
            if not l2:
                continue
            if re.match(r"^(男|女)[：:]", l2) and buf:
                falas.append(junta(buf))
                buf = []
            buf.append(l2)
        if buf:
            falas.append(junta(buf))
        txt = "\n".join(re.sub(r"（\s*）", "（＿＿）", re.sub(r"\s+", "", f)) for f in falas)
        txt = re.split(r"新汉语水平考试", txt)[0]  # rodapé/gabarito da última página colado à última linha
        q[n] = {"n": n, "secao": "R", "parte": 4, "tipo": "lacuna", "grupo": "R4", "enunciado": txt}
    # garante as 40 questões mesmo quando o caderno não tem texto (PDF vetorial → data/ajustes/<ID>.json)
    padrao = [(range(16, 21), "L", 4, "abc"), (range(21, 26), "R", 1, "imagem-vf"), (range(26, 31), "R", 2, "imagem"),
              (range(31, 36), "R", 3, "pareamento"), (range(36, 41), "R", 4, "lacuna")]
    for faixa, sec, parte, tipo in padrao:
        for n in faixa:
            if n not in q:
                q[n] = {"n": n, "secao": sec, "parte": parte, "tipo": tipo}
                if tipo in ("imagem", "pareamento", "lacuna"):
                    q[n]["grupo"] = {2: "R2", 3: "R3", 4: "R4"}[parte]
    for g in ("R3", "R4"):
        grupos.setdefault(g, {"questoes": list(range(31, 36) if g == "R3" else range(36, 41)), "opcoes": {}, "exemplo": None})
    return q, grupos


# ------------------------------------------------------------------ roteiro


def separa_exemplo_l1(segmentos: list[dict] | None, linhas: list[str]):
    """O exemplo da 1ª parte são duas frases soltas, sem pontuação, uma por linha ("例如：很高兴" / "看电影",
    uma √ e uma ×); parse_falas cola as duas numa só. Separa de novo seguindo as linhas do 听力材料."""
    ex = next((s for s in segmentos or [] if s.get("tipo") == "exemplo"), None)
    i = next((i for i, l in enumerate(linhas or []) if "例如" in l), None)
    if ex is None or i is None or len(ex["falas"]) != 1 or ex["falas"][0]["fal"] is not None:
        return
    partes = [re.sub(r"^例如[：:]", "", base.normaliza(linhas[i]))]
    for l in linhas[i + 1 :]:
        l2 = base.normaliza(l)
        if not l2 or l2.startswith("现在开始"):
            break
        partes.append(l2)
    if len(partes) > 1 and "".join(partes) == ex["falas"][0]["txt"]:
        ex["falas"] = [{"fal": None, "txt": x} for x in partes]


def aplica_recortes(pid: str, pdfs: list[Path]) -> int:
    """Figuras que o extrator errou, recortadas à mão: data/ajustes/<ID>.json → "recortes"
    [{"pagina": nº da página no PDF (1 = primeira), "rect": [x0, y0, x1, y1], "nome": "q24.png", "arquivo": 0}].
    Rodam DEPOIS da extração automática, então sobrevivem a qualquer nova extração."""
    arq = RAIZ / "data" / "ajustes" / f"{pid}.json"
    if not arq.exists():
        return 0
    recs = json.loads(arq.read_text(encoding="utf-8")).get("recortes", [])
    destino = RAIZ / "public" / "img" / pid
    destino.mkdir(parents=True, exist_ok=True)
    for rc in recs:
        pg = fitz.open(pdfs[rc.get("arquivo", 0)])[rc["pagina"] - 1]
        salva(pg, fitz.Rect(rc["rect"]) + (-2, -2, 2, 2), destino, rc["nome"], pid)
    return len(recs)


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
    paginas_txt = base.texto_paginas(pdfs)
    caderno, roteiro_l, gabarito_l = base.divide(paginas_txt, pid)
    q, grupos = parse_caderno(caderno)
    segmentos, falas_q = base.parse_roteiro(roteiro_l)
    separa_exemplo_l1(segmentos, roteiro_l)
    gab = base.parse_gabarito(gabarito_l)
    # página de gabarito com cabeçalho corrompido (não é reconhecida como 卷答案): lê a última página direto
    ultima = fitz.open(pdfs[0])[-1].get_text()
    for k, v in base.parse_gabarito(base.limpa(ultima)).items():
        gab.setdefault(k, v)
    manual = RAIZ / "data" / "gabaritos" / f"{pid}.json"
    if manual.exists():
        for k, v in json.loads(manual.read_text(encoding="utf-8"))["respostas"].items():
            gab[int(k)] = v
    por_q, abc, gr_img = figuras(pdfs[0], pid, paginas)
    aplica_recortes(pid, pdfs)
    for g, ims in gr_img.items():
        grupos.setdefault(g, {})["imagens"] = ims

    transcricao = "oficial" if segmentos else None
    arq_tr = RAIZ / "data" / "transcricoes" / f"{pid}.json"
    tr = json.loads(arq_tr.read_text(encoding="utf-8")) if arq_tr.exists() else None
    # "substituiOficial": o 听力材料 oficial existe mas não é legível como texto (ex.: o 样卷 do 大纲 traz o pinyin
    # intercalado palavra a palavra) — o arquivo traz o mesmo texto oficial, limpo
    if tr and (not segmentos or tr.get("substituiOficial")):
        segmentos = tr.get("roteiro") or json.loads((RAIZ / "data" / "provas" / "H10901.json").read_text(encoding="utf-8"))["roteiro"]
        falas_q = {int(n): fs for n, fs in tr["questoes"].items()}
        transcricao = "oficial" if tr.get("substituiOficial") else "audio"

    for n, it in q.items():
        r = gab.get(n)
        if it["tipo"] == "imagem-vf" and r:
            r = r == "√"
        it["resposta"] = r
        if n in por_q:
            it["imagem"] = por_q[n]
        if n in abc:
            it["imagens"] = abc[n]
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
        "nivel": 1,
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
    print(f"{pid}: {len(q)} questões; figuras {len(por_q)}+{sum(len(v) for v in abc.values())}+{sum(len(v) for v in gr_img.values())}; problemas: {len(probs)}")
    for p in probs[:30]:
        print("  -", p)


def verifica(p: dict) -> list[str]:
    e = []
    q = {x["n"]: x for x in p["questoes"]}
    G = p["grupos"]
    if len(q) != 40:
        e.append(f"{len(q)} questões")
    for n in list(range(1, 6)) + list(range(21, 26)):
        if not isinstance(q[n].get("resposta"), bool):
            e.append(f"{n}: resposta √/× {q[n].get('resposta')!r}")
        if not q[n].get("imagem"):
            e.append(f"{n}: sem figura")
    for n in range(21, 26):
        if not q[n].get("palavra"):
            e.append(f"{n}: sem palavra")
    for n in range(6, 11):
        if sorted((q[n].get("imagens") or {}).keys()) != ["A", "B", "C"]:
            e.append(f"{n}: figuras {sorted((q[n].get('imagens') or {}).keys())}")
    for g in ("L3", "R2"):
        if len((G.get(g) or {}).get("imagens") or {}) != 6:
            e.append(f"{g}: {len((G.get(g) or {}).get('imagens') or {})} figuras")
        if not (G.get(g) or {}).get("exemploUsa"):
            e.append(f"{g}: letra do exemplo não achada")
    for g in ("R3", "R4"):
        ops = (G.get(g) or {}).get("opcoes") or {}
        if "".join(sorted(ops)) != "ABCDEF" or any(not v for v in ops.values()):
            e.append(f"{g}: opções {ops}")
    for n in range(16, 21):
        if "".join(sorted(q[n].get("opcoes") or {})) != "ABC":
            e.append(f"{n}: opções {q[n].get('opcoes')}")
    for n in range(6, 41):
        if n > 10 and q[n].get("resposta") is None:
            e.append(f"{n}: sem resposta")
    for n in range(26, 41):
        if not q[n].get("enunciado"):
            e.append(f"{n}: sem enunciado")
    for n in range(36, 41):
        if "（＿＿）" not in (q[n].get("enunciado") or ""):
            e.append(f"{n}: sem lacuna")
    for n in range(1, 21):
        if not q[n].get("audioTexto") and p.get("roteiro"):
            e.append(f"{n}: sem transcrição")
    for faixa, g, ex in ((range(11, 16), "L3", "exemploUsa"), (range(26, 31), "R2", "exemploUsa")):
        rs = [q[n].get("resposta") for n in faixa]
        if len(set(rs)) != len(rs):
            e.append(f"{g}: letras repetidas no gabarito {rs}")
        if (G.get(g) or {}).get(ex) in rs:
            e.append(f"{g}: gabarito usa a letra do exemplo")
    return e


if __name__ == "__main__":
    main()
