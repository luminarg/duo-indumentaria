import { bbox, intersectionArea, offset } from "./geometry";
import { placementTransform } from "./nesting";
import type { Affine, Poly, RollLayout } from "./types";

// Retoque manual del rollo: mover y girar piezas después del acomodo
// automático, sin romper las reglas (separación entre contornos, ancho útil y
// paños: una pieza nunca puede quedar partida entre dos paños).

const apply = (m: Affine, p: { x: number; y: number }) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}

/** Mueve la pieza `idx` (dx, dy en mm del rollo). */
export function movePiece(layout: RollLayout, idx: number, dx: number, dy: number): RollLayout {
  const placed = layout.placed.map((p, i) => (i === idx ? { ...p, dx: p.dx + dx, dy: p.dy + dy, outer: p.outer.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : p));
  return reassignSegments({ ...layout, placed });
}

/** Gira la pieza 180° en su lugar (respeta el hilo de la tela). */
export function rotatePiece(layout: RollLayout, idx: number): RollLayout {
  const p = layout.placed[idx];
  const outline = p.print.piece.outline;
  const oldT = placementTransform(outline, p.rotation, p.dx, p.dy);
  const local = p.outer.map((q) => apply(invert(oldT), q));
  const rotation: 0 | 180 = p.rotation === 180 ? 0 : 180;
  const newT = placementTransform(outline, rotation, p.dx, p.dy);
  const outer = local.map((q) => apply(newT, q));
  const placed = layout.placed.map((q, i) => (i === idx ? { ...q, rotation, outer } : q));
  return reassignSegments({ ...layout, placed });
}

/** Vuelve a repartir las piezas en los paños según dónde quedaron. */
export function reassignSegments(layout: RollLayout): RollLayout {
  const segments = layout.segments.map((s) => ({ ...s, pieceIndexes: [] as number[] }));
  layout.placed.forEach((p, i) => {
    const b = bbox(p.outer);
    const cy = (b.minY + b.maxY) / 2;
    const seg = segments.find((s) => !s.collars && cy >= s.startMm && cy < s.endMm) ?? segments.find((s) => !s.collars && b.minY < s.endMm) ?? segments[0];
    seg.pieceIndexes.push(i);
  });
  return { ...layout, segments };
}

export type PieceIssue = { idx: number; message: string };

/**
 * Problemas de las piezas `indexes` (o de todas): se tocan con otra (menos de
 * la separación entre contornos), se salen del ancho útil o quedan partidas
 * entre dos paños.
 */
export function validateLayout(layout: RollLayout, indexes?: number[]): PieceIssue[] {
  const s = layout.settings;
  const issues: PieceIssue[] = [];
  const half = s.gapMm / 2;
  const grown = new Map<number, Poly | null>();
  const grow = (i: number) => {
    if (!grown.has(i)) grown.set(i, offset(layout.placed[i].outer, half - 0.05));
    return grown.get(i)!;
  };
  const boxes = layout.placed.map((p) => bbox(p.outer));
  const check = indexes ?? layout.placed.map((_, i) => i);
  for (const i of check) {
    const b = boxes[i];
    if (b.minX < s.edgeMarginMm - 0.01 || b.maxX > s.rollWidthMm - s.edgeMarginMm + 0.01) {
      issues.push({ idx: i, message: "Se sale del ancho útil del rollo." });
      continue;
    }
    const seg = layout.segments.find((g) => g.pieceIndexes.includes(i));
    if (seg && (b.minY < seg.startMm - 0.01 || b.maxY > seg.endMm + 0.01)) {
      issues.push({ idx: i, message: "Queda partida entre dos paños." });
      continue;
    }
    if (b.minY < -0.01) {
      issues.push({ idx: i, message: "Se sale del principio del rollo." });
      continue;
    }
    const gi = grow(i);
    for (let j = 0; j < layout.placed.length; j++) {
      if (j === i) continue;
      const o = boxes[j];
      if (o.minX > b.maxX + s.gapMm || o.maxX < b.minX - s.gapMm || o.minY > b.maxY + s.gapMm || o.maxY < b.minY - s.gapMm) continue;
      const gj = grow(j);
      if (gi && gj && intersectionArea(gi, gj) > 0.01) {
        issues.push({ idx: i, message: `Está a menos de ${s.gapMm} mm de otra pieza.` });
        break;
      }
    }
    // Contra los cuellos
    for (const g of layout.segments) {
      if (!g.collars) continue;
      if (b.maxY + half > g.collars.startMm - half && b.minY < g.collars.endMm) {
        issues.push({ idx: i, message: "Se mete en el panel de cuellos." });
        break;
      }
    }
  }
  return issues;
}

/** Largo real ocupado (por si un retoque deja el final más corto). */
export function usedLength(layout: RollLayout): number {
  let max = 0;
  for (const p of layout.placed) max = Math.max(max, bbox(p.outer).maxY);
  for (const g of layout.segments) if (g.collars) max = Math.max(max, g.collars.endMm);
  return max;
}
