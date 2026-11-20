"""Le da volumen a las mallas de una plantilla de mockup hecha con build_from_photo.py.

La plantilla original pega cada pieza "plana": el cuerpo con una malla de 2×2
(un rectángulo) y las mangas con un cuadrilátero. Así el diseño se ve como un
papel pegado sobre la foto. Esto rehace las mallas con:

1. Envolvente cilíndrica: el torso y la manga son (más o menos) cilindros. La
   pieza entre costura y costura se reparte como un arco visto de frente: más
   ancho al medio, comprimido hacia los costados. Las líneas horizontales se
   curvan apenas (la cámara mira un poco desde arriba).
2. Pliegues: la luminancia de la foto (tex_0.png), filtrada para quedarse solo
   con las arrugas, corre los puntos de la malla, como el filtro Desplazar de
   Photoshop. Las rayas se tuercen donde la tela se arruga.

Uso:  python curvar_malla.py public/mockups/remera_duo/frente [más carpetas...]
Se puede correr de nuevo: guarda la malla plana original en "flat" y parte de ahí.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Ángulo del arco visible a cada lado del centro. El frente del molde es medio
# contorno del cuerpo: visto de frente, de costura a costura abarca casi 90° a
# cada lado. Con 80° el centro del pecho queda sin deformar (mismos px por mm
# a lo ancho que a lo alto: el escudo no se ve flaco) y los costados se
# comprimen como en una foto real.
BODY_DEG = 80
SLEEVE_DEG = 85
# Caída de las líneas horizontales en los costados (fracción del medio ancho).
BODY_SAG = 0.06
SLEEVE_SAG = 0.05
# Manga: cuánto se estira la malla más allá del puño (y el runtime, igual).
CUFF_OVERSCAN = 0.12
# Pliegues: cuánto se corre un punto (px) por unidad de luminancia filtrada.
FOLD_PX = 900.0
FOLD_MAX = 12.0  # tope (px) para que un pliegue fuerte no rompa la malla
FOLD_FINE = 14  # sigma del suavizado (px): por debajo, es textura de la tela
FOLD_BROAD = 45  # sigma del fondo que se resta: por encima, es luz general


def wrap(s, deg):
    """Arco → proyección. s en [-1, 1] es la posición sobre la tela entre costuras."""
    th = np.radians(deg)
    inside = np.abs(s) <= 1
    out = np.where(inside, np.sin(np.clip(s, -1, 1) * th) / np.sin(th), 0.0)
    # Fuera de las costuras (hombros y sisas del molde, más anchos que la
    # cintura): sigue a escala 1, como la malla plana, para cubrir toda la
    # máscara de la foto.
    out = np.where(inside, out, np.sign(s) * np.abs(s))
    return out


def sag(s, deg):
    th = np.radians(deg)
    return 1 - np.cos(np.clip(s, -1, 1) * th)


def fold_field(tex_path, mask):
    """Desplazamiento (dx, dy) por píxel a partir de las arrugas de la foto."""
    t = np.array(Image.open(tex_path).convert("RGBA")).astype(np.float32)
    lum = t[..., :3].mean(axis=2) / 255.0
    a = mask.astype(np.float32)
    # Promedios normalizados dentro de la prenda (el fondo no tira de los bordes).
    def blur(img, sig):
        num = cv2.GaussianBlur(img * a, (0, 0), sig)
        den = cv2.GaussianBlur(a, (0, 0), sig) + 1e-4
        return num / den
    fine = blur(lum, FOLD_FINE)
    broad = blur(lum, FOLD_BROAD)
    hp = (fine - broad) * a
    # Los pliegues desplazan a lo largo del gradiente de la luz (la tela "cae"
    # hacia la sombra), como Desplazar con el mapa de la propia foto.
    gx = cv2.Sobel(cv2.GaussianBlur(hp, (0, 0), 10), cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(cv2.GaussianBlur(hp, (0, 0), 10), cv2.CV_32F, 0, 1, ksize=3)
    # Cerca del borde (cuello, ruedo, sisas) la luz cambia por la costura, no
    # por un pliegue: ahí el desplazamiento se apaga de a poco.
    edge = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    damp = np.clip(edge / 40.0, 0, 1)
    dx, dy = gx * FOLD_PX * damp, gy * FOLD_PX * damp
    mag = np.hypot(dx, dy) + 1e-6
    k = FOLD_MAX * np.tanh(mag / FOLD_MAX) / mag
    return dx * k, dy * k


def sample(field, x, y):
    h, w = field.shape
    xi = np.clip(np.round(x).astype(int), 0, w - 1)
    yi = np.clip(np.round(y).astype(int), 0, h - 1)
    return field[yi, xi]


def grid_corners(s):
    cols, rows = s["cols"], s["rows"]
    d = np.array(s["dst"], float).reshape(rows + 1, cols + 1, 2)
    return d[0, 0], d[0, -1], d[-1, 0], d[-1, -1]


def body_mesh(s, fx, fy):
    flat = s.get("flat") or {}
    if not flat:
        p00, p10, p01, _ = grid_corners(s)
        flat = {"x0": float(p00[0]), "y0": float(p00[1]), "w": float(p10[0] - p00[0]), "h": float(p01[1] - p00[1])}
        s["flat"] = flat
    cols, rows = 40, 60
    u = np.linspace(0, s["srcW"], cols + 1)
    v = np.linspace(0, s["srcH"], rows + 1)
    U, V = np.meshgrid(u, v)
    xl = flat["x0"] + U * flat["w"] / s["srcW"]
    yl = flat["y0"] + V * flat["h"] / s["srcH"]
    # Costuras del costado a la altura de la cintura = bordes del cilindro.
    wl, wr = s["anchors"]["waistU"]
    sx = flat["w"] / s["srcW"]
    cx = flat["x0"] + (wl + wr) / 2 * sx
    hw = (wr - wl) / 2 * sx
    S = (xl - cx) / hw
    X = cx + hw * wrap(S, BODY_DEG)
    Y = yl - hw * BODY_SAG * sag(S, BODY_DEG)
    X = X + sample(fx, X, Y)
    Y = Y + sample(fy, X, Y)
    s.update({"cols": cols, "rows": rows, "dst": [round(float(c), 2) for c in np.stack([X, Y], -1).ravel()]})


def sleeve_mesh(s, fx, fy):
    flat = s.get("flat")
    if not flat:
        p00, p10, p01, p11 = grid_corners(s)
        flat = {"q": [p00.tolist(), p10.tolist(), p01.tolist(), p11.tolist()]}
        s["flat"] = flat
    P00, P10, P01, P11 = (np.array(q) for q in flat["q"])
    # La malla sigue un poco más allá del puño: el arte (con su sangrado) llega
    # hasta el borde de la foto sin "dientes" de relleno.
    P01 = P00 + (P01 - P00) * (1 + CUFF_OVERSCAN)
    P11 = P10 + (P11 - P10) * (1 + CUFF_OVERSCAN)
    s["cuffOverscan"] = CUFF_OVERSCAN
    cols, rows = 24, 24
    a = np.linspace(0, 1, cols + 1)
    b = np.linspace(0, 1, rows + 1)
    A, B = np.meshgrid(a, b)
    # La tela de la manga va del pliegue de arriba (copa) al de abajo: es la
    # mitad del tubo. El arco se centra en la mitad del ancho.
    S = 2 * A - 1
    Aw = (wrap(S, SLEEVE_DEG) + 1) / 2
    P = lambda aa, bb: ((1 - aa) * (1 - bb))[..., None] * P00 + (aa * (1 - bb))[..., None] * P10 + ((1 - aa) * bb)[..., None] * P01 + (aa * bb)[..., None] * P11
    pts = P(Aw, B)
    # Caída hacia el puño en los bordes del tubo (perpendicular al eje).
    axis = (P01 + P11) / 2 - (P00 + P10) / 2
    axis = axis / (np.linalg.norm(axis) + 1e-9)
    width = np.linalg.norm(P10 - P00)
    pts = pts - axis * (width / 2 * SLEEVE_SAG * sag(S, SLEEVE_DEG))[..., None]
    X, Y = pts[..., 0], pts[..., 1]
    X2 = X + 0.6 * sample(fx, X, Y)
    Y2 = Y + 0.6 * sample(fy, X, Y)
    s.update({"cols": cols, "rows": rows, "dst": [round(float(c), 2) for c in np.stack([X2, Y2], -1).ravel()]})


def main(dirs):
    for d in map(Path, dirs):
        t = json.loads((d / "template.json").read_text())
        garment = np.array(Image.open(d / t["garment"]["file"]).convert("RGBA"))[..., 3] > 127
        fx, fy = fold_field(d / t["textures"][0]["file"], garment)
        for s in t["smart"]:
            if s["fit"] == "body":
                body_mesh(s, fx, fy)
            else:
                sleeve_mesh(s, fx, fy)
        (d / "template.json").write_text(json.dumps(t))
        print(d, "listo:", [(s["kind"], s["cols"], s["rows"]) for s in t["smart"]])


if __name__ == "__main__":
    main(sys.argv[1:])
