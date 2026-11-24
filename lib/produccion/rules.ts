import { areaOutside, bbox, highestPoint, offset, rectPoly } from "./geometry";
import type { AnchoredElement, PatternPiece, PieceKind, Pt, SizeGroup, WearerSide } from "./types";

/**
 * Forma canónica de un talle para comparar: "2xl" = "XXL", "3XL" = "XXXL",
 * "10 años" = "10". La moldería y los pedidos pueden escribirlo distinto.
 */
export function normalizeSize(label: string): string {
  let s = label.trim().toUpperCase().replace(/\s*(AÑOS|ANOS|AÑO)\s*$/, "").replace(/\s+/g, "");
  const m = s.match(/^(\d)XL$/);
  if (m) s = "X".repeat(Number(m[1])) + "L";
  const n = s.match(/^(\d)XS$/);
  if (n) s = "X".repeat(Number(n[1])) + "S";
  return s;
}

/**
 * Talle de niño: números solos hasta 16 ("2", "10", "16"), o textos con
 * "niño"/"años". Todo lo demás (XS…4XL, dama, etc.) es adulto.
 */
export function sizeGroupOf(sizeLabel: string): SizeGroup {
  const s = sizeLabel.trim().toLowerCase();
  if (/niñ|nin[oa]|años|anos/.test(s)) return "nino";
  const n = Number(s);
  if (Number.isInteger(n) && n > 0 && n <= 16) return "nino";
  return "adulto";
}

/** 1 unidad de la grilla = ancho máximo de la pieza / 10. */
export function gridUnit(piece: PatternPiece): number {
  const b = bbox(piece.outline);
  return (b.maxX - b.minX) / 10;
}

/**
 * Unidad vertical. En la remera es la misma que la horizontal (un décimo del
 * ancho). En el short la grilla es de 10 × 10: un décimo del ancho a lo ancho
 * y un décimo del alto a lo alto (las piernas son casi cuadradas, pero cada
 * talle crece distinto a lo ancho y a lo alto).
 */
export function gridUnitY(piece: PatternPiece): number {
  if (piece.kind !== "pierna_izq" && piece.kind !== "pierna_der") return gridUnit(piece);
  const b = bbox(piece.outline);
  return (b.maxY - b.minY) / 10;
}

export function shoulderTop(piece: PatternPiece): Pt {
  return piece.shoulderPoint ?? highestPoint(piece.outline);
}

export function baselineY(piece: PatternPiece): number {
  return piece.baselineY ?? bbox(piece.outline).maxY;
}

/**
 * ¿De qué lado del DIBUJO queda el lado de quien usa la prenda?
 * Las piezas están vistas desde afuera: en el frente, la izquierda de quien la
 * usa queda a la derecha del dibujo; en la espalda, a la izquierda.
 */
export function drawingSideFor(kind: PieceKind, side: WearerSide): "min" | "max" | "centro" {
  if (side === "centro") return "centro";
  const isBack = kind === "espalda";
  if (side === "izquierda") return isBack ? "min" : "max";
  return isBack ? "max" : "min";
}

/** X en el dibujo para "N unidades desde el costado de quien usa". */
export function xFromWearerSide(piece: PatternPiece, side: WearerSide, units: number): number {
  const b = bbox(piece.outline);
  const u = gridUnit(piece);
  const s = drawingSideFor(piece.kind, side);
  if (s === "centro") return (b.minX + b.maxX) / 2;
  return s === "max" ? b.maxX - units * u : b.minX + units * u;
}

/** Y en el dibujo para "N unidades bajando desde el punto más alto del hombro". */
export function yFromShoulderTop(piece: PatternPiece, units: number): number {
  return shoulderTop(piece).y + units * gridUnitY(piece);
}

const isLegKind = (k: PieceKind) => k === "pierna_izq" || k === "pierna_der";

/**
 * Short: punto de la grilla imaginaria de 10 × 10 de la pierna. X desde el
 * costado del dibujo ("izquierda" = borde izquierdo de la pieza, "derecha" =
 * borde derecho, "centro" = al medio) en décimos del ancho; Y desde la base
 * (abajo) en décimos del alto. Es el centro del elemento.
 */
export function legGridPoint(piece: PatternPiece, side: "izquierda" | "derecha" | "centro", fromSideUnits: number, fromBaseUnits: number): Pt {
  const b = bbox(piece.outline);
  const ux = gridUnit(piece), uy = gridUnitY(piece);
  const x = side === "centro" ? (b.minX + b.maxX) / 2 : side === "izquierda" ? b.minX + fromSideUnits * ux : b.maxX - fromSideUnits * ux;
  return { x, y: baselineY(piece) - fromBaseUnits * uy };
}

/** Centro y tamaño de un elemento anclado en esta pieza. */
export function placeElement(piece: PatternPiece, el: AnchoredElement) {
  const group = sizeGroupOf(piece.sizeLabel);
  const w = el.widthMm[group];
  const h = w * el.aspect;
  const center = isLegKind(piece.kind)
    ? legGridPoint(piece, el.side, el.fromSideUnits, el.fromBaseUnits ?? 10 - el.fromShoulderTopUnits)
    : { x: xFromWearerSide(piece, el.side, el.fromSideUnits), y: yFromShoulderTop(piece, el.fromShoulderTopUnits) };
  return { center, widthMm: w, heightMm: h };
}

/**
 * Controla la zona segura: el rectángulo (centro, ancho, alto) tiene que
 * quedar a más de `marginMm` del contorno. Devuelve el área que se pasa (mm²).
 */
export function safeZoneOverflow(piece: PatternPiece, center: Pt, w: number, h: number, marginMm: number): number {
  const inner = offset(piece.outline, -marginMm);
  const rect = rectPoly(center.x, center.y, w, h);
  if (!inner) return w * h;
  return areaOutside(rect, inner);
}
