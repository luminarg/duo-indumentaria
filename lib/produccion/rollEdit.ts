import { bbox, intersectionArea, offset, polygonsOverlap, simplify } from "./geometry";
import { appendCollarStrips } from "./collars";
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

/**
 * Gira la pieza en su lugar, alrededor de su centro: 180° (respeta el hilo de
 * la tela) o 90° (solo tiene sentido en mangas).
 */
export function rotatePiece(layout: RollLayout, idx: number, by: 90 | 180 = 180): RollLayout {
  const p = layout.placed[idx];
  const outline = p.print.piece.outline;
  const oldT = placementTransform(outline, p.rotation, p.dx, p.dy);
  const local = p.outer.map((q) => apply(invert(oldT), q));
  const rotation = ((p.rotation + by) % 360) as typeof p.rotation;
  const newT = placementTransform(outline, rotation, p.dx, p.dy);
  const outer = local.map((q) => apply(newT, q));
  const placed = layout.placed.map((q, i) => (i === idx ? { ...q, rotation, outer } : q));
  return reassignSegments({ ...layout, placed });
}

/**
 * Después de soltar una pieza: si quedó pisando o a menos de la separación de
 * otra (o fuera del ancho), la corre lo mínimo hasta que cumpla, probando en
 * círculos cada vez más grandes (hasta `maxMm`). Si no encuentra lugar, la
 * deja donde está (queda en rojo).
 */
export function settlePiece(layout: RollLayout, idx: number, maxMm = 80): RollLayout {
  if (!validateLayout(layout, [idx]).length) return layout;
  const s = layout.settings;
  const half = s.gapMm / 2 - 0.05;
  const grownOf = (poly: Poly) => {
    const g = offset(poly, half);
    return g ? simplify(g, 0.2) : null;
  };
  const me = grownOf(layout.placed[idx].outer);
  if (!me) return layout;
  const meBox = bbox(me);
  const rawBox = bbox(layout.placed[idx].outer);
  const others = layout.placed
    .map((p, j) => (j === idx ? null : grownOf(p.outer)))
    .map((g) => (g ? { g, b: bbox(g) } : null));
  const collarRanges = layout.segments.filter((g) => g.collars).map((g) => [g.collars!.startMm - s.gapMm, g.collars!.endMm] as const);
  const ok = (dx: number, dy: number) => {
    if (rawBox.minX + dx < s.edgeMarginMm || rawBox.maxX + dx > s.rollWidthMm - s.edgeMarginMm || rawBox.minY + dy < 0) return false;
    if (collarRanges.some(([a, b]) => rawBox.maxY + dy > a && rawBox.minY + dy < b)) return false;
    const box = { minX: meBox.minX + dx, maxX: meBox.maxX + dx, minY: meBox.minY + dy, maxY: meBox.maxY + dy };
    const moved = me.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    for (const o of others) if (o && polygonsOverlap(moved, o.g, box, o.b)) return false;
    return true;
  };
  for (let r = 1; r <= maxMm; r += r < 10 ? 1 : 2) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 2));
    let best: [number, number] | null = null;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      const dx = Math.round(r * Math.cos(a) * 2) / 2, dy = Math.round(r * Math.sin(a) * 2) / 2;
      if (ok(dx, dy)) { best = [dx, dy]; break; }
    }
    if (best) {
      const moved = movePiece(layout, idx, best[0], best[1]);
      // Por si quedó partida entre paños: el validador completo decide.
      return validateLayout(moved, [idx]).length ? layout : moved;
    }
  }
  return layout;
}

/** Vuelve a repartir las piezas en los paños según dónde quedaron. */
export function reassignSegments(layout: RollLayout): RollLayout {
  const segments = layout.segments.map((s) => ({ ...s, pieceIndexes: [] as number[] }));
  layout.placed.forEach((p, i) => {
    const b = bbox(p.outer);
    const cy = (b.minY + b.maxY) / 2;
    // El tramo puede terminar con el panel de cuellos: las piezas van antes.
    const end = (s: (typeof segments)[number]) => (s.collars ? s.collars.startMm : s.endMm);
    const seg = segments.find((s) => cy >= s.startMm && cy < end(s)) ?? segments.find((s) => b.minY < end(s)) ?? segments[0];
    seg.pieceIndexes.push(i);
  });
  return { ...layout, segments };
}

/**
 * Después de mover o girar a mano: si quedó lugar libre, el rollo se achica
 * solo. Cada paño termina justo debajo de su pieza más baja (+ la mitad de la
 * separación, como arma el motor), los paños de abajo suben lo que se ganó y
 * las tiras de cuello vuelven a quedar a 6 mm de la última pieza.
 */
export function compactLayout(layout: RollLayout): RollLayout {
  const s = layout.settings;
  const panels = layout.segments.filter((g) => g.collars).map((g) => g.collars!);
  const segs = layout.segments.filter((g) => g.pieceIndexes.length);
  if (!segs.length) return layout;
  let placed = [...layout.placed];
  const out: RollLayout["segments"] = [];
  let prevEnd = 0;
  for (const g of segs) {
    const delta = prevEnd - g.startMm;
    let bottom = -Infinity;
    for (const i of g.pieceIndexes) {
      const p = placed[i];
      const moved = delta ? { ...p, dy: p.dy + delta, outer: p.outer.map((q) => ({ x: q.x, y: q.y + delta })) } : p;
      placed[i] = moved;
      for (const q of moved.outer) if (q.y > bottom) bottom = q.y;
    }
    const end = Math.max(prevEnd, bottom + s.gapMm / 2);
    out.push({ startMm: prevEnd, endMm: end, pieceIndexes: [...g.pieceIndexes] });
    prevEnd = end;
  }
  placed = placed.slice();
  let next: RollLayout = { ...layout, placed, segments: out, lengthMm: prevEnd };
  for (const c of panels) next = appendCollarStrips(next, c.strips, c.rule, c.color, c.separatorColor);
  return next;
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
