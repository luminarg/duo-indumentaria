import { area, bbox, intersectionArea } from "./geometry";
import { piecesFromPrimitives, type Primitives } from "./vectorImport";
import type { BBox, DesignPieceRef, PatternPiece, PieceKind, Poly } from "./types";

// Detección de piezas dentro del PDF de diseño.
//
// En el taller el diseño se hace en Corel sobre las piezas de UN talle (cada
// pieza ya pintada, recortada a su forma). Al subir ese PDF, el sistema busca
// las piezas dibujadas, las compara con la moldería y averigua:
//   - sobre qué talle se diseñó (el que mejor coincide),
//   - dónde está cada pieza en el archivo y si está girada 180°.
// Con eso, cada pieza de cualquier talle toma el arte de la pieza equivalente.

export type DesignDetection = {
  baseSizeLabel: string | null;
  /** Color de relleno que más superficie ocupa dentro de las piezas (para usar de fondo). */
  dominantColor: string | null;
  pieces: Partial<Record<PieceKind, DesignPieceRef>>;
  notes: string[];
};

function normalized(outline: Poly, box: BBox, rotation: 0 | 180): Poly {
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  return outline.map((p) =>
    rotation === 0 ? { x: p.x - box.minX, y: p.y - box.minY } : { x: w - (p.x - box.minX), y: h - (p.y - box.minY) }
  );
}

function iou(a: Poly, b: Poly) {
  const inter = intersectionArea(a, b);
  return inter / (area(a) + area(b) - inter);
}

export function detectDesignPieces(prim: Primitives, molds: PatternPiece[]): DesignDetection {
  const notes: string[] = [];
  const found = piecesFromPrimitives(prim, 2000).pieces.map((p) => ({
    outline: p.outline.map((q) => ({ x: q.x + p.box.minX, y: q.y + p.box.minY })),
    box: p.box,
    w: p.widthMm,
    h: p.heightMm,
  }));

  // Para cada talle de la moldería, cuántas piezas del diseño coinciden.
  const sizes = [...new Set(molds.map((m) => m.sizeLabel))];
  let best: { size: string; refs: Partial<Record<PieceKind, DesignPieceRef>>; score: number } | null = null;
  for (const size of sizes) {
    const ofSize = molds.filter((m) => m.sizeLabel === size);
    const refs: Partial<Record<PieceKind, DesignPieceRef>> = {};
    const used = new Set<number>();
    let score = 0;
    for (const m of ofSize) {
      const mb = bbox(m.outline);
      const mw = mb.maxX - mb.minX, mh = mb.maxY - mb.minY;
      const local = m.outline.map((q) => ({ x: q.x - mb.minX, y: q.y - mb.minY }));
      let pick: { i: number; ref: DesignPieceRef } | null = null;
      found.forEach((f, i) => {
        if (used.has(i)) return;
        if (Math.abs(f.w - mw) > Math.max(3, mw * 0.01) || Math.abs(f.h - mh) > Math.max(3, mh * 0.01)) return;
        for (const rot of [0, 180] as const) {
          const v = iou(normalized(f.outline, f.box, rot), local);
          if (v > 0.95 && (!pick || v > pick.ref.match)) pick = { i, ref: { outline: f.outline, box: f.box, rotation: rot, match: v } };
        }
      });
      if (pick) {
        const p = pick as { i: number; ref: DesignPieceRef };
        used.add(p.i);
        refs[m.kind] = p.ref;
        score += p.ref.match;
      }
    }
    if (!best || score > best.score) best = { size, refs, score };
  }

  if (!best || best.score === 0) {
    notes.push("No se encontraron en el diseño piezas que coincidan con la moldería. ¿Está dibujado sobre este molde, a escala real?");
    return { baseSizeLabel: null, dominantColor: null, pieces: {}, notes };
  }
  const kinds = Object.keys(best.refs);
  const expected = molds.filter((m) => m.sizeLabel === best!.size).map((m) => m.kind);
  const missing = expected.filter((k) => !kinds.includes(k));
  if (missing.length) notes.push(`En el diseño no se encontraron: ${missing.join(", ")}. Esas piezas van con el color de fondo.`);
  const extra = found.length - kinds.length;
  if (extra > 0) notes.push(`Hay ${extra} pieza(s) en el diseño que no están en la moldería (por ejemplo, el cuello): no se usan.`);
  return { baseSizeLabel: best.size, dominantColor: dominantFill(prim, Object.values(best.refs).map((r) => r!.box)), pieces: best.refs, notes };
}

/** El color (no negro) que más área rellena dentro de las piezas encontradas. */
function dominantFill(prim: Primitives, boxes: BBox[]): string | null {
  const byColor = new Map<string, number>();
  for (const sp of prim.subpaths) {
    if (!sp.fill || !sp.closed || sp.points.length < 3) continue;
    const n = parseInt(sp.fill.slice(1), 16);
    const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    if (lum < 12) continue; // el negro del contorno
    const b = bbox(sp.points);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    if (!boxes.some((x) => cx >= x.minX && cx <= x.maxX && cy >= x.minY && cy <= x.maxY)) continue;
    byColor.set(sp.fill, (byColor.get(sp.fill) ?? 0) + area(sp.points));
  }
  let best: string | null = null, bestA = 0;
  for (const [c, a] of byColor) if (a > bestA) { best = c; bestA = a; }
  return best;
}
