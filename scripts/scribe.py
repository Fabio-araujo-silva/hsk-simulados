"""Transcreve o áudio original de cada prova com o ElevenLabs Scribe (uma passada por arquivo).

    python scripts/scribe.py <ID> [<ID> ...]      (sem IDs = todas as de fontes/audio/)

Saída: fontes/scribe/<ID>.json (tempo por palavra; cache — não chama a API de novo se já existe).
A chave ELEVENLABS_API_KEY fica no .env (não versionado) e nunca é impressa.
Os tempos são usados por scripts/tempos.py para achar onde começa/termina cada frase do 第一部分
e cada janela de resposta.
"""
from __future__ import annotations

import json
import sys
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def chave() -> str:
    for ln in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if ln.startswith("ELEVENLABS_API_KEY="):
            return ln.split("=", 1)[1].strip()
    raise SystemExit("ELEVENLABS_API_KEY não encontrada no .env")


def transcreve(pid: str) -> str:
    cache = RAIZ / "fontes" / "scribe" / f"{pid}.json"
    if cache.exists():
        return f"{pid}: já em cache"
    audio = (RAIZ / "fontes" / "audio" / f"{pid}.mp3").read_bytes()
    fronteira = uuid.uuid4().hex
    partes = []
    campos = (("model_id", "scribe_v1"), ("language_code", "zho"), ("tag_audio_events", "true"), ("timestamps_granularity", "word"))
    for nome, valor in campos:
        partes.append(f'--{fronteira}\r\nContent-Disposition: form-data; name="{nome}"\r\n\r\n{valor}\r\n'.encode())
    partes.append(
        f'--{fronteira}\r\nContent-Disposition: form-data; name="file"; filename="{pid}.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode()
        + audio
        + b"\r\n"
    )
    partes.append(f"--{fronteira}--\r\n".encode())
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/speech-to-text",
        data=b"".join(partes),
        headers={"xi-api-key": chave(), "Content-Type": f"multipart/form-data; boundary={fronteira}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=1200) as r:
        dados = json.loads(r.read().decode("utf-8"))
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    return f"{pid}: {len(dados.get('words', []))} palavras"


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ids = sys.argv[1:] or sorted(p.stem for p in (RAIZ / "fontes" / "audio").glob("*.mp3"))

    def roda(pid: str) -> str:
        try:
            return transcreve(pid)
        except Exception as e:  # segue para a próxima prova (sem vazar a chave: só o tipo/mensagem do erro)
            return f"{pid}: ERRO {type(e).__name__} {getattr(e, 'code', '')}"

    with ThreadPoolExecutor(3) as ex:
        for msg in ex.map(roda, ids):
            print(msg, flush=True)
