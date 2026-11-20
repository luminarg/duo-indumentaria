"""Cuello de la plantilla Duo: máscaras suaves que siguen la costura de la foto.

build_from_photo.py arma el cuello con polígonos marcados a mano (pocos
puntos): el borde queda en escalones y no llega a la costura del ribete, así
que el diseño del cuerpo se asoma por debajo del cuello pintado. Acá:

- Frente: el ribete es la banda entre dos elipses (la abertura y la costura),
  ajustadas a puntos marcados sobre la foto.
- Espalda: el ribete es lo que queda por encima de la curva de la costura.
- El cuerpo (smart_0) pasa a ser prenda − mangas − abertura del cuello.
- Todas las máscaras se suavizan un poco en el borde (antialias).

Uso:  python ajustar_cuello.py public/mockups/remera_duo
"""

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Puntos en px de la plantilla (1366 × 1534), marcados sobre la foto.
FRENTE_COSTURA = [(467, 106), (485, 150), (545, 199), (665, 223), (785, 199), (850, 150), (872, 106)]
FRENTE_ABERTURA = [(517, 67), (535, 120), (580, 172), (665, 189), (750, 172), (800, 120), (815, 67)]
ESPALDA_COSTURA = [(487, 75), (560, 89), (680, 95), (800, 89), (872, 75)]


def alpha(path):
    return np.array(Image.open(path).convert("RGBA"))[..., 3] > 127


def save_mask(path, m):
    a = np.zeros(m.shape + (4,), np.uint8)
    a[..., :3] = 255
    soft = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8)
    a[..., 3] = np.clip(soft * 255, 0, 255).astype(np.uint8)
    Image.fromarray(a, "RGBA").save(path, optimize=True)


def ellipse_mask(shape, pts):
    e = cv2.fitEllipse(np.float32(pts))
    m = np.zeros(shape, np.uint8)
    # A 4× para que el borde sea parejo.
    (cx, cy), (w, h), ang = e
    cv2.ellipse(m, ((cx, cy), (w, h), ang), 1, -1, lineType=cv2.LINE_AA)
    return m > 0


def main(base):
    base = Path(base)
    # Frente
    d = base / "frente"
    garment = alpha(d / "garment.png")
    sleeves = alpha(d / "smart_1.png") | alpha(d / "smart_2.png")
    shape = garment.shape
    seam = ellipse_mask(shape, FRENTE_COSTURA)
    opening = ellipse_mask(shape, FRENTE_ABERTURA)
    trim = seam & ~opening & garment & ~sleeves
    body = garment & ~sleeves & ~opening
    save_mask(d / "trim_cuello.png", trim)
    save_mask(d / "smart_0.png", body)
    for f in ["garment.png", "smart_1.png", "smart_2.png", "trim_punos.png"]:
        save_mask(d / f, alpha(d / f))
    print("frente: cuello", int(trim.sum()), "cuerpo", int(body.sum()))

    # Espalda
    d = base / "espalda"
    garment = alpha(d / "garment.png")
    sleeves = alpha(d / "smart_1.png") | alpha(d / "smart_2.png")
    xs, ys = zip(*ESPALDA_COSTURA)
    coef = np.polyfit(xs, ys, 2)
    yy, xx = np.mgrid[0 : garment.shape[0], 0 : garment.shape[1]]
    above = (yy < np.polyval(coef, xx)) & (xx >= min(xs) - 40) & (xx <= max(xs) + 40)
    trim = above & garment & ~sleeves
    body = garment & ~sleeves  # en la espalda no hay abertura a la vista
    save_mask(d / "trim_cuello.png", trim)
    save_mask(d / "smart_0.png", body)
    for f in ["garment.png", "smart_1.png", "smart_2.png", "trim_punos.png"]:
        save_mask(d / f, alpha(d / f))
    print("espalda: cuello", int(trim.sum()), "cuerpo", int(body.sum()))


if __name__ == "__main__":
    main(sys.argv[1])
