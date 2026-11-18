import { contrastOn } from "./build";
import type { CollarRule, RollLayout } from "./types";

/** Cantidad de tiras para un pedido. */
export function collarStripCount(garments: number, rule: CollarRule): number {
  if (!rule.enabled || garments <= 0) return 0;
  const per = Math.max(1, Math.floor(rule.necksPerStrip));
  return Math.ceil(garments / per) + Math.max(0, Math.floor(rule.extraStrips));
}

/**
 * Agrega el panel de cuellos al final del rollo: tiras a todo el ancho útil,
 * pegadas una abajo de otra. Si no entra en un tramo, sigue en el siguiente
 * (siempre se corta entre tiras, nunca en el medio de una).
 */
export function addCollarPanel(layout: RollLayout, rule: CollarRule, garments: number, backgroundColor?: string | null): RollLayout {
  const strips = collarStripCount(garments, rule);
  if (!strips) return layout;
  const h = rule.stripHeightMm;
  if (!(h > 0)) throw new Error("El alto de la tira de cuello tiene que ser mayor a 0");
  const color = rule.color || backgroundColor || "#FFFFFF";
  const separatorColor = !rule.separatorColor || rule.separatorColor === "auto" ? contrastOn(color) : rule.separatorColor;
  const perSegment = Math.max(1, Math.floor(layout.settings.maxSegmentLengthMm / h));
  const segments = [...layout.segments];
  // Separación con las piezas: la misma que entre contornos.
  let y = layout.lengthMm + (layout.placed.length ? layout.settings.gapMm : 0);
  let left = strips;
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
