"""Segunda escuta independente com o ElevenLabs Scribe (speech-to-text na nuvem).

    python scripts/scribe.py <ID> [<ID> ...]

1. Envia public/audio/<ID>.mp3 ao Scribe (mandarim, tempo por caractere, separação de falantes)
   → cache em fontes/scribe/<ID>.json (chave ELEVENLABS_API_KEY no .env, não versionado).
2. Para cada questão 1–40, recorta o que o Scribe ouviu nas DUAS leituras (tempos de data/alinhamento/<ID>.json)
   e compara com a transcrição atual (data/transcricoes/<ID>.json).
3. Escreve data/trabalho/<ID>-scribe.md com as divergências, para o revisor decidir.
"""
from __future__ import annotations

import difflib
import json
import re
import sys
import urllib.request
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
HAN = re.compile(r"[㐀-鿿0-9]")


def chave() -> str:
    for ln in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if ln.startswith("ELEVENLABS_API_KEY="):
            return ln.split("=", 1)[1].strip()
    raise SystemExit("ELEVENLABS_API_KEY não encontrada no .env")


def transcreve(pid: str) -> dict:
    cache = RAIZ / "fontes" / "scribe" / f"{pid}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    audio = (RAIZ / "public" / "audio" / f"{pid}.mp3").read_bytes()
    fronteira = uuid.uuid4().hex
    partes = []
    for nome, valor in (("model_id", "scribe_v1"), ("language_code", "zho"), ("diarize", "true"), ("timestamps_granularity", "word")):
        partes.append(f'--{fronteira}\r\nContent-Disposition: form-data; name="{nome}"\r\n\r\n{valor}\r\n'.encode())
    partes.append(f'--{fronteira}\r\nContent-Disposition: form-data; name="file"; filename="{pid}.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode() + audio + b"\r\n")
    partes.append(f"--{fronteira}--\r\n".encode())
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/speech-to-text",
        data=b"".join(partes),
        headers={"xi-api-key": chave(), "Content-Type": f"multipart/form-data; boundary={fronteira}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=900) as r:
        dados = json.loads(r.read().decode("utf-8"))
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    return dados


def trecho(words: list[dict], s: float, e: float) -> list[dict]:
    return [w for w in words if w.get("type") == "word" and w["start"] >= s - 0.1 and w["end"] <= e + 0.3]


def so_han(t: str) -> str:
    return "".join(HAN.findall(t))


def compara(pid: str):
    d = transcreve(pid)
    words = d.get("words", [])
    al = json.loads((RAIZ / "data" / "alinhamento" / f"{pid}.json").read_text(encoding="utf-8"))
    tr = json.loads((RAIZ / "data" / "transcricoes" / f"{pid}.json").read_text(encoding="utf-8"))
    L = [f"# {pid} — segunda escuta (ElevenLabs Scribe) × transcrição atual\n",
         "Para cada questão: o texto atual e o que o Scribe ouviu em cada leitura (com o falante que ele separou).",
         "`≠` marca questões em que algum caractere difere. Cuidado: o Scribe às vezes escreve números em algarismos.\n"]
    difs = 0
    for n in range(1, 41):
        q = al["questoes"].get(str(n), {})
        atual = tr["questoes"].get(str(n), [])
        txt_atual = "".join(f["txt"] for f in atual)
        leituras = []
        for s, e in ((q.get("s"), q.get("e")), (q.get("s2"), q.get("e2"))):
            if s is None:
                leituras.append(None)
                continue
            ws = trecho(words, s, e)
            # agrupa por falante
            blocos, ult = [], None
            for w in ws:
                sp = w.get("speaker_id", "?")
                if sp != ult:
                    blocos.append([sp, ""])
                    ult = sp
                blocos[-1][1] += w["text"]
            leituras.append(blocos)
        a = so_han(txt_atual)
        diferente = False
        for blocos in leituras:
            if blocos is None:
                continue
            b = so_han("".join(t for _, t in blocos))
            if a != b:
                diferente = True
        difs += diferente
        L.append(f"\n## {n} {'≠' if diferente else '='}")
        L.append("atual:  " + " | ".join(f"{f.get('fal') or '-'}：{f['txt']}" for f in atual))
        for k, blocos in enumerate(leituras, 1):
            if blocos is None:
                L.append(f"scribe{k}: (sem tempos)")
                continue
            L.append(f"scribe{k}: " + " | ".join(f"{sp[-1] if sp else '?'}：{t}" for sp, t in blocos))
            b = so_han("".join(t for _, t in blocos))
            if a != b:
                ops = [f"{op} atual「{a[i1:i2]}」 scribe「{b[j1:j2]}」" for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if op != "equal"]
                L.append(f"   dif{k}: " + "; ".join(ops[:12]))
    (RAIZ / "data" / "trabalho" / f"{pid}-scribe.md").write_text("\n".join(L), encoding="utf-8")
    print(f"{pid}: {difs} questões com alguma diferença → data/trabalho/{pid}-scribe.md")


def rascunho(pid: str):
    """Para provas SEM 听力材料: rascunho do texto do áudio a partir do Scribe (turnos por falante/pausa)."""
    d = transcreve(pid)
    ws = [w for w in d.get("words", []) if w.get("type") == "word"]
    turnos = []
    for w in ws:
        t = turnos[-1] if turnos else None
        if t and w.get("speaker_id") == t["sp"] and w["start"] - t["e"] < 0.7:
            t["txt"] += w["text"]
            t["e"] = w["end"]
        else:
            turnos.append({"s": w["start"], "e": w["end"], "sp": w.get("speaker_id", "?"), "txt": w["text"]})
    prova = json.loads((RAIZ / "data" / "provas" / f"{pid}.json").read_text(encoding="utf-8"))
    q = {x["n"]: x for x in prova["questoes"]}
    L = [f"# {pid} — texto do áudio reconhecido pelo ElevenLabs Scribe (para montar a transcrição)\n",
         "Cada linha: [início–fim em s] [falante separado pelo Scribe: ids consistentes na prova toda] texto.",
         "O HSK lê cada questão DUAS VEZES; instruções e exemplos são os mesmos de todas as provas do nível.\n",
         "## Caderno (o que está impresso)\n"]
    for n in sorted(q):
        it = q[n]
        if it["secao"] != "L":
            continue
        extra = ""
        if it.get("opcoes"):
            extra = " | ".join(f"{k} {v}" for k, v in it["opcoes"].items())
        elif it.get("afirmacao"):
            extra = "★ " + it["afirmacao"]
        elif it["tipo"] in ("imagem-vf", "imagem-abc", "imagem"):
            extra = f"(figura(s): {it.get('imagem') or ', '.join((it.get('imagens') or {}).values()) or 'grupo ' + str(it.get('grupo'))})"
        resp = it.get("resposta")
        L.append(f"{n}. {extra}  (gabarito: {'√' if resp is True else '×' if resp is False else resp})")
    L.append("\n## Reconhecimento (Scribe), em ordem\n")
    for t in turnos:
        L.append(f"[{t['s']:7.2f}–{t['e']:7.2f}] [{t['sp'].replace('speaker_', 'voz ')}] {t['txt'].strip()}")
    (RAIZ / "data" / "trabalho" / f"{pid}-asr.md").write_text("\n".join(L), encoding="utf-8")
    print(f"{pid}: {len(turnos)} turnos → data/trabalho/{pid}-asr.md")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if sys.argv[1] == "--rascunho":
        for pid in sys.argv[2:]:
            try:
                rascunho(pid)
            except Exception as e:
                print(f"{pid}: ERRO {e}")
        sys.exit(0)
    for pid in sys.argv[1:]:
        try:
            compara(pid)
        except Exception as e:  # segue para a próxima prova
            print(f"{pid}: ERRO {e}")
