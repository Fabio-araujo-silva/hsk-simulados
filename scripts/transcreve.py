"""Rascunho de transcrição do áudio para provas SEM 听力材料 oficial.

    python scripts/transcreve.py <ID> [--modelo medium]

1. faster-whisper (modelo maior, timestamps por palavra) → fontes/whisper/<ID>-<modelo>.json
2. Estima a voz de cada palavra pelo tom (F0 mediana; HSK usa um locutor e uma locutora): 男 / 女
3. Gera data/trabalho/<ID>-asr.md para o agente revisor montar data/transcricoes/<ID>.json,
   usando as duas leituras de cada questão (o HSK lê tudo duas vezes) e o caderno (★, opções)
   para corrigir erros do reconhecimento.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import textos  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SR = 16000


def carrega_pcm(arq: Path) -> np.ndarray:
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(arq), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(out.stdout, dtype=np.float32)


def f0_mediana(x: np.ndarray) -> float | None:
    """F0 mediana por autocorrelação (quadros de 40 ms, passo 10 ms, 70–400 Hz)."""
    n, h = int(0.04 * SR), int(0.015 * SR)
    lmin, lmax = int(SR / 400), int(SR / 70)
    f0s = []
    for i in range(0, len(x) - n, h):
        q = x[i : i + n]
        q = q - q.mean()
        energia = float(np.dot(q, q))
        if energia < 1e-4:
            continue
        espectro = np.fft.rfft(q, 2 * n)
        ac = np.fft.irfft(espectro * np.conj(espectro))[:n]
        ac = ac / (ac[0] + 1e-9)
        seg = ac[lmin:lmax]
        k = int(np.argmax(seg))
        if seg[k] > 0.45:
            f0s.append(SR / (lmin + k))
    return float(np.median(f0s)) if len(f0s) >= 3 else None


def reconhece(pid: str, audio: Path, modelo: str) -> list[dict]:
    cache = RAIZ / "fontes" / "whisper" / f"{pid}-{modelo}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel

    m = WhisperModel(modelo, device="cpu", compute_type="int8", cpu_threads=4)
    segs, _ = m.transcribe(
        str(audio),
        language="zh",
        word_timestamps=True,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350},
        initial_prompt="以下是普通话的句子，使用简体中文。",
        beam_size=5,
    )
    out = []
    for s in segs:
        out.append({"s": round(s.start, 2), "e": round(s.end, 2), "txt": s.text, "words": [{"w": w.word, "s": round(w.start, 3), "e": round(w.end, 3)} for w in (s.words or [])]})
        print(f"  {s.end:7.1f}s {s.text[:50]}", flush=True)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def simplifica(t: str) -> str:
    m = textos.trad_para_simp()
    return "".join(m.get(c, c) for c in t)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    pid = args[0]
    modelo = args[args.index("--modelo") + 1] if "--modelo" in args else "medium"
    sys.path.insert(0, str(Path(__file__).parent))
    from alinha import prepara_audio

    audio = prepara_audio(pid)
    print(f"{pid}: reconhecendo com whisper-{modelo}…", flush=True)
    segs = reconhece(pid, audio, modelo)
    pcm = carrega_pcm(audio)

    # turnos = trechos separados por pausa (≥ 0,3 s); voz pela F0 mediana do turno inteiro
    turnos = []
    for s in segs:
        for w in s["words"]:
            t = turnos[-1] if turnos else None
            if t and w["s"] - t["e"] < 0.3:
                t["txt"] += w["w"]
                t["e"] = w["e"]
            else:
                turnos.append({"s": w["s"], "e": w["e"], "txt": w["w"]})
    for t in turnos:
        a, b = int(t["s"] * SR), int(t["e"] * SR)
        t["f0"] = f0_mediana(pcm[a:b]) if b - a > int(0.15 * SR) else None
    # duas vozes: separa por k-means 1D em log(F0)
    vals = np.log([t["f0"] for t in turnos if t["f0"]])
    c1, c2 = np.percentile(vals, 25), np.percentile(vals, 75)
    for _ in range(20):
        m = np.abs(vals - c1) < np.abs(vals - c2)
        c1, c2 = vals[m].mean(), vals[~m].mean()
    corte = float(np.exp((c1 + c2) / 2))
    print(f"  vozes: ~{np.exp(c1):.0f} Hz e ~{np.exp(c2):.0f} Hz (corte {corte:.0f} Hz)")
    for t in turnos:
        t["voz"] = None if not t["f0"] else ("女" if t["f0"] >= corte else "男")

    prova = json.loads((RAIZ / "data" / "provas" / f"{pid}.json").read_text(encoding="utf-8"))
    q = {x["n"]: x for x in prova["questoes"]}
    L = [f"# {pid} — reconhecimento de fala (whisper-{modelo}) para montar a transcrição\n"]
    L.append("Cada linha: [início–fim em s] [voz estimada pelo tom: 男 masculina / 女 feminina / ? incerta] texto reconhecido.")
    L.append("O HSK lê cada questão DUAS VEZES; as instruções e os exemplos são sempre os mesmos das outras provas.\n")
    L.append("## Caderno (o que está impresso — use para corrigir o reconhecimento)\n")
    for n in range(11, 21):
        L.append(f"{n}. ★ {q[n].get('afirmacao')}  (gabarito: {'√' if q[n].get('resposta') else '×'})")
    for n in range(21, 41):
        ops = " | ".join(f"{k} {v}" for k, v in (q[n].get("opcoes") or {}).items())
        L.append(f"{n}. {ops}  (gabarito: {q[n].get('resposta')})")
    L.append("\n## Reconhecimento, em ordem\n")
    for t in turnos:
        hz = f" {t['f0']:.0f}Hz" if t["f0"] else ""
        L.append(f"[{t['s']:7.2f}–{t['e']:7.2f}] [{t['voz'] or '?'}{hz}] {simplifica(t['txt']).strip()}")
    saida = RAIZ / "data" / "trabalho" / f"{pid}-asr.md"
    saida.write_text("\n".join(L), encoding="utf-8")
    print(f"{pid}: {len(turnos)} turnos → {saida.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
