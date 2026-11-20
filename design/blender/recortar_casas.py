"""Recorta los cuadros de cada casa con el mismo marco (unión de los tres estados de puerta) para
que al encadenarlos en la web la casa no «salte». Uso:

  python -I design/blender/recortar_casas.py <carpeta_renders> <carpeta_salida>
"""
import os
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
sectors = sorted({f.split("-")[1] for f in os.listdir(src) if f.startswith("casa-") and f.endswith(".webp")})
for sector in sectors:
    files = sorted(f for f in os.listdir(src) if f.startswith(f"casa-{sector}-"))
    ims = [Image.open(os.path.join(src, f)).convert("RGBA") for f in files]
    boxes = [im.split()[3].getbbox() for im in ims]
    l = min(b[0] for b in boxes)
    t = min(b[1] for b in boxes)
    r = max(b[2] for b in boxes)
    btm = max(b[3] for b in boxes)
    pad = 8
    box = (max(0, l - pad), max(0, t - pad), min(ims[0].width, r + pad), min(ims[0].height, btm + pad))
    for f, im in zip(files, ims):
        im.crop(box).save(os.path.join(dst, f), "WEBP", quality=86, method=6)
    print(sector, box, len(files))
