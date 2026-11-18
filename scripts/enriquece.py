"""Monta os JSONs finais do app a partir de:

  data/provas/<ID>.json        — prova extraída do PDF oficial (parse_pdf.py)
  data/traducoes/<ID>.json     — traduções PT + explicações (agentes; ver DOSSIE)
  data/alinhamento/<ID>.json   — tempos de cada caractere no áudio (alinha.py)
  data/lexico_pt.json          — glossário PT (agentes)

Comandos:
  python scripts/enriquece.py dossie <ID>   → data/trabalho/<ID>.md + <ID>-frases.json (para tradutores)
  python scripts/enriquece.py montar <ID>   → public/conteudo/provas/<ID>.json
  python scripts/enriquece.py lexico        → public/conteudo/lexico.json + data/trabalho/lexico-pendente.json
  python scripts/enriquece.py indice        → public/conteudo/provas/index.json
  python scripts/enriquece.py tudo          → montar todas + lexico + indice
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import textos  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
DATA = RAIZ / "data"
PUB = RAIZ / "public" / "conteudo"
LACUNA = textos.LACUNA


def le(p: Path, padrao=None):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else padrao


def grava(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def grava_bonito(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------ textos


def preenche(txt: str, palavra: str | None) -> str:
    return txt.replace(LACUNA, palavra) if palavra else txt


def textos_da_prova(p: dict) -> list[dict]:
    """Lista de todos os textos chineses da prova, com contexto, para tradução."""
    itens: list[dict] = []
    vistos: set[str] = set()

    def add(zh: str | None, ctx: str, lacuna: bool = False):
        if not zh or zh in vistos:
            return
        vistos.add(zh)
        itens.append({"zh": zh, "ctx": ctx, **({"lacuna": True} if lacuna else {})})

    for s in p.get("roteiro") or []:
        if s["tipo"] == "instrucao":
            add(s["texto"], "instrução do áudio")
        elif s["tipo"] == "exemplo":
            for f in s["falas"]:
                add(f["txt"], "exemplo do áudio")
    for g, gr in p["grupos"].items():
        for l, op in (gr.get("opcoes") or {}).items():
            add(op, f"grupo {g} opção {l}")
        ex = gr.get("exemplo")
        if ex:
            for linha in ex["texto"].split("\n"):
                add(preenche(linha.replace("（＿＿）", LACUNA), (gr.get("opcoes") or {}).get(ex["resposta"])), f"grupo {g} exemplo")
    for q in p["questoes"]:
        n = q["n"]
        for f in q.get("audioTexto") or []:
            add(f["txt"], f"q{n} áudio ({f['fal'] or 'narrador'})")
        add(q.get("afirmacao"), f"q{n} afirmação ★")
        add(q.get("pergunta"), f"q{n} pergunta")
        add(q.get("texto"), f"q{n} texto")
        for l, op in (q.get("opcoes") or {}).items():
            add(op, f"q{n} opção {l}")
        if q["tipo"] in ("pareamento", "imagem"):
            add(q.get("enunciado"), f"q{n} frase")
        if q["tipo"] == "imagem-vf":
            add(q.get("palavra"), f"q{n} palavra ao lado da figura")
        if q["tipo"] == "lacuna":
            resp = (p["grupos"][q["grupo"]].get("opcoes") or {}).get(q.get("resposta"))
            for linha in q["enunciado"].split("\n"):
                if LACUNA in linha:
                    add(linha, f"q{n} linha com lacuna (traduza deixando ___ no lugar da palavra)", lacuna=True)
                    add(preenche(linha, resp), f"q{n} linha completa (lacuna preenchida com {resp})")
                else:
                    add(linha, f"q{n} linha")
        if q["tipo"] == "ordenar" and q.get("resposta"):
            add(q["resposta"], f"q{n} frase correta (escrita)")
            for alt in q.get("aceitasOficiais") or []:
                add(alt, f"q{n} outra ordem aceita pelo gabarito oficial")
        if q["tipo"] == "hanzi" and q.get("resposta"):
            completa = f"{q.get('antes') or ''}{q['resposta']}{q.get('depois') or ''}"
            add(completa, f"q{n} frase completa (escrita, caractere {q['resposta']})")
            add(f"{q.get('antes') or ''}{LACUNA}{q.get('depois') or ''}", f"q{n} frase com lacuna (traduza deixando ___)", lacuna=True)
    return itens


def dossie(pid: str):
    """Gera o material para os agentes tradutores/explicadores."""
    p = le(DATA / "provas" / f"{pid}.json")
    itens = textos_da_prova(p)
    trab = DATA / "trabalho"
    grava_bonito(trab / f"{pid}-frases.json", itens)

    L = [f"# {pid} — dossiê para tradução e explicações\n"]
    for q in p["questoes"]:
        n, tipo = q["n"], q["tipo"]
        L.append(f"\n## {n} · {q['secao']}{q['parte']} · {tipo}")
        g = p["grupos"].get(q.get("grupo") or "", {})
        if tipo == "imagem":
            L.append(f"(figuras {', '.join(g.get('letras', []))}; exemplo usa {g.get('exemploUsa')}) — figura correta: {q['resposta']}  [arquivos: public/{(g.get('imagens') or {}).get(str(q['resposta']), '?')}]")
            if q.get("enunciado"):
                L.append(f"frase: {q['enunciado']}")
        if tipo == "imagem-vf":
            L.append(f"(uma figura: public/{q.get('imagem')}) — a figura corresponde? resposta: {'√ certo' if q['resposta'] else '× errado'}")
            if q.get("palavra"):
                L.append(f"palavra impressa: {q['palavra']}")
        if tipo == "imagem-abc":
            L.append(f"(três figuras A/B/C: {', '.join('public/' + v for v in (q.get('imagens') or {}).values())}) — figura correta: {q['resposta']}")
        if q.get("audioTexto"):
            L.append("Áudio:")
            for f in q["audioTexto"]:
                L.append(f"  {f['fal'] or ''}：{f['txt']}")
        for k in ("afirmacao", "texto", "pergunta"):
            if q.get(k):
                L.append(f"{k}: {q[k]}")
        if q.get("opcoes"):
            L.append("opções: " + " | ".join(f"{a} {b}" for a, b in q["opcoes"].items()))
        if tipo in ("pareamento", "lacuna"):
            L.append("opções do grupo: " + " | ".join(f"{a} {b}" for a, b in (g.get("opcoes") or {}).items()))
            if g.get("exemplo"):
                L.append(f"(exemplo do grupo usa {g['exemplo']['resposta']})")
            L.append(f"enunciado: {q.get('enunciado')}")
        if tipo == "ordenar":
            L.append(f"peças: {' / '.join(q.get('pecas') or [])}")
            if q.get("aceitasOficiais"):
                L.append(f"(o gabarito oficial também aceita: {' / '.join(q['aceitasOficiais'])})")
        if tipo == "hanzi":
            L.append(f"frase: {q.get('antes')}（{q.get('pinyin')}）{q.get('depois')}")
        L.append(f"**resposta oficial: {q['resposta']}**")
    (trab / f"{pid}.md").write_text("\n".join(L), encoding="utf-8")
    print(f"{pid}: {len(itens)} textos → data/trabalho/{pid}-frases.json e {pid}.md")


# ------------------------------------------------------------------ montagem


def tempos_tokens(tk: list[str], chars: list | None):
    """Agrega tempos por caractere em tempos por token."""
    if not chars:
        return None
    out, pos = [], 0
    for w in tk:
        cs = [c for c in chars[pos : pos + len(w)] if c]
        pos += len(w)
        if not cs or textos.eh_pontuacao(w):
            out.append(None)
        else:
            out.append([round(cs[0][0], 2), round(cs[-1][1], 2)])
    return out if any(out) else None


class Montador:
    def __init__(self, pid: str):
        self.pid = pid
        self.p = le(DATA / "provas" / f"{pid}.json")
        tr = le(DATA / "traducoes" / f"{pid}.json", {}) or {}
        comum = le(DATA / "traducoes" / "_comum.json", {}) or {}
        self.pt = {**comum.get("frases", {}), **tr.get("frases", {})}
        self.ptL = {**comum.get("lacunas", {}), **tr.get("lacunas", {})}
        self.expl = tr.get("questoes", {})
        self.aceitas = tr.get("aceitas", {})
        self.al = le(DATA / "alinhamento" / f"{pid}.json", None)
        self.faltando: list[str] = []

    def F(self, zh: str | None, chars=None, chars2=None, lacuna_de: str | None = None) -> dict | None:
        if zh is None:
            return None
        f = textos.frase(zh)
        pt = self.pt.get(zh)
        if lacuna_de is not None:
            pt = self.pt.get(lacuna_de)
            ptl = self.ptL.get(zh)
            if ptl:
                f["ptL"] = ptl
        if pt:
            f["pt"] = pt
        elif textos.HAN.search(zh):
            self.faltando.append(zh)
        a = tempos_tokens(f["tk"], chars)
        a2 = tempos_tokens(f["tk"], chars2)
        if a:
            f["a"] = a
        if a2:
            f["a2"] = a2
        return f

    def monta(self) -> dict:
        p, al = self.p, self.al or {}
        alq = al.get("questoes", {})
        grupos = {}
        for g, gr in p["grupos"].items():
            ng = {k: v for k, v in gr.items() if k not in ("opcoes", "exemplo")}
            if gr.get("opcoes"):
                ng["opcoes"] = {l: self.F(t) for l, t in gr["opcoes"].items()}
            if gr.get("exemplo"):
                ex = gr["exemplo"]
                resp = (gr.get("opcoes") or {}).get(ex["resposta"])
                linhas = ex["texto"].split("\n")
                # o exemplo vem com a resposta já preenchida (como no caderno)
                cheias = [preenche(l.replace("（＿＿）", LACUNA), resp) for l in linhas]
                fex = self.F(" ".join(cheias))
                pts = [self.pt.get(l) for l in cheias]
                if fex is not None and all(pts):
                    fex["pt"] = " ".join(pts)
                ng["exemplo"] = {"texto": fex, "resposta": ex["resposta"]}
            grupos[g] = ng

        questoes = []
        for q in p["questoes"]:
            n = q["n"]
            nq = {k: q[k] for k in ("n", "secao", "parte", "tipo", "resposta") if k in q}
            if q.get("grupo"):
                nq["grupo"] = q["grupo"]
            a = alq.get(str(n), {})
            if q["secao"] == "L":
                if a.get("s") is not None:
                    nq["audio"] = {k: round(a[k], 2) for k in ("s", "e", "s2", "e2") if a.get(k) is not None}
                falas = []
                for i, f in enumerate(q.get("audioTexto") or []):
                    c1 = (a.get("falas") or [None] * 99)[i] if a.get("falas") else None
                    c2 = (a.get("falas2") or [None] * 99)[i] if a.get("falas2") else None
                    falas.append({"fal": f["fal"], "f": self.F(f["txt"], c1, c2)})
                nq["falas"] = falas or None
                if q["tipo"] == "vf":
                    nq["afirmacao"] = self.F(q["afirmacao"])
                if q.get("imagem"):
                    nq["imagem"] = q["imagem"]
                if q.get("imagens"):
                    nq["imagens"] = q["imagens"]
                if q["tipo"] == "abc":
                    nq["opcoes"] = {l: self.F(t) for l, t in q["opcoes"].items()}
                    if q.get("pergunta"):
                        nq["pergunta"] = self.F(q["pergunta"])
            elif q["tipo"] in ("pareamento", "imagem"):
                nq["texto"] = self.F(q.get("enunciado"))
            elif q["tipo"] == "imagem-vf":
                nq["imagem"] = q.get("imagem")
                nq["palavra"] = self.F(q.get("palavra"))
            elif q["tipo"] == "vf":  # HSK 2 leitura parte 3: frase + afirmação ★
                nq["texto"] = self.F(q.get("texto"))
                nq["afirmacao"] = self.F(q.get("afirmacao"))
            elif q["tipo"] == "lacuna":
                resp = (p["grupos"][q["grupo"]].get("opcoes") or {}).get(q.get("resposta"))
                nq["linhas"] = [self.F(l, lacuna_de=preenche(l, resp)) if LACUNA in l else self.F(l) for l in q["enunciado"].split("\n")]
            elif q["tipo"] == "abc":
                nq["texto"] = self.F(q["texto"])
                nq["pergunta"] = self.F(q["pergunta"])
                nq["opcoes"] = {l: self.F(t) for l, t in q["opcoes"].items()}
            elif q["tipo"] == "ordenar":
                nq["pecas"] = [self.F(pc) for pc in q["pecas"]]
                nq["frase"] = self.F(q["resposta"])
                aceitas = list(dict.fromkeys((q.get("aceitasOficiais") or []) + (self.aceitas.get(str(n)) or [])))
                if aceitas:
                    nq["aceitas"] = aceitas
            elif q["tipo"] == "hanzi":
                completa = f"{q.get('antes') or ''}{q['resposta']}{q.get('depois') or ''}"
                nq["frase"] = self.F(completa)
                nq["antes"], nq["depois"], nq["pinyin"] = q.get("antes"), q.get("depois"), q.get("pinyin")
                if q.get("aceitasOficiais"):
                    nq["aceitas"] = q["aceitasOficiais"]
            ex = self.expl.get(str(n)) or {}
            for k in ("explicacao", "trecho", "palavras"):
                if ex.get(k):
                    nq[k] = ex[k]
            questoes.append(nq)

        roteiro = None
        if p.get("roteiro"):
            roteiro = []
            als = al.get("segmentos", [])
            for i, s in enumerate(p["roteiro"]):
                a = als[i] if i < len(als) else {}
                ns = {"tipo": s["tipo"]}
                if s["tipo"] == "questao":
                    ns["n"] = s["n"]
                elif s["tipo"] == "exemplo":
                    ns["falas"] = [{"fal": f["fal"], "f": self.F(f["txt"], (a.get("falas") or [None] * 99)[j] if a.get("falas") else None)} for j, f in enumerate(s["falas"])]
                else:
                    ns["f"] = self.F(s["texto"], a.get("chars"))
                if a.get("s") is not None:
                    ns["s"], ns["e"] = round(a["s"], 2), round(a["e"], 2)
                roteiro.append(ns)

        meta = le(DATA / "provas" / "meta.json", {}).get(self.pid, {})
        audio = None
        arq = RAIZ / "public" / "audio" / f"{self.pid}.mp3"
        if arq.exists() and al:
            audio = {"src": f"audio/{self.pid}.mp3", "duracao": round(al.get("duracao", 0), 1)}
        elif arq.exists():
            audio = {"src": f"audio/{self.pid}.mp3", "duracao": meta.get("duracao", 0)}
        return {
            "id": self.pid,
            "nivel": p.get("nivel") or int(self.pid[1]),
            "titulo": meta.get("titulo", "prova oficial"),
            "origem": meta.get("origem"),
            "transcricao": p.get("transcricao", "oficial") if p.get("roteiro") else None,
            "audio": audio,
            "grupos": grupos,
            "roteiro": roteiro,
            "questoes": questoes,
        }


def montar(pid: str):
    m = Montador(pid)
    prova = m.monta()
    grava(PUB / "provas" / f"{pid}.json", prova)
    falta = len(set(m.faltando))
    print(f"{pid}: montado ({len(prova['questoes'])} questões; áudio {'sim' if prova['audio'] else 'não'}; alinhamento {'sim' if m.al else 'não'}; sem tradução: {falta})")


# ------------------------------------------------------------------ léxico


CITACAO = {"不": "bù", "一": "yī"}


def lexico():
    pt = le(DATA / "lexico_pt.json", {}) or {}
    for arq in sorted((DATA / "lexico_pt").glob("*.json")):
        pt.update(le(arq, {}) or {})
    contagem: dict[str, int] = {}
    pys: dict[str, dict[str, int]] = {}
    exemplos: dict[str, str] = {}

    def anda(f):
        if not f:
            return
        for w, py in zip(f["tk"], f["py"]):
            if textos.eh_pontuacao(w) or not textos.HAN.search(w) or w == LACUNA:
                continue
            contagem[w] = contagem.get(w, 0) + 1
            pys.setdefault(w, {})
            pys[w][py] = pys[w].get(py, 0) + 1
            exemplos.setdefault(w, f["zh"])

    def varre(o):
        if isinstance(o, dict):
            if "tk" in o and "py" in o:
                anda(o)
            else:
                for v in o.values():
                    varre(v)
        elif isinstance(o, list):
            for v in o:
                varre(v)

    for arq in sorted((PUB / "provas").glob("H*.json")):
        varre(le(arq))
    H = textos.hsk()
    lex, pendentes = {}, []
    for w in sorted(contagem, key=lambda x: -contagem[x]):
        py = CITACAO.get(w) or max(pys[w].items(), key=lambda kv: kv[1])[0]
        v = {"py": py}
        en = textos.ingles(w)
        if en:
            v["en"] = en
        if w in H:
            v["hsk"] = H[w]
        if pt.get(w):
            v["pt"] = pt[w]
        else:
            pendentes.append({"w": w, "py": py, "en": en, "hsk": H.get(w), "exemplo": exemplos[w]})
        lex[w] = v
    grava(PUB / "lexico.json", lex)
    grava_bonito(DATA / "trabalho" / "lexico-pendente.json", pendentes)
    print(f"léxico: {len(lex)} palavras; sem glosa PT: {len(pendentes)}")


def indice():
    meta = le(DATA / "provas" / "meta.json", {}) or {}
    out = []
    for arq in sorted((PUB / "provas").glob("H*.json")):
        p = le(arq)
        out.append(
            {
                "id": p["id"],
                "nivel": p.get("nivel") or int(p["id"][1]),
                "titulo": p["titulo"],
                "origem": p.get("origem"),
                "temAudio": bool(p.get("audio")),
                "transcricao": p.get("transcricao"),
                "temAlinhamento": any(q.get("audio") for q in p["questoes"]),
                "duracaoAudio": (p.get("audio") or {}).get("duracao"),
                "ordem": meta.get(p["id"], {}).get("ordem", 99),
            }
        )
    out.sort(key=lambda x: (x["ordem"], x["id"]))
    for o in out:
        o.pop("ordem")
    grava(PUB / "provas" / "index.json", out)
    print(f"índice: {len(out)} provas")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1]
    if cmd == "dossie":
        for pid in sys.argv[2:]:
            dossie(pid)
    elif cmd == "montar":
        for pid in sys.argv[2:]:
            montar(pid)
    elif cmd == "lexico":
        lexico()
    elif cmd == "indice":
        indice()
    elif cmd == "tudo":
        for arq in sorted((DATA / "provas").glob("H*.json")):
            montar(arq.stem)
        lexico()
        indice()
