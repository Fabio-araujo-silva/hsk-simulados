"""Segmentação de palavras, pinyin e dicionário (CC-CEDICT + listas HSK).

Usado por enriquece.py. Regras pensadas para quem estuda HSK 3:
- prefere quebrar em palavras das listas HSK (很快 → 很 + 快; 去过 → 去 + 过);
- pinyin com contexto (pypinyin), partículas neutras (的/地/得/着/了/过 → de/zhe/le/guo),
  sandhi de 一 e 不 (como nos livros didáticos) e 儿化 (一点儿 → yìdiǎnr).
"""
from __future__ import annotations

import json
import re
import warnings
from functools import lru_cache
from pathlib import Path

warnings.filterwarnings("ignore")
import jieba  # noqa: E402
import jieba.posseg as pseg  # noqa: E402
from pypinyin import Style, pinyin  # noqa: E402

jieba.setLogLevel(60)
RAIZ = Path(__file__).resolve().parents[1]
DIC = RAIZ / "fontes" / "dic"

HAN = re.compile(r"[㐀-鿿]")
LACUNA = "（＿＿）"
PONT = set("，。？！、：；“”‘’（）《》…—-.,!?;:()\"'＿· ")

# ------------------------------------------------------------------ dicionários


@lru_cache(None)
def cedict() -> dict[str, list[tuple[str, list[str]]]]:
    out: dict[str, list[tuple[str, list[str]]]] = {}
    for ln in (DIC / "cedict_ts.u8").read_text(encoding="utf-8").splitlines():
        if ln.startswith("#"):
            continue
        m = re.match(r"^(\S+) (\S+) \[([^\]]+)\] /(.+)/$", ln)
        if not m:
            continue
        _trad, simp, py, defs = m.groups()
        out.setdefault(simp, []).append((py, defs.split("/")))
    return out


@lru_cache(None)
def hsk() -> dict[str, int]:
    """palavra → nível HSK 2.0 (1–6)."""
    dados = json.loads((DIC / "complete-hsk.json").read_text(encoding="utf-8"))
    out: dict[str, int] = {}
    for e in dados:
        for lv in e["level"]:
            if lv.startswith("old-"):
                n = int(lv[4:])
                w = e["simplified"]
                out[w] = min(out.get(w, 99), n)
    return out


@lru_cache(None)
def trad_para_simp() -> dict[str, str]:
    """Mapa caractere tradicional → simplificado (para limpar saída do whisper)."""
    m: dict[str, str] = {}
    for ln in (DIC / "cedict_ts.u8").read_text(encoding="utf-8").splitlines():
        if ln.startswith("#"):
            continue
        p = ln.split(" ", 2)
        if len(p) >= 2 and len(p[0]) == 1 and len(p[1]) == 1 and p[0] != p[1]:
            m.setdefault(p[0], p[1])
    return m


_preparado = False


def _prepara_jieba():
    global _preparado
    if _preparado:
        return
    for w, lv in hsk().items():
        if lv <= 4 and len(w) > 1:
            jieba.add_word(w, freq=max(jieba.get_FREQ(w) or 0, 60000))
    _preparado = True


# ------------------------------------------------------------------ segmentação


def _quebra_em_hsk(w: str) -> list[str] | None:
    """Quebra w inteiramente em palavras HSK (menor número de pedaços)."""
    H = hsk()
    n = len(w)
    melhor: list[list[str] | None] = [None] * (n + 1)
    melhor[0] = []
    for i in range(n):
        if melhor[i] is None:
            continue
        for j in range(i + 1, min(n, i + 6) + 1):
            p = w[i:j]
            if p in H and (melhor[j] is None or len(melhor[i]) + 1 < len(melhor[j])):
                melhor[j] = melhor[i] + [p]
    return melhor[n]


def _fmm(w: str) -> list[str]:
    """Máximo casamento à frente contra CEDICT ∪ HSK."""
    D, H = cedict(), hsk()
    out, i = [], 0
    while i < len(w):
        for j in range(min(len(w), i + 6), i, -1):
            if w[i:j] in D or w[i:j] in H or j == i + 1:
                out.append(w[i:j])
                i = j
                break
    return out


ERHUA_SILABA = {"儿子", "女儿", "儿童", "婴儿", "幼儿", "孤儿", "儿女", "健儿"}


def _refina(w: str, flag: str) -> list[tuple[str, str]]:
    H, D = hsk(), cedict()
    if not HAN.search(w) or len(w) == 1 or w in H:
        return [(w, flag)]
    partes = _quebra_em_hsk(w)
    # palavra de dicionário (搬家, 爱人, 钱包, 有意思…) fica inteira; só quebramos combinações
    # que não são palavra: verbo + 过/着/了, 很 + adjetivo, reduplicação + 的
    combinacao = (w[-1] in "过着了" and flag.startswith("v")) or w.startswith("很") or (len(w) >= 3 and w[0] == w[1] and w[-1] == "的")
    if w in D and not combinacao:
        return [(w, flag)]
    if partes and len(partes) > 1:
        res = [(p, "") for p in partes]
        fim = {"过": "ug", "着": "uz", "了": "ul"}.get(partes[-1])
        if fim and flag.startswith("v"):
            res[-1] = (partes[-1], fim)
        return res
    if w in D:
        return [(w, flag)]
    return [(p, "") for p in _fmm(w)]


def _hsk_ate4(w: str) -> bool:
    lv = hsk().get(w)
    return lv is not None and lv <= 4


def _repara(toks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Corrige cortes ruins: [手, 机关] → [手机, 关] quando tudo vira palavras HSK 1–4."""
    mudou = True
    while mudou:
        mudou = False
        for i, (w, _f) in enumerate(toks):
            if len(w) < 2 or not HAN.search(w) or _hsk_ate4(w):
                continue
            # palavra de dicionário só é desfeita se o vizinho formar com ela outra palavra HSK (手/机关 → 手机/关)
            dic = w in cedict()
            for a, b in ((i - 1, i), (i, i + 1)):
                if a < 0 or b >= len(toks) or not HAN.search(toks[a][0]) or not HAN.search(toks[b][0]):
                    continue
                junto = toks[a][0] + toks[b][0]
                partes = _quebra_em_hsk(junto)
                if dic and partes and not any(len(p) > 1 and p not in (toks[a][0], toks[b][0]) for p in partes):
                    continue
                if partes and all(_hsk_ate4(p) for p in partes) and partes != [toks[a][0], toks[b][0]]:
                    toks = toks[:a] + [(p, "") for p in partes] + toks[b + 1 :]
                    mudou = True
                    break
            if mudou:
                break
    return toks


@lru_cache(None)
def _correcoes() -> dict[str, list[str]]:
    arq = RAIZ / "data" / "segmentacao.json"
    if not arq.exists():
        return {}
    return {k: v for k, v in json.loads(arq.read_text(encoding="utf-8")).items() if not k.startswith("_")}


FLAG_UNICO = {"的": "uj", "了": "ul", "着": "uz", "过": "ug", "得": "ud", "地": "uv"}


def _corrige_contexto(toks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    texto = "".join(w for w, _ in toks)
    cortes, pos, flags = set(), 0, {}
    for w, f in toks:
        flags[(pos, len(w))] = f
        cortes.add(pos)
        pos += len(w)
    cortes.add(pos)
    mudou = False
    for trecho, pecas in _correcoes().items():
        ini = texto.find(trecho)
        while ini >= 0:
            mudou = True
            for c in range(ini + 1, ini + len(trecho)):
                cortes.discard(c)
            p = ini
            for pc in pecas:
                cortes.add(p)
                p += len(pc)
            cortes.add(p)
            ini = texto.find(trecho, ini + 1)
    if not mudou:
        return toks
    lim = sorted(cortes)
    out = []
    for a, b in zip(lim, lim[1:]):
        w = texto[a:b]
        out.append((w, flags.get((a, b - a), FLAG_UNICO.get(w, ""))))
    return out


def segmenta(texto: str) -> list[tuple[str, str]]:
    """[(palavra, classe)] — a lacuna （＿＿） vira um token só."""
    _prepara_jieba()
    out: list[tuple[str, str]] = []
    pedacos = texto.split(LACUNA)
    for k, ped in enumerate(pedacos):
        if k:
            out.append((LACUNA, "x"))
        if not ped:
            continue
        for par in pseg.cut(ped, HMM=False):
            w, f = par.word, par.flag
            if not w:
                continue
            # números árabes juntos; espaços somem
            if w.strip() == "":
                continue
            out.extend(_refina(w, f))
    out = _repara(out)
    out = _corrige_contexto(out)
    # junta dígitos/letras consecutivos que o jieba separou
    junto: list[tuple[str, str]] = []
    for w, f in out:
        if junto and re.fullmatch(r"[0-9A-Za-z.：:]+", w) and re.fullmatch(r"[0-9A-Za-z.：:]+", junto[-1][0]):
            junto[-1] = (junto[-1][0] + w, "m")
        else:
            junto.append((w, f))
    return junto


# ------------------------------------------------------------------ pinyin

TOM = {c: t for t, cs in enumerate(["", "āēīōūǖĀĒĪŌŪǕ", "áéíóúǘÁÉÍÓÚǗ", "ǎěǐǒǔǚǍĚǏǑǓǙ", "àèìòùǜÀÈÌÒÙǛ"]) for c in cs}


def tom(s: str) -> int:
    for c in s:
        if c in TOM:
            return TOM[c]
    return 5


NEUTRAS = {"uj": "de", "uv": "de", "ud": "de", "uz": "zhe", "ul": "le", "ug": "guo"}


def silabas(texto: str) -> list[str]:
    """Uma sílaba por caractere (vazio para não-chinês), com contexto da frase."""
    res = [""] * len(texto)
    for m in re.finditer(r"[㐀-鿿]+", texto):
        ps = pinyin(m.group(), style=Style.TONE, heteronym=False)
        for k, p in enumerate(ps):
            res[m.start() + k] = p[0]
    return res


def _sandhi(chars: list[str], sils: list[str]):
    """Sandhi de 一 e 不 (como nos livros: 一直 yìzhí, 一个 yí ge, 不是 bú shì)."""
    for i, c in enumerate(chars):
        prox = sils[i + 1] if i + 1 < len(sils) else ""
        ant = chars[i - 1] if i > 0 else ""
        if c == "不" and sils[i] in ("bù", "bú"):
            sils[i] = "bú" if prox and tom(prox) == 4 else "bù"
        elif c == "一" and sils[i] in ("yī", "yí", "yì"):
            seg = chars[i + 1] if i + 1 < len(chars) else ""
            if not prox or ant in ("第", "十", "期", "周", "初", "统", "唯", "万") or seg in ("月", "号", "日", "楼", "层", "零", "〇"):
                sils[i] = "yī"
            elif seg in ("个",):
                sils[i] = "yí"
            elif tom(prox) == 4:
                sils[i] = "yí"
            elif tom(prox) in (1, 2, 3):
                sils[i] = "yì"


def pinyin_tokens(tokens: list[tuple[str, str]]) -> list[str]:
    texto = "".join(w for w, _ in tokens)
    sils = silabas(texto)
    chars = list(texto)
    _sandhi(chars, sils)
    out, pos = [], 0
    for w, f in tokens:
        s = sils[pos : pos + len(w)]
        pos += len(w)
        if not HAN.search(w):
            out.append("")
            continue
        if len(w) == 1 and f in NEUTRAS:
            out.append(NEUTRAS[f])
            continue
        if w == "还" and pos < len(texto) and texto[pos] in "了给钱书":
            out.append("huán")
            continue
        if len(w) == 1 and w == "个" and pos >= 2 and chars[pos - 2] in "一两几这那每哪半":
            out.append("ge")
            continue
        # 儿化: 一点儿 → yìdiǎnr
        if len(w) > 1 and w.endswith("儿") and w not in ERHUA_SILABA:
            s = s[:-2] + [s[-2] + "r"] if len(s) >= 2 else s
        junto = ""
        for k, sil in enumerate(s):
            if k and sil and sil[0].lower() in "aāáǎàeēéěèoōóǒò":
                junto += "'"
            junto += sil
        out.append(junto)
    return out


def eh_pontuacao(w: str) -> bool:
    return all(c in PONT for c in w)


def frase(texto: str) -> dict:
    """Frase pronta para o app: {zh, tk, py}."""
    toks = segmenta(texto)
    return {"zh": texto, "tk": [w for w, _ in toks], "py": pinyin_tokens(toks)}


# ------------------------------------------------------------------ verbetes


def ingles(w: str) -> str | None:
    ents = cedict().get(w)
    if not ents:
        return None
    # prefere entradas que não sejam sobrenome/variante
    def ruim(defs):
        return all(d.startswith(("surname", "variant of", "old variant", "see ")) for d in defs)

    boas = [e for e in ents if not ruim(e[1])] or ents
    defs = [d for d in boas[0][1] if not d.startswith(("CL:", "Taiwan pr."))]
    return "; ".join(defs[:3])[:120] if defs else None


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")
    for t in sys.argv[1:] or ["电影马上就要开始了，（＿＿）手机关了吧。", "弟弟高兴地笑了。他长得很高，跑得很快。一点儿也不冷，我一直看手表。", "这个小孩儿胖胖的，真可爱。我去过北京，看着他不是一个人。"]:
        f = frase(t)
        print(" | ".join(f"{a}({b})" for a, b in zip(f["tk"], f["py"])))
