"""
Convierte un mockup PSD (con objetos inteligentes deformados) en una
plantilla para el mockup fotográfico del módulo de Producción.

Uso:
  python3 build_template.py <archivo.psd> <carpeta_salida> <spec.json>

spec.json dice qué objeto inteligente recibe qué pieza, qué capas son
máscaras de zonas (cuello, puños) y qué capas son texturas (sombras/brillos):
  {
    "garment": "Color Base",
    "smart": [{"layer": "Smart - Front + Back", "kind": "frente", "fit": "body", "scale": 0.5},
              {"layer": "Smart - R Arm", "kind": "manga_izq", "fit": "sleeve", "side": "min_to_cap"}],
    "trims": {"cuello": ["Color Neck", "Color Back"], "punos": ["Color Left Handcuff", "Color Right Handcuff"]},
    "textures": [["Render 2", "multiply"], ["Render 1", "hard-light"], ["light3", "overlay"]]
  }

Salida: template.json + PNGs recortados (máscaras como alfa, texturas RGBA).
La deformación de Photoshop (quilt/envelope warp + perspectiva) se evalúa acá
y se guarda como una malla de puntos fuente→documento; el navegador solo
dibuja triángulos.
"""
import json, os, sys
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from warp import find, smart_info, warp_points, homography, applyH


def mask_alpha(layer, size):
    m = layer.mask
    full = Image.new("L", size, 0)
    full.paste(m.topil(), (m.bbox[0], m.bbox[1]))
    return full


def save_crop_alpha(img_l, path):
    """Máscara (L) → PNG blanco con alfa, recortado a su contenido."""
    a = np.asarray(img_l)
    ys, xs = np.where(a > 0)
    if not len(xs):
        return None
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = a[y0:y1, x0:x1]
    Image.fromarray(rgba).save(path, optimize=True)
    return [int(x0), int(y0)]


def main(psd_path, out_dir, spec_path):
    spec = json.load(open(spec_path))
    os.makedirs(out_dir, exist_ok=True)
    psd = PSDImage.open(psd_path)
    size = psd.size
    out = {"size": list(size), "credit": spec.get("credit", ""), "smart": [], "trims": {}, "textures": []}

    g = find(psd, spec["garment"])
    off = save_crop_alpha(mask_alpha(g, size), os.path.join(out_dir, "garment.png"))
    out["garment"] = {"file": "garment.png", "offset": off}

    for i, s in enumerate(spec["smart"]):
        l = find(psd, s["layer"])
        info = smart_info(l)
        W, H = info["W"], info["H"]
        hx = np.array(info["mesh"][0]) if info["mesh"] else np.array([0, W])
        vy = np.array(info["mesh"][1]) if info["mesh"] else np.array([0, H])
        a, b, c, e = hx.min(), vy.min(), hx.max(), vy.max()
        Hm = homography([(a, b), (c, b), (c, e), (a, e)], [tuple(p) for p in info["na"]])
        fwd = lambda u, v: applyH(Hm, warp_points(info, u, v))
        cols, rows = s.get("mesh", [48, 72] if s["fit"] == "body" else [20, 24])
        us = np.linspace(0, W, cols + 1)
        vs = np.linspace(0, H, rows + 1)
        uu, vv = np.meshgrid(us, vs)
        D = fwd(np.clip(uu.ravel(), 0.001, W - 0.001), np.clip(vv.ravel(), 0.001, H - 0.001))
        mk = mask_alpha(l, size)
        moff = save_crop_alpha(mk, os.path.join(out_dir, f"smart_{i}.png"))
        entry = {
            "kind": s["kind"],
            "fit": s["fit"],
            "side": s.get("side"),
            "srcW": W,
            "srcH": H,
            "scale": s.get("scale", 1),
            "cols": cols,
            "rows": rows,
            # puntos del documento para cada vértice de la grilla (fila por fila)
            "dst": np.round(D, 2).ravel().tolist(),
            "mask": {"file": f"smart_{i}.png", "offset": moff},
        }
        if s["fit"] == "body":
            # Qué parte de la plantilla queda dentro de la máscara: costados a
            # la altura de la cintura, hombro arriba y ruedo abajo.
            su = np.linspace(0, W - 1, 200)
            sv = np.linspace(0, H - 1, 300)
            U, V = np.meshgrid(su, sv)
            P = fwd(U.ravel(), V.ravel())
            ma = np.asarray(mk)
            xi = np.clip(P[:, 0].round().astype(int), 0, size[0] - 1)
            yi = np.clip(P[:, 1].round().astype(int), 0, size[1] - 1)
            inside = (ma[yi, xi] > 128).reshape(V.shape)
            rw = int(0.6 * (len(sv) - 1))
            colsin = np.where(inside[rw])[0]
            rows_in = np.where(inside.any(1))[0]
            mid = len(su) // 2
            rows_c = np.where(inside[:, mid])[0]
            entry["anchors"] = {
                "waistU": [float(su[colsin.min()]), float(su[colsin.max()])],
                "waistAt": 0.6,
                "topV": float(sv[rows_in.min()]),
                "hemV": float(sv[rows_c.max()]),
            }
        out["smart"].append(entry)

    for zone, names in spec.get("trims", {}).items():
        acc = np.zeros((size[1], size[0]), np.uint8)
        for n in names:
            z = find(psd, n)
            if z is not None and z.mask is not None:
                acc = np.maximum(acc, np.asarray(mask_alpha(z, size)))
        off = save_crop_alpha(Image.fromarray(acc), os.path.join(out_dir, f"trim_{zone}.png"))
        if off:
            out["trims"][zone] = {"file": f"trim_{zone}.png", "offset": off}

    for j, (name, mode) in enumerate(spec.get("textures", [])):
        t = find(psd, name)
        if t is None or not t.visible:
            continue
        im = t.topil().convert("RGBA")
        f = f"tex_{j}.png"
        im.save(os.path.join(out_dir, f), optimize=True)
        out["textures"].append({"file": f, "offset": [t.bbox[0], t.bbox[1]], "mode": mode, "opacity": round(t.opacity / 255, 3)})

    json.dump(out, open(os.path.join(out_dir, "template.json"), "w"))
    print("ok", out_dir, len(out["smart"]), "objetos,", len(out["textures"]), "texturas")


if __name__ == "__main__":
    main(*sys.argv[1:4])
