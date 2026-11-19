"""Plantilla de mockup a partir de una FOTO plana de remera (sin PSD).

Uso: python build_from_photo.py <foto.png> <carpeta_salida>

La foto tiene frente (mitad izquierda) y espalda (mitad derecha), remera blanca
sobre fondo gris. Las costuras, puños y cuello están marcados a mano abajo
(coordenadas en la foto agrandada x2). Genera, para cada vista, lo mismo que
build_template.py: template.json, garment.png, smart_N.png, tex_0.png y trims.

Como la foto es plana, cada pieza se "pega" sin deformación (el cuerpo) o en
un cuadrilátero (las mangas); el volumen lo dan las sombras de la foto.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

SCALE = 2

VIEWS = {
    "frente": {
        "crop": (0, 0, 683, 767),
        # Logo de la marca impreso en la foto: se borra (el arte va encima).
        "erase": [(300, 190, 460, 310)],
        "body": {"top": 58, "hem": 1472, "x0": 200, "x1": 1140, "waist_x": (305, 1032)},
        "sleeves": [
            # izquierda de la foto
            {"kind": "manga_der", "side": "cap_to_max", "shoulder": (215, 215), "outer": (68, 650), "inner": (300, 705),
             "seam": [(215, 215), (255, 260), (285, 330), (300, 430), (308, 560)], "poly_side": 0},
            # derecha de la foto
            {"kind": "manga_izq", "side": "min_to_cap", "shoulder": (1130, 205), "outer": (1290, 645), "inner": (1040, 700),
             "seam": [(1130, 205), (1095, 280), (1070, 380), (1045, 480), (1035, 560)], "poly_side": 1},
        ],
        "neck_inner": [(515, 50), (515, 65), (530, 120), (580, 170), (665, 190), (750, 170), (800, 120), (815, 58), (815, 50)],
        "neck_outer": [(480, 50), (485, 62), (500, 130), (560, 195), (665, 220), (770, 195), (830, 130), (842, 58), (842, 50)],
    },
    "espalda": {
        "crop": (683, 0, 1365, 767),
        "erase": [],
        "body": {"top": 55, "hem": 1475, "x0": 200, "x1": 1160, "waist_x": (335, 1022)},
        "sleeves": [
            {"kind": "manga_izq", "side": "cap_to_max", "shoulder": (240, 215), "outer": (78, 635), "inner": (310, 690),
             "seam": [(240, 215), (255, 300), (270, 420), (290, 560), (305, 650)], "poly_side": 0},
            {"kind": "manga_der", "side": "min_to_cap", "shoulder": (1135, 215), "outer": (1300, 640), "inner": (1050, 690),
             "seam": [(1135, 215), (1120, 330), (1100, 450), (1075, 530), (1055, 640)], "poly_side": 1},
        ],
        "neck_inner": None,
        "neck_outer": [(490, 50), (490, 62), (560, 95), (670, 104), (780, 95), (855, 62), (855, 50)],
    },
}


def poly_mask(size, pts):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.array(m) > 0


def save_mask(path, m):
    a = np.zeros(m.shape + (4,), np.uint8)
    a[..., :3] = 255
    a[..., 3] = (m * 255).astype(np.uint8) if m.dtype != np.uint8 else m
    Image.fromarray(a, "RGBA").save(path, optimize=True)


def main(src, out):
    im = Image.open(src).convert("RGB")
    for view, cfg in VIEWS.items():
        d = Path(out) / view
        d.mkdir(parents=True, exist_ok=True)
        c = im.crop(cfg["crop"])
        c = c.resize((c.width * SCALE, c.height * SCALE), Image.LANCZOS)
        rgb = np.array(c)
        W, H = c.size
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

        # Prenda: GrabCut con lo seguro de cada lado (tela muy clara / fondo
        # gris) y el resto por decidir; las sombras de la tela confunden un
        # umbral simple.
        gc = np.full(gray.shape, cv2.GC_PR_BGD, np.uint8)
        gc[gray > 190] = cv2.GC_PR_FGD
        gc[cv2.erode((gray > 225).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0] = cv2.GC_FGD
        gc[gray < 150] = cv2.GC_BGD
        gc[:6, :] = cv2.GC_BGD
        gc[-6:, :] = cv2.GC_BGD
        gc[:, :6] = cv2.GC_BGD
        gc[:, -6:] = cv2.GC_BGD
        bgm, fgm = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), gc, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
        g = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8)
        g = cv2.morphologyEx(g, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        n, lab, stats, _ = cv2.connectedComponentsWithStats(g)
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        g = (lab == big).astype(np.uint8)
        ff = g.copy()
        cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 1)
        g = g | (1 - ff)
        # El lado derecho de la foto está en sombra y GrabCut lo muerde: la
        # remera es simétrica, así que la mitad derecha es el espejo de la
        # izquierda.
        b_ = cfg["body"]
        cx = (b_["waist_x"][0] + b_["waist_x"][1]) // 2
        w = min(cx, W - cx)
        g[:, cx:cx + w] = g[:, cx - w:cx][:, ::-1]
        g[:, cx + w:] = 0
        garment = g > 0

        # Borrar el logo impreso.
        for (x0, y0, x1, y1) in cfg["erase"]:
            box = np.zeros_like(gray, np.uint8)
            box[y0:y1, x0:x1] = 1
            dark = ((gray < 200) & (box > 0)).astype(np.uint8)
            dark = cv2.dilate(dark, np.ones((7, 7), np.uint8))
            rgb = cv2.inpaint(rgb, dark, 9, cv2.INPAINT_TELEA)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

        # Mangas: del lado de afuera de la costura de la sisa, hasta el puño.
        smart = []
        sleeve_masks = []
        for s in cfg["sleeves"]:
            yb = max(s["inner"][1], s["outer"][1]) + 12
            seam = s["seam"]
            last = seam[-1]
            edge = 0 if s["poly_side"] == 0 else W
            pts = [(edge, 0), (seam[0][0], 0)] + seam + [(last[0] + (4 if s["poly_side"] == 0 else -4), yb), (edge, yb)]
            m = poly_mask((W, H), pts) & garment
            sleeve_masks.append(m)
            # Cuadrilátero de la manga: v=0 en la costura (pasa por el hombro,
            # paralela al puño), v=1 en el puño; u según el lado del molde.
            sh = np.array(s["shoulder"], float)
            o = np.array(s["outer"], float)
            i = np.array(s["inner"], float)
            x = sh + (i - o)
            if s["side"] == "min_to_cap":
                P00, P10, P01, P11 = x, sh, i, o
            else:
                P00, P10, P01, P11 = sh, x, o, i
            cols = rows = 8
            dst = []
            for j in range(rows + 1):
                for k in range(cols + 1):
                    a, b = k / cols, j / rows
                    p = (1 - a) * (1 - b) * P00 + a * (1 - b) * P10 + (1 - a) * b * P01 + a * b * P11
                    dst += [round(float(p[0]), 2), round(float(p[1]), 2)]
            smart.append({"kind": s["kind"], "fit": "sleeve", "side": s["side"], "srcW": 300.0, "srcH": 300.0, "scale": 1.0,
                          "cols": cols, "rows": rows, "dst": dst, "mask": {"file": f"smart_{len(smart) + 1}.png", "offset": [0, 0]}})

        # Cuerpo: la prenda menos mangas y el interior del cuello.
        body = garment.copy()
        for m in sleeve_masks:
            body &= ~m
        if cfg["neck_inner"]:
            body &= ~poly_mask((W, H), cfg["neck_inner"])
        b = cfg["body"]
        bw, bh = b["x1"] - b["x0"], b["hem"] - b["top"] + 20
        y0 = b["top"] - 10
        waist_at = 0.6
        body_smart = {
            "kind": view, "fit": "body", "srcW": float(bw), "srcH": float(bh), "scale": 1.0, "cols": 2, "rows": 2,
            "dst": [v for j in range(3) for k in range(3) for v in (b["x0"] + bw * k / 2, y0 + bh * j / 2)],
            "mask": {"file": "smart_0.png", "offset": [0, 0]},
            "anchors": {"waistU": [b["waist_x"][0] - b["x0"], b["waist_x"][1] - b["x0"]], "waistAt": waist_at,
                        "topV": float(b["top"] - y0), "hemV": float(b["hem"] - y0)},
        }

        # Cuello y puños (para pintarlos de otro color).
        neck = poly_mask((W, H), cfg["neck_outer"]) & garment
        if cfg["neck_inner"]:
            neck &= ~poly_mask((W, H), cfg["neck_inner"])
        cuffs = np.zeros_like(garment)
        for s in cfg["sleeves"]:
            o = np.array(s["outer"], float)
            i = np.array(s["inner"], float)
            up = np.array([0.0, -26.0])
            cuffs |= poly_mask((W, H), [tuple(o + up * 0.15), tuple(i + up * 0.15), tuple(i + up), tuple(o + up)]) | poly_mask(
                (W, H), [tuple(o + np.array([-8, 14])), tuple(i + np.array([8, 14])), tuple(i), tuple(o)])
        cuffs &= garment

        # Sombras: luminancia de la foto normalizada al blanco de la tela.
        # Donde el espejo cae sobre fondo gris, se completa con la tela vecina.
        bgish = (garment & (gray < 168)).astype(np.uint8)
        bgish[:, :cx] = 0
        if bgish.any():
            gray = cv2.inpaint(gray, cv2.dilate(bgish, np.ones((5, 5), np.uint8)), 7, cv2.INPAINT_TELEA)
        ref = np.percentile(gray[garment], 97)
        shade = np.clip(gray.astype(float) / ref, 0, 1)
        tex = np.zeros((H, W, 4), np.uint8)
        tex[..., :3] = (shade[..., None] * 255).astype(np.uint8)
        tex[..., 3] = (garment * 255).astype(np.uint8)

        save_mask(d / "garment.png", garment)
        save_mask(d / "smart_0.png", body)
        for n_, m in enumerate(sleeve_masks):
            save_mask(d / f"smart_{n_ + 1}.png", m)
        save_mask(d / "trim_cuello.png", neck)
        save_mask(d / "trim_punos.png", cuffs)
        Image.fromarray(tex, "RGBA").save(d / "tex_0.png", optimize=True)
        tpl = {
            "size": [W, H],
            "credit": "Mockup: foto de Duo Indumentaria",
            "garment": {"file": "garment.png", "offset": [0, 0]},
            "smart": [body_smart] + smart,
            "trims": {"cuello": {"file": "trim_cuello.png", "offset": [0, 0]}, "punos": {"file": "trim_punos.png", "offset": [0, 0]}},
            "textures": [{"file": "tex_0.png", "offset": [0, 0], "mode": "multiply", "opacity": 1.0}],
        }
        (d / "template.json").write_text(json.dumps(tpl))
        print(view, W, H, "prenda", int(garment.sum()), "cuerpo", int(body.sum()), "mangas", [int(m.sum()) for m in sleeve_masks])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
