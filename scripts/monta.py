"""Monta os JSONs que o app lê, a partir das fontes editáveis:

  data/provas/<ID>.json   — frases do 第一部分 (+ PT), figuras e perguntas, respostas-modelo, vocabulário
  data/meta.json          — título, formato e procedência de cada prova
  data/tempos/<ID>.json   — tempos no áudio original (scripts/tempos.py)
  data/lexico_base.json   — glossário PT herdado do app do HSK 3
  data/lexico_pt.json     — glosas PT das palavras novas

    python scripts/monta.py          → public/conteudo/provas/<ID>.json, index.json, public/conteudo/lexico.json
                                       + data/trabalho/lexico-pendente.json (palavras ainda sem glosa PT)
"""
from __future__ import annotations

import json
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import textos  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
DATA = RAIZ / "data"
PUB = RAIZ / "public" / "conteudo"
CITACAO = {"不": "bù", "一": "yī"}


def le(p: Path, padrao=None):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else padrao


def grava(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def duracao(mp3: Path) -> float | None:
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)], capture_output=True, text=True)
        return round(float(r.stdout.strip()), 1)
    except Exception:
        return None


def normaliza(t: str) -> str:
    """Troca radicais Kangxi / ideogramas de compatibilidade (PDFs redigitados) pelos caracteres comuns,
    sem mexer na pontuação chinesa de largura cheia."""
    return "".join(unicodedata.normalize("NFKC", c) if "⺀" <= c <= "⿟" or "豈" <= c <= "﫿" else c for c in t)


def F(zh: str, pt: str | None = None, chars: list | None = None) -> dict:
    """Frase pronta para o app: {zh, tk, py, pt?, a?}. `chars` = tempo de cada caractere chinês (na ordem)."""
    zh = normaliza(zh)
    f = textos.frase(zh)
    if pt:
        f["pt"] = pt
    if chars:
        # completa caracteres sem tempo (ex.: 他/她 que o Scribe ouviu diferente) com o vizinho
        cs = list(chars)
        for i in range(len(cs)):
            if cs[i] is None:
                viz = next((cs[j] for j in range(i + 1, len(cs)) if cs[j]), None) or next((cs[j] for j in range(i - 1, -1, -1) if cs[j]), None)
                if viz:
                    cs[i] = [round(viz[0] - 0.2, 2), viz[0]] if i < len(cs) - 1 else [viz[1], round(viz[1] + 0.2, 2)]
        it = iter(cs)
        a = []
        for w in f["tk"]:
            hs = [next(it, None) for c in w if textos.HAN.match(c)]
            hs = [h for h in hs if h]
            a.append([hs[0][0], hs[-1][1]] if hs else None)
        if any(a):
            f["a"] = a
    return f


def frases(lista: list[dict]) -> list[dict]:
    return [F(x["zh"], x.get("pt")) for x in lista]


def monta(pid: str, meta: dict) -> dict:
    p = le(DATA / "provas" / f"{pid}.json")
    t = le(DATA / "tempos" / f"{pid}.json")
    if not t:
        raise SystemExit(f"{pid}: falta data/tempos/{pid}.json (rode scripts/tempos.py)")
    tq = t["q"]
    qs = []
    for it in p["parte1"]:
        n = it["n"]
        tt = {k: v for k, v in tq[str(n)].items() if k != "chars"}
        qs.append({"n": n, "parte": 1, "frase": F(it["zh"], it.get("pt"), tq[str(n)].get("chars")), "t": tt})
    for parte, chave in ((2, "parte2"), (3, "parte3")):
        for it in p.get(chave, []):
            n = it["n"]
            q = {
                "n": n,
                "parte": parte,
                "t": tq[str(n)],
                "modelos": [{"nivel": m.get("nivel", ""), "frases": frases(m["frases"])} for m in it.get("modelos", [])],
                "vocab": it.get("vocab", []),
                "estruturas": [
                    {"zh": e["zh"], "pt": e.get("pt", ""), **({"ex": F(e["ex"], e.get("exPt"))} if e.get("ex") else {})}
                    for e in it.get("estruturas", [])
                ],
            }
            if parte == 2:
                q["img"] = it.get("img") or f"img/{pid}/{n}.jpg"
                q["cena"] = it.get("cena", "")
            else:
                q["pergunta"] = F(it["zh"], it.get("pt"))
            qs.append(q)
    audio = RAIZ / "public" / "audio" / f"{pid}.mp3"
    return {
        "id": pid,
        "titulo": meta.get("titulo", pid),
        "formato": meta.get("formato"),
        "cabecalho": meta.get("cabecalho"),
        "fontes": {k: meta.get(k) for k in ("caderno", "roteiro", "audio", "notas")},
        "audio": {"src": f"audio/{pid}.mp3", "duracao": duracao(audio)} if audio.exists() else None,
        "aquecimento": [{**a, "frase": F(a["zh"])} for a in t.get("aquecimento", [])],
        "preparo": t.get("preparo"),
        "fim": t.get("fim"),
        "questoes": qs,
    }


def lexico(provas: list[dict]):
    base = le(DATA / "lexico_base.json", {}) or {}
    pt_novo = le(DATA / "lexico_pt.json", {}) or {}
    contagem: dict[str, int] = {}
    pys: dict[str, dict[str, int]] = {}
    exemplos: dict[str, str] = {}

    def anda(f):
        for w, py in zip(f["tk"], f["py"]):
            if textos.eh_pontuacao(w) or not textos.HAN.search(w):
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

    for p in provas:
        varre(p)
    H = textos.hsk()
    lex, pendentes = {}, []
    for w in sorted(contagem, key=lambda x: -contagem[x]):
        py = CITACAO.get(w) or max(pys[w].items(), key=lambda kv: kv[1])[0]
        v = {"py": py}
        en = textos.ingles(w) or (base.get(w) or {}).get("en")
        if en:
            v["en"] = en
        if w in H:
            v["hsk"] = H[w]
        pt = pt_novo.get(w) or (base.get(w) or {}).get("pt")
        if pt:
            v["pt"] = pt
        else:
            pendentes.append({"w": w, "py": py, "en": en, "hsk": H.get(w), "exemplo": exemplos[w]})
        lex[w] = v
    grava(PUB / "lexico.json", lex)
    (DATA / "trabalho").mkdir(parents=True, exist_ok=True)
    (DATA / "trabalho" / "lexico-pendente.json").write_text(json.dumps(pendentes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"léxico: {len(lex)} palavras; sem glosa PT: {len(pendentes)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    meta = le(DATA / "meta.json", {})
    provas, indice = [], []
    for pid in sorted(meta, key=lambda k: meta[k].get("ordem", 99)):
        if not (DATA / "provas" / f"{pid}.json").exists():
            continue
        p = monta(pid, meta[pid])
        grava(PUB / "provas" / f"{pid}.json", p)
        provas.append(p)
        partes = {q["parte"] for q in p["questoes"]}
        indice.append(
            {
                "id": pid,
                "titulo": p["titulo"],
                "formato": p["formato"],
                "fontes": {k: v for k, v in p["fontes"].items() if k != "notas"},
                "duracaoAudio": (p["audio"] or {}).get("duracao"),
                "completa": partes == {1, 2, 3} and all(q.get("modelos") for q in p["questoes"] if q["parte"] > 1),
            }
        )
        print(f"{pid}: {len(p['questoes'])} questões")
    grava(PUB / "provas" / "index.json", indice)
    lexico(provas)
