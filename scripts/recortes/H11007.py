"""Recorta à mão as figuras do H11007 (caderno vetorial; o extrator não acha todas)."""
import fitz, sys
from pathlib import Path
R = Path(__file__).resolve().parents[2]  # raiz do projeto
d = fitz.open(R / "fontes/raw/H11007/H11007.pdf")
dst = R / "public/img/H11007"
def merged(pg):
    return [fitz.Rect(i["bbox"]) for i in pg.get_image_info()]
def crop(pi, rect, name):
    pg = d[pi]
    r = fitz.Rect(rect) + (-2, -2, 2, 2)
    pg.get_pixmap(clip=r, dpi=200).save(dst / name)
# q9 (page 4)
p = d[3]; rs = sorted([r for r in merged(p) if r.y1 < 220], key=lambda r: r.x0)
for L, r in zip("ABC", rs): crop(3, r, f"q9-{L}.png")
for pi, g in ((4, "L3"), (7, "R2")):
    rs = merged(d[pi])
    rs = sorted(rs, key=lambda r: (round(r.y0 / 80), r.x0))
    rows = sorted(rs, key=lambda r: r.y0)
    rows = [sorted(rows[i:i+2], key=lambda r: r.x0) for i in range(0, 6, 2)]
    for L, r in zip("ABCDEF", [r for row in rows for r in row]):
        print(g, L, r); crop(pi, r, f"{g}-{L}.png")
