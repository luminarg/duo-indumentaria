import { normalizeSize } from "./rules";
import { nest, DEFAULT_SETTINGS } from "./nesting";
import type { PrintPiece, ProductionSettings, RollLayout } from "./types";

/**
 * Una hoja por talle con el juego de piezas escalado (frente, espalda,
 * mangas), para entregar el diseño sin acomodar en rollo. Toma la primera
 * prenda de cada talle y saca nombre y número (son de cada jugador).
 */
export function sizeSheets(prints: PrintPiece[], settings: ProductionSettings = DEFAULT_SETTINGS): { size: string; layout: RollLayout }[] {
  const firstBySize = new Map<string, string>();
  for (const p of prints) {
    const k = normalizeSize(p.piece.sizeLabel);
    if (!firstBySize.has(k)) firstBySize.set(k, p.garment.orderItemId);
  }
  const out: { size: string; layout: RollLayout }[] = [];
  for (const [k, garmentId] of firstBySize) {
    const set = prints
      .filter((p) => normalizeSize(p.piece.sizeLabel) === k && p.garment.orderItemId === garmentId)
      .map((p) => ({ ...p, texts: p.texts.filter((t) => t.kind !== "nombre" && t.kind !== "numero") }));
    if (!set.length) continue;
    const layout = nest(set, { ...settings, maxSegmentLengthMm: 100_000 });
    out.push({ size: set[0].piece.sizeLabel, layout });
  }
  return out;
}
