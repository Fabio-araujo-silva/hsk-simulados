"""Extrai uma prova oficial do HSK 3 (formato 2.0) de PDF(s) para JSON.

Uso:
    python scripts/parse_pdf.py <ID> <pdf> [<pdf2> ...] [--saida data/provas/<ID>.json]

O PDF principal deve conter o caderno de questões (题本). Transcrição do áudio
(…卷听力材料) e gabarito (…卷答案) podem estar no mesmo PDF ou em PDFs extras.
As imagens da parte 1 do listening são recortadas para public/img/<ID>/.

Nada aqui inventa conteúdo: tudo sai do texto do PDF oficial. O que não for
encontrado fica como null e aparece no relatório de validação.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

RAIZ = Path(__file__).resolve().parents[1]
CJK = r"\u3400-\u9fff\uff00-\uffef\u3000-\u303f"

# ---------------------------------------------------------------- utilidades


def normaliza(s: str) -> str:
    """Remove espaços artificiais do PDF entre caracteres chineses/números."""
    s = s.replace("\u00a0", " ").replace("\u3000", " ")
    s = re.sub(r"[ \t]+", " ", s).strip()
    # "5 点" -> "5点"; "我 们" -> "我们"; mantém espaço entre palavras latinas
    s = re.sub(rf"(?<=[0-9{CJK}]) (?=[{CJK}])", "", s)
    s = re.sub(rf"(?<=[{CJK}]) (?=[0-9])", "", s)
    return s


def junta_linhas(linhas: list[str]) -> str:
    """Junta linhas quebradas pelo PDF (sem espaço entre caracteres chineses)."""
    out = ""
    for ln in linhas:
        ln = normaliza(ln)
        if not ln:
            continue
        if out and re.match(r"[A-Za-z]", ln[:1]) and re.search(r"[A-Za-z]$", out):
            out += " "
        out += ln
    return out


PAGINAS: tuple[int, int] | None = None  # intervalo 1-based (inclusive) do PDF principal


def texto_paginas(pdfs: list[Path]) -> list[tuple[str, int, str]]:
    """[(arquivo, pagina, texto)] de todos os PDFs."""
    res = []
    for k, p in enumerate(pdfs):
        doc = fitz.open(p)
        for i, pg in enumerate(doc):
            if k == 0 and PAGINAS and not (PAGINAS[0] <= i + 1 <= PAGINAS[1]):
                continue
            res.append((str(p), i, pg.get_text()))
    return res


CABECALHO = re.compile(r"^\s*(H\d{5}|HSK（三级）样卷)\s*-\s*\d+\s*$")
MARCA_DAGUA = re.compile(r"tiengtrung|TIENGTRUNG|www\.|\.com", re.I)


RODAPE = re.compile(r"^\s*-\s*\d+\s*-\s*$")


def limpa(texto: str) -> list[str]:
    out = []
    for ln in texto.splitlines():
        if CABECALHO.match(ln) or MARCA_DAGUA.search(ln) or RODAPE.match(ln):
            continue
        out.append(re.sub(r"\s+-\s*\d+\s*-\s*$", "", ln.rstrip()))
    return out


# ------------------------------------------------------- divisão do caderno


def divide(paginas, pid):
    """Separa linhas do caderno, da transcrição e do gabarito."""
    caderno, roteiro, gabarito = [], [], []
    alvo = caderno
    for arq, i, txt in paginas:
        if "听力材料" in txt:
            alvo = roteiro
        if "卷答案" in txt or re.search(r"答\s*案", txt[:200]):
            alvo = gabarito
        # páginas de outro PDF que não são roteiro/gabarito: ignora capa
        alvo.extend(limpa(txt))
        if alvo is roteiro and "听力考试现在结束" in txt:
            alvo = caderno if not gabarito else gabarito
    return caderno, roteiro, gabarito


def blocos_por_numero(linhas, ini, fim):
    """{n: [linhas]} para questões ini..fim, respeitando a ordem crescente."""
    blocos, atual, esperado = {}, None, ini
    for ln in linhas:
        m = re.match(r"^\s*(\d{1,2})\s*[．.]\s*(.*)$", ln)
        if m and int(m.group(1)) == esperado and esperado <= fim:
            atual = esperado
            blocos[atual] = [m.group(2)]
            esperado += 1
            continue
        if atual is not None:
            blocos[atual].append(ln)
    return blocos


def fatia(linhas, de_regex, ate_regex=None):
    """Linhas entre a primeira ocorrência de de_regex e ate_regex."""
    ini = next((i for i, l in enumerate(linhas) if re.search(de_regex, l)), None)
    if ini is None:
        return []
    fim = len(linhas)
    if ate_regex:
        fim = next((i for i in range(ini + 1, len(linhas)) if re.search(ate_regex, linhas[i])), len(linhas))
    return linhas[ini:fim]


# ------------------------------------------------------------- caderno


def opcoes_abc(linhas):
    """Extrai A/B/C de linhas tipo 'A 迟到了'. Retorna (resto, opcoes)."""
    ops, resto = {}, []
    for ln in linhas:
        n = normaliza(ln)
        m = re.match(r"^([ABC])\s*(.+)$", n)
        if m and m.group(1) not in ops and (len(ops) == "ABC".index(m.group(1))):
            ops[m.group(1)] = m.group(2).strip()
        elif ops and n and not re.match(r"^[ABC]\s", n):
            # continuação de opção longa (raro)
            ultima = list(ops)[-1]
            ops[ultima] += n
        else:
            resto.append(ln)
    return resto, ops


def parse_caderno(linhas, pid):
    q = {}
    grupos = {}

    # ---------- Listening parte 1 (1-10) — só números; imagens à parte
    ex = next((l for l in linhas if "好吗？" in l and re.search(r"\s([A-F])\s*$", l)), None)
    ex_letra = re.search(r"\s([A-F])\s*$", ex).group(1) if ex else None
    grupos["L1a"] = {"questoes": list(range(1, 6)), "letras": list("ABCDEF"), "exemploUsa": ex_letra}
    grupos["L1b"] = {"questoes": list(range(6, 11)), "letras": list("ABCDE"), "exemploUsa": None}
    for n in range(1, 11):
        q[n] = {"n": n, "secao": "L", "parte": 1, "tipo": "imagem", "grupo": "L1a" if n <= 5 else "L1b"}

    # ---------- Listening parte 2 (11-20)
    p2 = fatia(linhas, r"第11-20\s*题", r"第三部分")
    for n, bl in blocos_por_numero(p2, 11, 20).items():
        t = junta_linhas(bl)
        t = re.sub(r"（\s*）\s*$", "", t).strip()
        t = re.sub(r"^★\s*", "", t)
        q[n] = {"n": n, "secao": "L", "parte": 2, "tipo": "vf", "afirmacao": t}

    # ---------- Listening partes 3 e 4 (21-40)
    for parte, (a, b) in ((3, (21, 30)), (4, (31, 40))):
        bloco = fatia(linhas, rf"第{a}-{b}\s*题", r"第四部分" if parte == 3 else r"阅\s*读")
        for n, bl in blocos_por_numero(bloco, a, b).items():
            _, ops = opcoes_abc(bl)
            q[n] = {"n": n, "secao": "L", "parte": parte, "tipo": "abc", "opcoes": ops}

    # ---------- Reading parte 1 (41-50)
    for nome, (a, b), letras in (("R1a", (41, 45), "ABCDEF"), ("R1b", (46, 50), "ABCDE")):
        bloco = fatia(linhas, rf"第{a}-{b}\s*题", r"第46-50\s*题" if a == 41 else r"第二部分")
        ops, exemplo = {}, None
        for ln in bloco:
            n = normaliza(ln)
            m = re.match(r"^([A-F])\s*(.+)$", n)
            if m and m.group(1) in letras and m.group(1) not in ops and not re.match(r"^\d", n):
                ops[m.group(1)] = m.group(2).strip()
            m2 = re.match(r"^例如[：:](.+?)（\s*([A-F])\s*）", n)
            if m2:
                exemplo = {"texto": m2.group(1).strip(), "resposta": m2.group(2)}
        grupos[nome] = {"questoes": list(range(a, b + 1)), "opcoes": ops, "exemplo": exemplo}
        for n, bl in blocos_por_numero(bloco, a, b).items():
            t = junta_linhas(bl)
            t = re.sub(r"（\s*）\s*$", "", t).strip()
            q[n] = {"n": n, "secao": "R", "parte": 1, "tipo": "pareamento", "grupo": nome, "enunciado": t}

    # ---------- Reading parte 2 (51-60)
    for nome, (a, b) in (("R2a", (51, 55)), ("R2b", (56, 60))):
        bloco = fatia(linhas, rf"第{a}-{b}\s*题", r"第56-60\s*题" if a == 51 else r"第三部分")
        ops, exemplo = {}, None
        for ln in bloco[:6]:
            for m in re.finditer(r"([A-F])\s+([^\sA-F]+)", normaliza(ln)):
                ops.setdefault(m.group(1), m.group(2))
        # exemplo: pode ser 1 linha (51-55) ou diálogo A:/B: (56-60)
        ex_ini = next((i for i, l in enumerate(bloco) if l.strip().startswith("例如")), None)
        if ex_ini is not None:
            ex_lin = []
            for l in bloco[ex_ini:]:
                if re.match(r"^\s*\d{1,2}\s*[．.]", l):
                    break
                if normaliza(l):
                    ex_lin.append(normaliza(l))
            ex_txt = "\n".join(ex_lin)
            ex_txt = re.sub(r"^例如[：:]", "", ex_txt)
            mres = re.search(r"（\s*([A-F])\s*）", ex_txt)
            exemplo = {"texto": re.sub(r"（\s*[A-F]\s*）", "（＿＿）", ex_txt), "resposta": mres.group(1) if mres else None}
        grupos[nome] = {"questoes": list(range(a, b + 1)), "opcoes": ops, "exemplo": exemplo}
        for n, bl in blocos_por_numero(bloco, a, b).items():
            # mantém quebras entre falas A:/B:
            falas, buf = [], []
            for l in bl:
                l2 = normaliza(l)
                if not l2:
                    continue
                if re.match(r"^[AB][：:]", l2) and buf:
                    falas.append(junta_linhas(buf))
                    buf = []
                buf.append(l2)
            if buf:
                falas.append(junta_linhas(buf))
            txt = "\n".join(re.sub(r"（\s*）", "（＿＿）", f) for f in falas)
            q[n] = {"n": n, "secao": "R", "parte": 2, "tipo": "lacuna", "grupo": nome, "enunciado": txt}

    # ---------- Reading parte 3 (61-70)
    bloco = fatia(linhas, r"第61-70\s*题", r"书\s*写")
    for n, bl in blocos_por_numero(bloco, 61, 70).items():
        estrela = next((i for i, l in enumerate(bl) if l.strip().startswith("★")), None)
        texto = junta_linhas(bl[:estrela]) if estrela is not None else None
        resto = bl[estrela:] if estrela is not None else bl
        pergunta = normaliza(resto[0]).lstrip("★").strip() if resto else None
        _, ops = opcoes_abc(resto[1:])
        q[n] = {"n": n, "secao": "R", "parte": 3, "tipo": "abc", "texto": texto, "pergunta": pergunta, "opcoes": ops}

    # ---------- Writing parte 1 (71-75)
    bloco = fatia(linhas, r"第71-75\s*题", r"第二部分")
    for n, bl in blocos_por_numero(bloco, 71, 75).items():
        linha = " ".join(x for x in bl if x.strip())
        pecas = [normaliza(p) for p in re.split(r"\s{2,}", linha.strip()) if normaliza(p)]
        q[n] = {"n": n, "secao": "W", "parte": 1, "tipo": "ordenar", "pecas": pecas}

    # ---------- Writing parte 2 (76-80)
    bloco = fatia(linhas, r"第76-80\s*题")
    for n, bl in blocos_por_numero(bloco, 76, 80).items():
        bruto = "\n".join(bl)
        m = re.search(r"^(.*?)（\s*\n\s*([^\n]+?)\s*\n(?:[^\n]*\n)?\s*）(.*)$", bruto, re.S)
        if m:
            antes, py, depois = normaliza(m.group(1)), m.group(2).strip(), junta_linhas(m.group(3).splitlines())
            py = re.sub(r"[，。．、,.\s]+$", "", py)
        else:
            antes = py = depois = None
        q[n] = {"n": n, "secao": "W", "parte": 2, "tipo": "hanzi", "antes": antes, "pinyin": py, "depois": depois}

    return q, grupos


# ------------------------------------------------------------- roteiro


FALA = re.compile(r"^(男|女|问)[：:]\s*(.*)$")


def parse_falas(linhas):
    """Lista de falas [{fal, txt}] a partir de linhas com '男：' etc."""
    falas = []
    for l in linhas:
        l2 = normaliza(l)
        if not l2:
            continue
        m = FALA.match(l2)
        if m:
            falas.append({"fal": m.group(1), "txt": m.group(2).strip()})
        elif l2.startswith("★"):
            falas.append({"fal": "★", "txt": l2.lstrip("★").strip()})
        elif falas and falas[-1]["fal"] != "★":
            falas[-1]["txt"] += l2
        else:
            falas.append({"fal": None, "txt": l2})
    return falas


def parse_roteiro(linhas):
    """Roteiro completo do áudio, em ordem, como lista de segmentos."""
    if not linhas:
        return None, {}
    ini = next((i for i, l in enumerate(linhas) if "听力材料" in l), 0)
    fim = next((i for i, l in enumerate(linhas) if "听力考试现在结束" in l), len(linhas) - 1)
    corpo = linhas[ini + 1 : fim + 1]

    segmentos, por_questao = [], {}
    esperado, atual = 1, None
    buf_instr = []

    def fecha_instr():
        nonlocal buf_instr
        txt = [normaliza(x) for x in buf_instr if normaliza(x)]
        buf_instr = []
        if not txt:
            return
        # exemplos aparecem como blocos "例如：..." dentro das instruções
        bloco_ex, outros = [], []
        modo_ex = False
        for t in txt:
            if t.startswith("例如"):
                modo_ex = True
                bloco_ex.append(t.replace("例如：", "", 1).replace("例如:", "", 1))
                continue
            if modo_ex and (FALA.match(t) or t.startswith("★") or not re.match(r"^(现在开始|第[一二三四]部分|一共)", t)):
                bloco_ex.append(t)
                continue
            if modo_ex:
                segmentos.append({"tipo": "exemplo", "falas": parse_falas(bloco_ex)})
                bloco_ex, modo_ex = [], False
            segmentos.append({"tipo": "instrucao", "texto": t})
        if bloco_ex:
            segmentos.append({"tipo": "exemplo", "falas": parse_falas(bloco_ex)})

    linhas_q = {}
    for l in corpo:
        m = re.match(r"^\s*(\d{1,2})\s*[．.]\s*(.*)$", l)
        if m and int(m.group(1)) == esperado and esperado <= 40:
            fecha_instr()
            atual = esperado
            linhas_q[atual] = [m.group(2)]
            segmentos.append({"tipo": "questao", "n": atual})
            esperado += 1
            continue
        n2 = normaliza(l)
        if atual is not None and n2 and re.match(r"^(第[一二三四]部分|现在开始|听力考试现在结束|一共)", n2):
            atual = None
        if atual is not None:
            linhas_q[atual].append(l)
        else:
            buf_instr.append(l)
    fecha_instr()

    for n, ls in linhas_q.items():
        por_questao[n] = parse_falas(ls)
    # remove "（音乐，30秒，渐弱）" que não é fala
    for s in segmentos:
        if s.get("tipo") == "instrucao" and re.match(r"^（音乐", s["texto"]):
            s["tipo"] = "musica"
    return segmentos, por_questao


# ------------------------------------------------------------- gabarito


def parse_gabarito(linhas):
    txt = "\n".join(normaliza(l) for l in linhas)
    resp = {}
    for m in re.finditer(r"(\d{1,2})[．.]\s*([A-F√×])", txt):
        n = int(m.group(1))
        if 1 <= n <= 70 and n not in resp:
            resp[n] = m.group(2)
    for m in re.finditer(r"^(7[1-5])[．.]\s*(.+)$", txt, re.M):
        resp[int(m.group(1))] = m.group(2).strip()
    for m in re.finditer(r"^(7[6-9]|80)[．.]\s*(\S+)", txt, re.M):
        resp[int(m.group(1))] = m.group(2).strip()
    return resp


# ------------------------------------------------------------- imagens


def recorta_imagens(pdf: Path, pid: str):
    """Recorta as figuras A-F (1-5) e A-E (6-10) do listening parte 1."""
    destino = RAIZ / "public" / "img" / pid
    if destino.exists():
        for f in destino.glob("*.png"):
            f.unlink()
    destino.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    saida = {}
    for num, pg in enumerate(doc):
        if PAGINAS and not (PAGINAS[0] <= num + 1 <= PAGINAS[1]):
            continue
        txt = pg.get_text()
        if "第1-5" in txt and "第一部分" in txt:
            grupo = "L1a"
        elif "第6-10" in txt:
            grupo = "L1b"
        else:
            continue
        # rótulos A-F e suas posições
        rotulos = []
        for b in pg.get_text("words"):
            if b[4] in list("ABCDEF") and b[3] < pg.rect.height * 0.75:
                rotulos.append((b[4], fitz.Rect(b[:4])))
        rects = []
        for info in pg.get_image_info(xrefs=True):
            r = fitz.Rect(info["bbox"])
            if r.width > 12 and r.height > 30:
                rects.append(r)
        imgs = {}
        for letra, rr in rotulos:
            if letra in imgs:
                continue
            # o rótulo fica à esquerda da figura, na altura do meio dela:
            # pega a figura à direita cuja faixa vertical contém o rótulo
            cy = (rr.y0 + rr.y1) / 2
            cand = [r for r in rects if r.x0 >= rr.x1 - 2 and r.y0 - 10 <= cy <= r.y1 + 10]
            if not cand:
                continue
            melhor = min(cand, key=lambda r: r.x0 - rr.x1)
            imgs[letra] = melhor
        for letra, r in imgs.items():
            pix = pg.get_pixmap(clip=r, dpi=200)
            nome = f"{grupo}-{letra}.png"
            pix.save(destino / nome)
            saida.setdefault(grupo, {})[letra] = f"img/{pid}/{nome}"
    return saida


# ------------------------------------------------------------- principal


def main():
    global PAGINAS
    args = sys.argv[1:]
    saida = None
    if "--paginas" in args:
        i = args.index("--paginas")
        a, b = args[i + 1].split("-")
        PAGINAS = (int(a), int(b))
        del args[i : i + 2]
    if "--saida" in args:
        i = args.index("--saida")
        saida = Path(args[i + 1])
        del args[i : i + 2]
    pid, pdfs = args[0], [Path(a) for a in args[1:]]
    paginas = texto_paginas(pdfs)
    caderno, roteiro_l, gabarito_l = divide(paginas, pid)
    q, grupos = parse_caderno(caderno, pid)
    segmentos, falas_q = parse_roteiro(roteiro_l)
    gab = parse_gabarito(gabarito_l)
    # gabarito lido à mão da página renderizada (quando a camada de texto está corrompida/é imagem)
    manual = RAIZ / "data" / "gabaritos" / f"{pid}.json"
    if manual.exists():
        for k, v in json.loads(manual.read_text(encoding="utf-8"))["respostas"].items():
            gab[int(k)] = v
    imagens = recorta_imagens(pdfs[0], pid)
    for g, ims in imagens.items():
        grupos[g]["imagens"] = ims

    for n, item in q.items():
        r = gab.get(n)
        if item["tipo"] == "vf" and r:
            r = r == "√"
        if item["tipo"] in ("ordenar", "hanzi") and r and "/" in r:
            # o gabarito oficial às vezes aceita duas ordens: "A。/ B。"
            alts = [x.strip() for x in r.split("/") if x.strip()]
            r = alts[0]
            item["aceitasOficiais"] = alts[1:]
        item["resposta"] = r
        if item["secao"] == "L":
            falas = falas_q.get(n)
            item["audioTexto"] = falas
            if falas and item["tipo"] == "abc":
                perg = [f for f in falas if f["fal"] == "问"]
                item["pergunta"] = perg[-1]["txt"] if perg else None

    # prova sem 听力材料 oficial: usa a transcrição feita do áudio original (data/transcricoes/<ID>.json)
    transcricao = "oficial" if segmentos else None
    arq_tr = RAIZ / "data" / "transcricoes" / f"{pid}.json"
    if not segmentos and arq_tr.exists():
        tr = json.loads(arq_tr.read_text(encoding="utf-8"))
        modelo = json.loads((RAIZ / "data" / "provas" / "H31001.json").read_text(encoding="utf-8"))["roteiro"]
        segmentos = modelo  # instruções e exemplos são idênticos em todas as provas HSK 3
        for n, falas in tr["questoes"].items():
            it = q[int(n)]
            it["audioTexto"] = [{"fal": f.get("fal"), "txt": f["txt"]} for f in falas]
            if it["tipo"] == "abc":
                perg = [f for f in falas if f.get("fal") == "问"]
                it["pergunta"] = perg[-1]["txt"] if perg else None
        transcricao = "audio"

    prova = {
        "id": pid,
        "transcricao": transcricao,
        "fontes": [str(p.relative_to(RAIZ)) if p.is_relative_to(RAIZ) else str(p) for p in pdfs],
        "grupos": grupos,
        "roteiro": segmentos,
        "questoes": [q[n] for n in sorted(q)],
    }
    saida = saida or RAIZ / "data" / "provas" / f"{pid}.json"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(prova, ensure_ascii=False, indent=1), encoding="utf-8")

    # relatório rápido
    faltas = []
    for n in range(1, 81):
        it = q.get(n)
        if not it:
            faltas.append(f"{n}: ausente")
            continue
        if it.get("resposta") in (None, ""):
            faltas.append(f"{n}: sem resposta")
        if it["tipo"] == "abc" and len(it.get("opcoes", {})) != 3:
            faltas.append(f"{n}: opções {it.get('opcoes')}")
        if it["secao"] == "L" and not it.get("audioTexto"):
            faltas.append(f"{n}: sem transcrição")
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"{pid}: {len(q)} questões; imagens {sum(len(v) for v in imagens.values())}; problemas: {len(faltas)}")
    for f in faltas[:50]:
        print("  -", f)


if __name__ == "__main__":
    main()
