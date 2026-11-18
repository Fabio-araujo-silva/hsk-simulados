"""Monta os exemplos (例如) do início de cada parte → public/conteudo/exemplos.json

No caderno do HSK cada parte começa com um item de exemplo já respondido, e no áudio o exemplo
é lido antes da 1ª questão. Os exemplos são padronizados por nível (todas as provas do nível têm
o mesmo), então o arquivo é um só, por nível e por bloco da folha:

  {"1": [{"parte": "L1", "bloco": "L1", "roteiro": 0, "itens": [...]}, ...], "2": [...], "3": [...]}

  bloco    — chave do bloco na folha da prova: o grupo (ex.: "L1a", "R2b") ou a parte ("L2")
  roteiro  — índice do segmento "exemplo" no roteiro da prova (listening): o texto falado e o
             trecho do áudio (s/e) vêm da PRÓPRIA prova, porque o tempo muda de prova para prova
             (e em algumas provas do HSK 1 o exemplo da 4ª parte diz 他, em outras 她)
  itens    — um ou dois itens (a 1ª parte do HSK 1/2 e a 2ª do HSK 3 trazem um certo e um errado):
     falas      índices das falas do segmento do roteiro que pertencem a este item
     figura     letra da figura do grupo do bloco (prova.grupos[bloco].imagens) — nunca inventada
     texto / afirmacao (★) / pergunta / opcoes / pecas / frase / antes / depois / pinyin
     resposta   letra, true/false ou o caractere/frase da escrita
     destaque   palavra a realçar no texto (lacuna já preenchida)
     explica    por que a resposta é essa (português)
     origem     "dado"     — tirado de public/conteudo/provas (grupos[..].exemplo, exemploUsa, roteiro)
                "deduzido" — a resposta sai do próprio texto (ex.: ★ certo/errado, resposta dita no diálogo)
                "conferir" — texto/alternativas impressas no caderno que NÃO estão nos dados, escritas aqui
                             de memória do caderno padrão do HSK (alta confiança, mas falta conferir no PDF)
     conferir   true quando origem == "conferir"

Os textos que não estão nos dados (EXTRAS abaixo) vêm com as palavras separadas por espaço; o pinyin
de cada palavra sai do próprio corpus das provas (a leitura mais comum) e, se faltar, do pypinyin.

  python scripts/exemplos.py          → grava public/conteudo/exemplos.json
  python scripts/exemplos.py --checa  → só confere se os exemplos são iguais em todas as provas
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PROVAS = RAIZ / "public" / "conteudo" / "provas"
SAIDA = RAIZ / "public" / "conteudo" / "exemplos.json"

PONT = set("，。？！、：；“”‘’（）《》…—-.,!?;:()\"'＿· ★")

# ------------------------------------------------------------------ textos que não estão nos dados
# (palavras separadas por espaço; "pt" é a tradução)


def T(zh: str, pt: str | None = None) -> dict:
    return {"zh": zh, "pt": pt}


# por nível: bloco → itens. Os campos com T(...) são tokenizados; "falas" aponta para o roteiro.
EXTRAS: dict[int, list[dict]] = {
    1: [
        {
            "parte": "L1",
            "bloco": "L1",
            "roteiro": 0,
            "itens": [
                {"falas": [0], "resposta": True, "origem": "conferir", "explica": "No caderno, a figura deste item combina com 很高兴 (“muito contente”) → √. A figura não está no app."},
                {"falas": [1], "resposta": False, "origem": "conferir", "explica": "No caderno, a figura deste item não mostra 看电影 (“ver um filme”) → ×. A figura não está no app."},
            ],
        },
        {
            "parte": "L2",
            "bloco": "L2",
            "roteiro": 1,
            "itens": [
                {"falas": [0], "origem": "deduzido", "explica": "Ouve-se 这是我的书 (“este é o meu livro”): a resposta é a figura em que aparece um livro. As três figuras do exemplo não estão no app."},
            ],
        },
        {
            "parte": "L3",
            "bloco": "L3",
            "roteiro": 2,
            "itens": [{"falas": [0, 1], "figura": "exemploUsa", "origem": "dado", "explica": "Duas pessoas se cumprimentam (你好！很高兴认识你) → a figura delas apertando as mãos."}],
        },
        {
            "parte": "L4",
            "bloco": "L4",
            "roteiro": 3,
            "itens": [
                {
                    "falas": [0, 1],
                    "opcoes": {"A": T("商店", "loja"), "B": T("医院", "hospital"), "C": T("学校", "escola")},
                    "resposta": "A",
                    "origem": "conferir",
                    "explica": "下午我去商店 — “à tarde eu vou à loja”: a resposta é 商店 (dita no áudio). As alternativas impressas são do caderno padrão.",
                }
            ],
        },
        {
            "parte": "R2",
            "bloco": "R2",
            "itens": [
                {
                    "texto": T("我 很 喜欢 这 本 书 。", "Eu gosto muito deste livro."),
                    "figura": "exemploUsa",
                    "origem": "conferir",
                    "explica": "A frase fala de um livro → a figura da moça lendo. A letra da figura vem dos dados; a frase é a do caderno padrão.",
                }
            ],
        },
        {"parte": "R3", "bloco": "R3", "itens": [{"grupo": True, "origem": "dado", "explica": "你喝水吗？ (“você bebe água?”) → 好的，谢谢！ (“sim, obrigado!”)."}]},
        {"parte": "R4", "bloco": "R4", "itens": [{"grupo": True, "origem": "dado", "explica": "你叫什么名字？ — “qual é o seu nome?”: a lacuna pede 名字 (nome)."}]},
    ],
    2: [
        {
            "parte": "L1",
            "bloco": "L1",
            "roteiro": 0,
            "itens": [
                {"falas": [0], "resposta": True, "origem": "conferir", "explica": "No caderno, a figura deste item mostra uma família de três pessoas → √. A figura não está no app."},
                {"falas": [1], "resposta": False, "origem": "conferir", "explica": "No caderno, a figura deste item não mostra alguém indo de ônibus ao trabalho → ×. A figura não está no app."},
            ],
        },
        {
            "parte": "L2",
            "bloco": "L2a",
            "roteiro": 1,
            "itens": [{"falas": [0, 1], "figura": "exemploUsa", "origem": "dado", "explica": "我最喜欢踢足球 — “o que eu mais gosto é jogar futebol” → a figura da moça com a bola de futebol."}],
        },
        {
            "parte": "L3",
            "bloco": "L3",
            "roteiro": 2,
            "itens": [
                {
                    "falas": [0, 1, 2],
                    "opcoes": {"A": T("红色", "vermelho"), "B": T("黑色", "preto"), "C": T("白色", "branco")},
                    "resposta": "A",
                    "origem": "conferir",
                    "explica": "左边那个红色的是我的 — “o vermelho da esquerda é o meu”: a resposta é 红色 (dita no áudio). As alternativas impressas são do caderno padrão.",
                }
            ],
        },
        {
            "parte": "L4",
            "bloco": "L4",
            "roteiro": 3,
            "itens": [
                {
                    "falas": [0, 1, 2, 3, 4],
                    "opcoes": {"A": T("名字", "nome"), "B": T("时间", "horário"), "C": T("房间 号", "número do quarto")},
                    "resposta": "A",
                    "origem": "conferir",
                    "explica": "请在这儿写您的名字 — “escreva o seu nome aqui”: a resposta é 名字. As alternativas impressas são do caderno padrão.",
                }
            ],
        },
        {
            "parte": "R1",
            "bloco": "R1",
            "itens": [
                {
                    "texto": T("每 个 星期六 ， 我 都 去 打 篮球 。", "Todo sábado eu vou jogar basquete."),
                    "figura": "exemploUsa",
                    "origem": "conferir",
                    "explica": "打篮球 = jogar basquete → a figura do rapaz arremessando a bola. A letra da figura vem dos dados; a frase é a do caderno padrão.",
                }
            ],
        },
        {"parte": "R2", "bloco": "R2", "itens": [{"grupo": True, "origem": "dado", "explica": "“O carneiro daqui é gostoso, mas também é muito ___”: o 但是 pede um contraste → 贵 (caro)."}]},
        {
            "parte": "R3",
            "bloco": "R3",
            "itens": [
                {
                    "texto": T("现在 是 11 点 30 分 ， 他们 已经 游 了 20 分钟 了 。", "Agora são 11h30, e eles já nadaram 20 minutos."),
                    "afirmacao": T("他们 11 点 10 分 开始 游泳 。", "Eles começaram a nadar às 11h10."),
                    "resposta": True,
                    "origem": "conferir",
                    "explica": "11h30 menos 20 minutos = 11h10 → √ (a frase é a do caderno padrão; a resposta sai da conta).",
                },
                {
                    "texto": T("我 会 跳舞 ， 但 跳 得 不 怎么样 。", "Eu sei dançar, mas não danço muito bem."),
                    "afirmacao": T("我 跳 得 非常 好 。", "Eu danço muito bem."),
                    "resposta": False,
                    "origem": "conferir",
                    "explica": "不怎么样 = “não grande coisa”, o contrário de 非常好 → × (a frase é a do caderno padrão).",
                },
            ],
        },
        {"parte": "R4", "bloco": "R4a", "itens": [{"grupo": True, "origem": "dado", "explica": "他在哪儿呢？你看见他了吗？ (“onde ele está? você o viu?”) → 他还在教室里学习 (“ele ainda está estudando na sala de aula”)."}]},
    ],
    3: [
        {
            "parte": "L1",
            "bloco": "L1a",
            "roteiro": 0,
            "itens": [{"falas": [0, 1], "figura": "exemploUsa", "origem": "dado", "explica": "喂，请问张经理在吗？ — uma ligação telefônica → a figura da moça ao telefone."}],
        },
        {
            "parte": "L2",
            "bloco": "L2",
            "roteiro": 1,
            "itens": [
                {"falas": [0, 1], "resposta": True, "origem": "deduzido", "explica": "为了让自己更健康 — ele se exercita “para ficar mais saudável” → √."},
                {"falas": [2, 3], "resposta": False, "origem": "deduzido", "explica": "我的手表不走了 — “o MEU relógio parou”: o relógio é dele → ×."},
            ],
        },
        {
            "parte": "L3",
            "bloco": "L3",
            "roteiro": 2,
            "itens": [
                {
                    "falas": [0, 1, 2],
                    "opcoes": {"A": T("开 门", "abrir a porta"), "B": T("拿 东西", "pegar as coisas"), "C": T("去 超市 买 东西", "ir ao supermercado fazer compras")},
                    "resposta": "A",
                    "origem": "conferir",
                    "explica": "帮我开一下门 — “abre a porta para mim?”: a resposta é 开门. As alternativas impressas são do caderno padrão.",
                }
            ],
        },
        {
            "parte": "L4",
            "bloco": "L4",
            "roteiro": 3,
            "itens": [
                {
                    "falas": [0, 1, 2, 3, 4],
                    "opcoes": {"A": T("洗澡", "tomando banho"), "B": T("吃饭", "comendo"), "C": T("看 电视", "vendo TV")},
                    "resposta": "C",
                    "origem": "conferir",
                    "explica": "比赛还有三分钟就结束了…我马上就看完了 — ele está vendo uma partida (na TV) → 看电视. As alternativas impressas são do caderno padrão.",
                }
            ],
        },
        {"parte": "R1", "bloco": "R1a", "itens": [{"grupo": True, "origem": "dado", "explica": "你知道怎么去那儿吗？ (“você sabe como chegar lá?”) → 当然。我们先坐公共汽车，然后换地铁。"}]},
        {"parte": "R2", "bloco": "R2a", "itens": [{"grupo": True, "origem": "dado", "explica": "说话的___多好听啊 — “como é bonita a ___ dela ao falar” → 声音 (voz)."}]},
        {"parte": "R2", "bloco": "R2b", "itens": [{"grupo": True, "origem": "dado", "explica": "A pergunta “qual é o seu ___?” tem como resposta “eu gosto de esporte” → 爱好 (hobby)."}]},
        {
            "parte": "R3",
            "bloco": "R3",
            "itens": [
                {
                    "texto": T("您 是 来 参加 今天 会议 的 吗 ？ 您 来 早 了 一点儿 ， 现在 才 八 点 半 。 您 先 进来 坐 吧 。", "O senhor veio para a reunião de hoje? Chegou um pouco cedo: agora são só oito e meia. Entre e sente-se."),
                    "pergunta": T("★ 会议 最 可能 几 点 开始 ？", "★ A que horas a reunião deve começar?"),
                    "opcoes": {"A": T("8 点", "8h"), "B": T("8 点 半", "8h30"), "C": T("9 点", "9h")},
                    "resposta": "C",
                    "origem": "conferir",
                    "explica": "São 8h30 e a pessoa “chegou um pouco cedo” → a reunião deve ser às 9h (texto e alternativas do caderno padrão).",
                }
            ],
        },
        {
            "parte": "W1",
            "bloco": "W1",
            "itens": [
                {
                    "pecas": [T("小船"), T("上"), T("一"), T("河"), T("条"), T("有")],
                    "frase": T("河 上 有 一 条 小船 。", "Há um barquinho no rio."),
                    "resposta": "河上有一条小船。",
                    "origem": "conferir",
                    "explica": "Lugar + 上 + 有 + número + classificador + coisa: 河上 + 有 + 一条 + 小船 (exemplo do caderno padrão).",
                }
            ],
        },
        {
            "parte": "W2",
            "bloco": "W2",
            "itens": [
                {
                    "frase": T("没有 关系 ， 别 难过 ， 高兴 点儿 。", "Não tem problema, não fique triste, alegre-se um pouco."),
                    "antes": "",
                    "depois": "有关系，别难过，高兴点儿。",
                    "pinyin": "méi",
                    "resposta": "没",
                    "origem": "conferir",
                    "explica": "méi + 有关系 → 没有关系 (“não tem problema”) (exemplo do caderno padrão).",
                }
            ],
        },
    ],
}

# ------------------------------------------------------------------ pinyin a partir do corpus


def frases_do_corpus(o, saida: list):
    if isinstance(o, dict):
        if isinstance(o.get("tk"), list) and isinstance(o.get("py"), list):
            saida.append(o)
        for v in o.values():
            frases_do_corpus(v, saida)
    elif isinstance(o, list):
        for v in o:
            frases_do_corpus(v, saida)


def leituras(provas: list[dict]) -> dict[str, str]:
    cont: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for p in provas:
        fs: list[dict] = []
        frases_do_corpus(p, fs)
        for f in fs:
            for w, py in zip(f["tk"], f["py"]):
                if py:
                    cont[w][py] += 1
    return {w: c.most_common(1)[0][0] for w, c in cont.items()}


def pinyin_de(w: str, lei: dict[str, str]) -> str:
    if all(c in PONT for c in w) or w.isdigit():
        return ""
    if w in lei:
        return lei[w]
    from pypinyin import Style, pinyin  # só se precisar

    return "".join(s[0] for s in pinyin(w, style=Style.TONE))


def tokeniza(t: dict, lei: dict[str, str]) -> dict:
    tk = t["zh"].split()
    f = {"zh": "".join(tk), "tk": tk, "py": [pinyin_de(w, lei) for w in tk]}
    if t.get("pt"):
        f["pt"] = t["pt"]
    return f


# ------------------------------------------------------------------ montagem


def le_provas() -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(PROVAS.glob("H*.json"))]


def checa(provas: list[dict]) -> list[str]:
    """Confere que o exemplo de cada parte é o mesmo em todas as provas do nível (texto e letra)."""
    avisos: list[str] = []
    por_nivel: dict[int, list[dict]] = collections.defaultdict(list)
    for p in provas:
        por_nivel[p.get("nivel", 3)].append(p)
    for nv, ps in sorted(por_nivel.items()):
        for ex in EXTRAS[nv]:
            k = ex.get("roteiro")
            if k is not None:
                textos = collections.Counter()
                for p in ps:
                    segs = [s for s in p.get("roteiro") or [] if s["tipo"] == "exemplo"]
                    if len(segs) <= k:
                        avisos.append(f"{p['id']}: sem o {k + 1}º exemplo no roteiro")
                        continue
                    seg = segs[k]
                    if seg.get("s") is None or seg.get("e") is None:
                        avisos.append(f"{p['id']} {ex['bloco']}: exemplo sem tempo no áudio")
                    textos[" | ".join(f["f"]["zh"] for f in seg["falas"])] += 1
                    usados = {i for it in ex["itens"] for i in it.get("falas", [])}
                    if usados and max(usados) >= len(seg["falas"]):
                        avisos.append(f"{p['id']} {ex['bloco']}: o exemplo tem só {len(seg['falas'])} falas")
                if len(textos) > 1:
                    avisos.append(f"HSK {nv} {ex['bloco']}: {len(textos)} variantes do texto do áudio {dict(textos)} (o app usa o da própria prova)")
            for it in ex["itens"]:
                if it.get("figura") == "exemploUsa":
                    letras = collections.Counter((p["grupos"].get(ex["bloco"]) or {}).get("exemploUsa") for p in ps)
                    if len(letras) != 1 or None in letras:
                        avisos.append(f"HSK {nv} {ex['bloco']}: letra da figura do exemplo varia {dict(letras)}")
                if it.get("grupo"):
                    # só texto e letra (a tradução muda um pouco de prova para prova)
                    ex_g = collections.Counter(
                        f"{e['texto']['zh']} → {e['resposta']}" if e else "—" for e in ((p["grupos"].get(ex["bloco"]) or {}).get("exemplo") for p in ps)
                    )
                    if len(ex_g) != 1:
                        avisos.append(f"HSK {nv} {ex['bloco']}: exemplo do grupo varia entre as provas")
    return avisos


def monta(provas: list[dict]) -> dict:
    lei = leituras(provas)
    modelo = {}
    for p in provas:
        modelo.setdefault(p.get("nivel", 3), p)
    saida: dict[str, list] = {}
    for nv, exs in sorted(EXTRAS.items()):
        p = modelo[nv]
        lista = []
        for ex in exs:
            itens = []
            for it in ex["itens"]:
                novo: dict = {}
                if it.get("falas"):
                    novo["falas"] = it["falas"]
                if it.get("figura") == "exemploUsa":
                    novo["figura"] = p["grupos"][ex["bloco"]]["exemploUsa"]
                    novo["resposta"] = novo["figura"]
                if it.get("grupo"):
                    g = p["grupos"][ex["bloco"]]
                    letra = g["exemplo"]["resposta"]
                    novo["texto"] = g["exemplo"]["texto"]
                    novo["opcoes"] = {letra: g["opcoes"][letra]}
                    novo["resposta"] = letra
                    if any(q.get("tipo") == "lacuna" and q.get("grupo") == ex["bloco"] for q in p["questoes"]):
                        novo["destaque"] = g["opcoes"][letra]["zh"]
                for campo in ("texto", "afirmacao", "pergunta", "frase"):
                    if isinstance(it.get(campo), dict):
                        novo[campo] = tokeniza(it[campo], lei)
                if it.get("opcoes"):
                    novo["opcoes"] = {l: tokeniza(t, lei) for l, t in it["opcoes"].items()}
                if it.get("pecas"):
                    novo["pecas"] = [tokeniza(t, lei) for t in it["pecas"]]
                for campo in ("antes", "depois", "pinyin", "resposta"):
                    if campo in it:
                        novo[campo] = it[campo]
                novo["explica"] = it["explica"]
                novo["origem"] = it["origem"]
                if it["origem"] == "conferir":
                    novo["conferir"] = True
                itens.append(novo)
            e = {"parte": ex["parte"], "bloco": ex["bloco"]}
            if ex.get("roteiro") is not None:
                e["roteiro"] = ex["roteiro"]
            e["itens"] = itens
            lista.append(e)
        saida[str(nv)] = lista
    return saida


def main():
    provas = le_provas()
    avisos = checa(provas)
    for a in avisos:
        print("aviso:", a)
    if "--checa" in sys.argv:
        return
    saida = monta(provas)
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(len(v) for v in saida.values())
    print(f"{SAIDA.relative_to(RAIZ)}: {n} exemplos ({', '.join(f'HSK {k}: {len(v)}' for k, v in saida.items())})")


if __name__ == "__main__":
    main()
