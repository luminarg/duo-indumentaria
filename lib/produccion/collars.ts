import { contrastOn } from "./build";
import type { CollarRule, RollLayout } from "./types";

/** Cantidad de tiras para un pedido. */
export function collarStripCount(garments: number, rule: CollarRule): number {
  if (!rule.enabled || garments <= 0) return 0;
  const per = Math.max(1, Math.floor(rule.necksPerStrip));
  return Math.ceil(garments / per) + Math.max(0, Math.floor(rule.extraStrips));
}

/**
 * Agrega el panel de cuellos al final del rollo, a 6 mm (la separación) de
 * la última pieza: tiras a todo el ancho útil, pegadas una abajo de otra. Va
 * en el mismo paño que las últimas piezas mientras entre; si no, sigue en el
 * siguiente (siempre se corta entre tiras, nunca en el medio de una).
 */
export function addCollarPanel(layout: RollLayout, rule: CollarRule, garments: number, backgroundColor?: string | null): RollLayout {
  const strips = collarStripCount(garments, rule);
  if (!strips) return layout;
  const h = rule.stripHeightMm;
  if (!(h > 0)) throw new Error("El alto de la tira de cuello tiene que ser mayor a 0");
  const color = rule.color || backgroundColor || "#FFFFFF";
  const separatorColor = !rule.separatorColor || rule.separatorColor === "auto" ? contrastOn(color) : rule.separatorColor;
  const maxSeg = layout.settings.maxSegmentLengthMm;
  const perSegment = Math.max(1, Math.floor(maxSeg / h));
  const segments = layout.segments.map((g) => ({ ...g }));
  // A 6 mm (la separación) del contorno de la última pieza, no del borde de
  // su huella: el panel arranca justo debajo de lo más bajo del rollo.
  let lastY = 0;
  for (const p of layout.placed) for (const q of p.outer) if (q.y > lastY) lastY = q.y;
  let y = layout.placed.length ? lastY + layout.settings.gapMm : 0;
  let left = strips;
  // Primero, lo que entre en el último paño (así no queda en una hoja aparte).
  const last = segments.at(-1);
  if (last && !last.collars && layout.placed.length) {
    const n = Math.min(left, Math.floor((last.startMm + maxSeg - y) / h));
    if (n > 0) {
      last.endMm = y + n * h;
      last.collars = { startMm: y, endMm: y + n * h, strips: n, stripHeightMm: h, rule, color, separatorColor };
      y += n * h;
      left -= n;
    }
  }
  while (left > 0) {
    const n = Math.min(left, perSegment);
    segments.push({
      startMm: y,
      endMm: y + n * h,
      pieceIndexes: [],
      collars: { startMm: y, endMm: y + n * h, strips: n, stripHeightMm: h, rule, color, separatorColor },
    });
    y += n * h;
    left -= n;
  }
  return { ...layout, segments, lengthMm: y };
}
