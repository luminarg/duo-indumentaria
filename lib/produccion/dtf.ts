import { PDFDocument, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, type PDFImage } from "pdf-lib";
import { ArtBaker } from "./bakeArt";
import { embedAsGroup, embedSrgbProfile, markTransparencyGroup } from "./colorProfile";

// DTF: diseños sueltos (escudos, logos, números) acomodados en el papel con
// una distancia mínima entre ellos, sin cortarse entre hojas o tramos.

export type DtfItem = { id: string; name: string; widthMm: number; heightMm: number; qty: number };

export type DtfSettings = {
  /** Ancho del papel (mm). */
  paperWidthMm: number;
  /** Alto de la hoja, o largo máximo de cada tramo si es rollo (mm). */
  paperHeightMm: number;
  /** Rollo: cada tramo se corta al largo usado. Hoja: la página mide la hoja entera. */
  roll: boolean;
  marginMm: number;
  gapMm: number;
  allowRotate: boolean;
};

export type DtfPlaced = { itemId: string; copy: number; sheet: number; x: number; y: number; w: number; h: number; rotated: boolean };
export type DtfLayout = { settings: DtfSettings; placed: DtfPlaced[]; sheets: { widthMm: number; heightMm: number }[]; tooBig: string[] };

type Rect = { x: number; y: number; w: number; h: number };

/**
 * MaxRects con regla "abajo a la izquierda": cada copia va lo más arriba y a
 * la izquierda posible (así el rollo usa el menor largo). Las medidas se
 * agrandan en la distancia mínima, de modo que entre dos diseños nunca quede
 * menos que `gapMm`.
 */
export function packDtf(items: DtfItem[], s: DtfSettings): DtfLayout {
  const g = Math.max(0, s.gapMm);
  const W = s.paperWidthMm - 2 * s.marginMm + g;
  const H = s.paperHeightMm - 2 * s.marginMm + g;
  const copies: { item: DtfItem; copy: number }[] = [];
  const tooBig: string[] = [];
  for (const it of items) {
    const fits = (it.widthMm + g <= W + 1e-6 && it.heightMm + g <= H + 1e-6) || (s.allowRotate && it.heightMm + g <= W + 1e-6 && it.widthMm + g <= H + 1e-6);
    if (!fits) {
      tooBig.push(it.name);
      continue;
    }
    for (let k = 0; k < Math.max(0, Math.floor(it.qty)); k++) copies.push({ item: it, copy: k });
  }
  // Primero los grandes (por lado mayor y después por área).
  copies.sort((a, b) => Math.max(b.item.widthMm, b.item.heightMm) - Math.max(a.item.widthMm, a.item.heightMm) || b.item.widthMm * b.item.heightMm - a.item.widthMm * a.item.heightMm);

  const bins: Rect[][] = [];
  const placed: DtfPlaced[] = [];
  const newBin = () => {
    bins.push([{ x: 0, y: 0, w: W, h: H }]);
    return bins.length - 1;
  };
  for (const c of copies) {
    const opts: { w: number; h: number; rotated: boolean }[] = [{ w: c.item.widthMm + g, h: c.item.heightMm + g, rotated: false }];
    if (s.allowRotate && Math.abs(c.item.widthMm - c.item.heightMm) > 0.01) opts.push({ w: c.item.heightMm + g, h: c.item.widthMm + g, rotated: true });
    let best: { bin: number; x: number; y: number; w: number; h: number; rotated: boolean } | null = null;
    for (let b = 0; b < bins.length && !best; b++) {
      for (const free of bins[b]) {
        for (const o of opts) {
          if (o.w > free.w + 1e-6 || o.h > free.h + 1e-6) continue;
          const better = !best || free.y + o.h < best.y + best.h - 1e-6 || (Math.abs(free.y + o.h - (best.y + best.h)) < 1e-6 && free.x < best.x);
          if (better) best = { bin: b, x: free.x, y: free.y, w: o.w, h: o.h, rotated: o.rotated };
        }
      }
    }
    if (!best) {
      const b = newBin();
      const o = opts.find((x) => x.w <= W + 1e-6 && x.h <= H + 1e-6) ?? opts[0];
      best = { bin: b, x: 0, y: 0, w: o.w, h: o.h, rotated: o.rotated };
    }
    splitFree(bins[best.bin], best);
    placed.push({ itemId: c.item.id, copy: c.copy, sheet: best.bin, x: s.marginMm + best.x, y: s.marginMm + best.y, w: best.w - g, h: best.h - g, rotated: best.rotated });
  }
  const sheets = bins.map((_, i) => {
    if (!s.roll) return { widthMm: s.paperWidthMm, heightMm: s.paperHeightMm };
    const used = Math.max(0, ...placed.filter((p) => p.sheet === i).map((p) => p.y + p.h));
    return { widthMm: s.paperWidthMm, heightMm: Math.ceil(used + s.marginMm) };
  });
  return { settings: s, placed, sheets, tooBig };
}

function splitFree(free: Rect[], used: Rect) {
  const out: Rect[] = [];
  for (const f of free) {
    if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) {
      out.push(f);
      continue;
    }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  // Sin rectángulos contenidos en otros.
  const pruned = out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9 && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  free.length = 0;
  free.push(...pruned);
}

const MM = 72 / 25.4;

/** Archivo de un diseño: PDF (vectorial) o imagen PNG/JPG. */
export type DtfFile = { id: string; kind: "pdf" | "png" | "jpg"; bytes: Uint8Array };

/** PDF del papel: una página por hoja o tramo, cada diseño en su lugar y medida. */
export async function exportDtfPdf(layout: DtfLayout, files: DtfFile[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  embedSrgbProfile(doc);
  doc.setTitle("DTF");
  doc.setCreator("Duo Indumentaria — Módulo de producción");
  const baker = new ArtBaker(doc);
  const pdfs = new Map<string, Awaited<ReturnType<typeof embedAsGroup>>>();
  const imgs = new Map<string, PDFImage>();
  for (const f of files) {
    if (f.kind === "pdf") {
      const e = await embedAsGroup(doc, f.bytes);
      await e.embed();
      pdfs.set(f.id, e);
    } else imgs.set(f.id, f.kind === "png" ? await doc.embedPng(f.bytes) : await doc.embedJpg(f.bytes));
  }
  const pages = layout.sheets.map((sh) => {
    const p = doc.addPage([sh.widthMm * MM, sh.heightMm * MM]);
    markTransparencyGroup(p);
    return p;
  });
  for (const pl of layout.placed) {
    const page = pages[pl.sheet];
    const H = layout.sheets[pl.sheet].heightMm;
    // Caja del diseño en puntos, con Y hacia arriba.
    const x0 = pl.x * MM, y0 = (H - pl.y - pl.h) * MM, bw = pl.w * MM, bh = pl.h * MM;
    // Dibujar el diseño "derecho" en (0,0)-(dw,dh) y llevarlo a la caja (girado 90° si hace falta).
    const dw = pl.rotated ? bh : bw, dh = pl.rotated ? bw : bh;
    const place = pl.rotated ? [0, 1, -1, 0, x0 + bw, y0] : [1, 0, 0, 1, x0, y0];
    const img = imgs.get(pl.itemId);
    const emb = pdfs.get(pl.itemId);
    if (img) {
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(place[0], place[1], place[2], place[3], place[4], place[5]));
      page.drawImage(img, { x: 0, y: 0, width: dw, height: dh });
      page.pushOperators(popGraphicsState());
    } else if (emb) {
      const sx = dw / emb.width, sy = dh / emb.height;
      // Escala horneada (Corel no escala las transparencias); se dibuja solo movido o girado.
      const lin = pl.rotated ? [0, sx, -sy, 0, 0, 0] : [sx, 0, 0, sy, 0, 0];
      const ref = baker.bakeEmbedded(emb, lin as [number, number, number, number, number, number], null);
      const name = page.node.newXObject("D", ref ?? emb.ref);
      const t = pl.rotated ? [1, 0, 0, 1, x0 + bw, y0] : [1, 0, 0, 1, x0, y0];
      page.pushOperators(pushGraphicsState(), ref ? concatTransformationMatrix(t[0], t[1], t[2], t[3], t[4], t[5]) : concatTransformationMatrix(place[0] * sx, place[1] * sx, place[2] * sy, place[3] * sy, place[4], place[5]), drawObject(name), popGraphicsState());
    }
  }
  return doc.save();
}

/** Inserta la resolución (pHYs) en un PNG: así los programas lo abren a la medida real. */
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, ppm);
  dv.setUint32(4, ppm);
  data[8] = 1; // metros
  const type = new TextEncoder().encode("pHYs");
  const chunk = new Uint8Array(12 + 9);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcIn = new Uint8Array(4 + 9);
  crcIn.set(type, 0);
  crcIn.set(data, 4);
  cv.setUint32(17, crc32(crcIn));
  // Después de la firma (8) y el IHDR (25), sacando un pHYs que ya hubiera.
  const out: Uint8Array[] = [png.subarray(0, 33), chunk];
  let i = 33;
  while (i < png.length) {
    const len = new DataView(png.buffer, png.byteOffset + i, 4).getUint32(0);
    const t = String.fromCharCode(...png.subarray(i + 4, i + 8));
    if (t !== "pHYs") out.push(png.subarray(i, i + 12 + len));
    i += 12 + len;
  }
  const total = out.reduce((s, a) => s + a.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const a of out) {
    res.set(a, o);
    o += a.length;
  }
  return res;
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(b: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
