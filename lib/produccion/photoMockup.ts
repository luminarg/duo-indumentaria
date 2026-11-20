// Mockup fotográfico: el arte real de cada pieza se "pega" sobre una foto de
// remera (plantilla sacada de un PSD de mockup), deformado con la malla de
// Photoshop, y encima van las sombras y brillos de la tela. Corre en el
// navegador (canvas). Las plantillas las genera herramientas/mockups/.

import { bbox } from "./geometry";
import type { PieceKind, Poly } from "./types";

export type TemplateSmart = {
  kind: PieceKind;
  fit: "body" | "sleeve";
  side?: "min_to_cap" | "cap_to_max";
  srcW: number;
  srcH: number;
  scale: number;
  cols: number;
  rows: number;
  dst: number[];
  mask: { file: string; offset: [number, number] };
  anchors?: { waistU: [number, number]; waistAt: number; topV: number; hemV: number };
  /** Manga: fracción extra de largo de la malla más allá del puño del molde. */
  cuffOverscan?: number;
};
export type PhotoTemplate = {
  size: [number, number];
  credit: string;
  garment: { file: string; offset: [number, number] };
  smart: TemplateSmart[];
  trims: Record<string, { file: string; offset: [number, number] }>;
  textures: { file: string; offset: [number, number]; mode: GlobalCompositeOperation; opacity: number }[];
};

/** Una pieza ya dibujada (con su arte) y dónde está en esa imagen. */
export type PieceRaster = {
  kind: PieceKind;
  image: CanvasImageSource;
  /** Píxeles por mm de la imagen. */
  pxPerMm: number;
  /** mm de la pieza que caen en el píxel (0,0) de la imagen. */
  originMm: { x: number; y: number };
  outline: Poly;
  /** Punto más alto (copa de la manga / hombro). */
  top: { x: number; y: number };
  bgColor: string;
};

const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("No se pudo cargar " + url));
      im.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

export async function loadTemplate(base: string): Promise<{ t: PhotoTemplate; img: (f: string) => Promise<HTMLImageElement>; base: string }> {
  const res = await fetch(`${base}/template.json`);
  if (!res.ok) throw new Error("No se encontró la plantilla de mockup " + base);
  const t = (await res.json()) as PhotoTemplate;
  return { t, img: (f: string) => loadImage(`${base}/${f}`), base };
}

function spanAt(poly: Poly, y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

/**
 * Qué mm de la pieza van en cada píxel de la plantilla del objeto
 * inteligente: x_mm = ax·u + bx, y_mm = ay·v + by (u, v en px de la fuente).
 */
function fitPiece(s: TemplateSmart, p: PieceRaster) {
  const b = bbox(p.outline);
  if (s.fit === "body" && s.anchors) {
    const top = b.minY, hem = b.maxY;
    const yw = top + (hem - top) * s.anchors.waistAt;
    const [xl, xr] = spanAt(p.outline, yw) ?? [b.minX, b.maxX];
    const [ul, ur] = s.anchors.waistU;
    const ax = (xr - xl) / (ur - ul);
    const ay = (hem - top) / (s.anchors.hemV - s.anchors.topV);
    return { ax, bx: xl - ul * ax, ay, by: top - s.anchors.topV * ay };
  }
  // Manga: la mitad visible (del pliegue de arriba al costado), de la copa al
  // puño. Con "cuffOverscan" la malla sigue un poco más allá del puño (la foto
  // tiene el puño más largo que el molde) y ahí va el sangrado del arte.
  const ycap = b.minY;
  const [x0, x1] = s.side === "min_to_cap" ? [b.minX, p.top.x] : [p.top.x, b.maxX];
  const over = 1 + (s.cuffOverscan ?? 0);
  return { ax: (x1 - x0) / s.srcW, bx: x0, ay: ((b.maxY - ycap) * over) / s.srcH, by: ycap };
}

/** Dibuja la imagen `src` deformada por la malla en `ctx` (triángulo por triángulo). */
function drawMesh(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, s: TemplateSmart, out = 1) {
  const k = src.width / s.srcW;
  const cols = s.cols, rows = s.rows;
  const P = (i: number, j: number) => {
    const n = (j * (cols + 1) + i) * 2;
    return { x: s.dst[n] * out, y: s.dst[n + 1] * out };
  };
  const S = (i: number, j: number) => ({ x: (i / cols) * s.srcW * k, y: (j / rows) * s.srcH * k });
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    const s0 = S(...a), s1 = S(...b), s2 = S(...c);
    const d0 = P(...a), d1 = P(...b), d2 = P(...c);
    // Afín que lleva el triángulo de la fuente al del documento.
    const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
    if (Math.abs(den) < 1e-9) return;
    const m11 = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
    const m12 = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
    const m21 = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
    const m22 = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
    const dx = d0.x - m11 * s0.x - m12 * s0.y;
    const dy = d0.y - m21 * s0.x - m22 * s0.y;
    // Recorte del triángulo apenas agrandado (evita líneas finas entre triángulos).
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const grow = (p: { x: number; y: number }) => {
      const vx = p.x - cx, vy = p.y - cy, l = Math.hypot(vx, vy) || 1;
      return { x: p.x + (vx / l) * 1.6, y: p.y + (vy / l) * 1.6 };
    };
    const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m11, m21, m12, m22, dx, dy);
    // Solo la parte de la fuente que cubre el triángulo (mucho más rápido).
    const minX = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 2);
    const minY = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 2);
    const maxX = Math.min(src.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 2);
    const maxY = Math.min(src.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 2);
    if (maxX > minX && maxY > minY) ctx.drawImage(src, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      tri([i, j], [i + 1, j], [i + 1, j + 1]);
      tri([i, j], [i + 1, j + 1], [i, j + 1]);
    }
}

function growLayer(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, steps: number[]) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  for (const r of steps) for (const [dx, dy] of dirs) ctx.drawImage(layer, Math.round(dx * r), Math.round(dy * r));
  ctx.restore();
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite dibujar el mockup");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

/** Pinta `color` dentro de una máscara (PNG blanco con alfa) sobre `ctx`. */
async function fillMask(ctx: CanvasRenderingContext2D, img: HTMLImageElement, offset: [number, number], color: string, k = 1) {
  const { c, ctx: m } = canvasOf(img.width * k, img.height * k);
  m.drawImage(img, 0, 0, c.width, c.height);
  m.globalCompositeOperation = "source-in";
  m.fillStyle = color;
  m.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(c, offset[0] * k, offset[1] * k);
}

export type PhotoOptions = {
  trimColor?: string | null;
  backgroundColor?: string;
  cuffColor?: string | null;
  /**
   * Resolución de salida respecto de la plantilla. Por defecto, la que deja la
   * vista en unos 3000 px de alto: la foto se agranda (sus sombras son suaves),
   * pero el arte, los textos y los bordes salen nítidos.
   */
  outScale?: number;
};

/** Escala de salida por defecto para una plantilla de H px de alto. */
export function defaultOutScale(templateHeight: number) {
  return Math.max(1, Math.min(3, Math.round(3000 / templateHeight)));
}

/** Renderiza una vista (frente o espalda) y devuelve el canvas del tamaño de la plantilla. */
export async function renderPhotoView(base: string, pieces: PieceRaster[], opts: PhotoOptions = {}): Promise<HTMLCanvasElement> {
  const { t, img } = await loadTemplate(base);
  const k = opts.outScale ?? defaultOutScale(t.size[1]);
  const W = t.size[0] * k, H = t.size[1] * k;
  const { c: out, ctx } = canvasOf(W, H);
  out.dataset.scale = String(k); // joinViews recorta en px de la plantilla
  ctx.fillStyle = opts.backgroundColor ?? "#E9E9EC";
  ctx.fillRect(0, 0, W, H);
  const body = pieces.find((p) => p.kind === "frente" || p.kind === "espalda");
  // 1. Prenda en el color de fondo del diseño.
  await fillMask(ctx, await img(t.garment.file), t.garment.offset, body?.bgColor ?? "#FFFFFF", k);
  // Para cuello y puños de color o del fondo: por debajo de las mangas, el puño
  // queda del color de la manga.

  // 2. Cada objeto inteligente con su pieza: primero el cuerpo, las mangas encima.
  const ordered = [...t.smart].sort((a, b) => (a.fit === "body" ? -1 : 0) - (b.fit === "body" ? -1 : 0));
  for (const s of ordered) {
    const p = pieces.find((x) => x.kind === s.kind);
    if (!p) continue;
    const f = fitPiece(s, p);
    // La fuente se arma más grande en la misma proporción que la salida.
    const sc = (s.scale || 1) * k;
    const { c: src, ctx: sctx } = canvasOf(s.srcW * sc, s.srcH * sc);
    sctx.fillStyle = p.bgColor;
    sctx.fillRect(0, 0, src.width, src.height);
    // px de la fuente (escalada) → mm → px de la imagen de la pieza.
    // mm = a·(u/sc) + b ; imgPx = (mm − origin)·ppm  ⇒  imgPx = (a/sc·ppm)·u + (b − origin)·ppm
    // dibujamos la imagen de la pieza con la inversa: u = (imgPx/ppm + origin − b)·sc/a
    const ppm = p.pxPerMm;
    sctx.setTransform(sc / (f.ax * ppm), 0, 0, sc / (f.ay * ppm), ((p.originMm.x - f.bx) * sc) / f.ax, ((p.originMm.y - f.by) * sc) / f.ay);
    sctx.drawImage(p.image, 0, 0);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    // Deformar a una capa del documento y recortar por la máscara del objeto.
    const { c: layer, ctx: lctx } = canvasOf(W, H);
    drawMesh(lctx, src, s, k);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    // Manga: la malla no siempre llega a todo el borde de su máscara; se estira
    // el arte hacia afuera (copias corridas por debajo) y la máscara lo recorta.
    if (s.fit !== "body") growLayer(lctx, layer, [3, 6, 12, 24, 48].map((r) => r * k));
    const mk = await img(s.mask.file);
    const { c: mfull, ctx: mctx } = canvasOf(W, H);
    // Cada objeto con su máscara de la foto; las mangas van encima del cuerpo
    // (la máscara de la manga llega hasta la costura de la sisa de la foto).
    mctx.drawImage(mk, s.mask.offset[0] * k, s.mask.offset[1] * k, mk.width * k, mk.height * k);
    lctx.globalCompositeOperation = "destination-in";
    lctx.drawImage(mfull, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }

  // 3. Cuello y puños de color (opcional).
  const trim = opts.trimColor;
  if (trim && t.trims.cuello) await fillMask(ctx, await img(t.trims.cuello.file), t.trims.cuello.offset, trim, k);
  const cuff = opts.cuffColor ?? null;
  if (cuff && t.trims.punos) await fillMask(ctx, await img(t.trims.punos.file), t.trims.punos.offset, cuff, k);

  // 4. Sombras y brillos de la tela.
  for (const tx of t.textures) {
    ctx.save();
    ctx.globalCompositeOperation = tx.mode;
    ctx.globalAlpha = tx.opacity;
    const ti = await img(tx.file);
    ctx.drawImage(ti, tx.offset[0] * k, tx.offset[1] * k, ti.width * k, ti.height * k);
    ctx.restore();
  }
  // El brillo/sombra no debe pintar el fondo: se recorta por la prenda.
  return out;
}

/** Junta varias vistas una al lado de la otra, recortadas a la prenda. */
export function joinViews(views: HTMLCanvasElement[], opts: { backgroundColor?: string; crop?: [number, number, number, number]; scale?: number } = {}): HTMLCanvasElement {
  const k = opts.scale ?? (Number(views[0].dataset?.scale) || 1);
  const [cx, cy, cw, ch] = (opts.crop ?? [0, 0, views[0].width / k, views[0].height / k]).map((v) => v * k);
  const { c, ctx } = canvasOf(cw * views.length, ch);
  ctx.fillStyle = opts.backgroundColor ?? "#E9E9EC";
  ctx.fillRect(0, 0, c.width, c.height);
  views.forEach((v, i) => ctx.drawImage(v, cx, cy, cw, ch, i * cw, 0, cw, ch));
  return c;
}
