import ClipperLib from "clipper-lib";
import type { Affine, BBox, Poly, Pt } from "./types";

// Clipper trabaja con enteros: escalamos mm → milésimas de mm.
const SCALE = 1000;

export function bbox(points: Poly): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxOfMany(polys: Poly[]): BBox {
  return bbox(polys.flat());
}

export function width(b: BBox) {
  return b.maxX - b.minX;
}

export function height(b: BBox) {
  return b.maxY - b.minY;
}

/** Área con signo (positiva = antihoraria con Y hacia arriba). */
export function signedArea(poly: Poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function area(poly: Poly) {
  return Math.abs(signedArea(poly));
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Aplica la transformación: x' = a·x + c·y + e ; y' = b·x + d·y + f (como en PDF/SVG). */
export function apply(m: Affine, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function applyPoly(m: Affine, poly: Poly): Poly {
  return poly.map((p) => apply(m, p));
}

/** Composición: primero `first`, después `then`. */
export function compose(first: Affine, then: Affine): Affine {
  return {
    a: then.a * first.a + then.c * first.b,
    b: then.b * first.a + then.d * first.b,
    c: then.a * first.c + then.c * first.d,
    d: then.b * first.c + then.d * first.d,
    e: then.a * first.e + then.c * first.f + then.e,
    f: then.b * first.e + then.d * first.f + then.f,
  };
}

export function translate(dx: number, dy: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

export function scaleAbout(s: number, origin: Pt): Affine {
  return { a: s, b: 0, c: 0, d: s, e: origin.x * (1 - s), f: origin.y * (1 - s) };
}

/** Rotación de 180° alrededor de un punto. */
export function rotate180About(c: Pt): Affine {
  return { a: -1, b: 0, c: 0, d: -1, e: 2 * c.x, f: 2 * c.y };
}

/** Giro de 0/90/180/270° (90 = de X hacia Y, horario con Y hacia abajo) alrededor de un punto. */
export function rotateQuarterAbout(c: Pt, deg: 0 | 90 | 180 | 270): Affine {
  if (deg === 0) return IDENTITY;
  if (deg === 180) return rotate180About(c);
  if (deg === 90) return { a: 0, b: 1, c: -1, d: 0, e: c.x + c.y, f: c.y - c.x };
  return { a: 0, b: -1, c: 1, d: 0, e: c.x - c.y, f: c.y + c.x };
}

/** Punto más alto (Y mínima). Si hay empate, el más cercano al centro horizontal. */
export function highestPoint(poly: Poly): Pt {
  const b = bbox(poly);
  const cx = (b.minX + b.maxX) / 2;
  let best = poly[0];
  for (const p of poly) {
    if (p.y < best.y - 1e-6 || (Math.abs(p.y - best.y) <= 1e-6 && Math.abs(p.x - cx) < Math.abs(best.x - cx))) {
      best = p;
    }
  }
  return best;
}

export function pointInPolygon(p: Pt, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Tramo horizontal [x0, x1] de la pieza a una altura dada (el más ancho si hay varios). */
export function spanAtY(poly: Poly, y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.y === b.y) continue;
    if ((y >= a.y && y < b.y) || (y >= b.y && y < a.y)) {
      xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  }
  if (xs.length < 2) return null;
  xs.sort((m, n) => m - n);
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  }
  return best;
}

function toClipper(poly: Poly) {
  return poly.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
}

function fromClipper(path: { X: number; Y: number }[]): Poly {
  return path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }));
}

/**
 * Desplaza el contorno: delta > 0 hacia afuera, delta < 0 hacia adentro.
 * Esquinas redondeadas (lo que sigue el láser sin picos).
 * Devuelve el polígono más grande del resultado, o null si desaparece.
 */
export function offset(poly: Poly, deltaMm: number, arcToleranceMm = 0.05): Poly | null {
  const co = new ClipperLib.ClipperOffset(2, arcToleranceMm * SCALE);
  co.AddPaths([toClipper(poly)], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: { X: number; Y: number }[][] = [];
  co.Execute(out, deltaMm * SCALE);
  if (!out.length) return null;
  let best = out[0];
  for (const p of out) if (Math.abs(ClipperLib.Clipper.Area(p)) > Math.abs(ClipperLib.Clipper.Area(best))) best = p;
  return fromClipper(best);
}

/** Área de `subject` que queda fuera de `container` (mm²). 0 = contenido por completo. */
export function areaOutside(subject: Poly, container: Poly): number {
  const c = new ClipperLib.Clipper();
  c.AddPaths([toClipper(subject)], ClipperLib.PolyType.ptSubject, true);
  c.AddPaths([toClipper(container)], ClipperLib.PolyType.ptClip, true);
  const out: { X: number; Y: number }[][] = [];
  c.Execute(ClipperLib.ClipType.ctDifference, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out.reduce((s, p) => s + Math.abs(ClipperLib.Clipper.Area(p)), 0) / (SCALE * SCALE);
}

/** Área de intersección entre dos polígonos (mm²). */
export function intersectionArea(p: Poly, q: Poly): number {
  const c = new ClipperLib.Clipper();
  c.AddPaths([toClipper(p)], ClipperLib.PolyType.ptSubject, true);
  c.AddPaths([toClipper(q)], ClipperLib.PolyType.ptClip, true);
  const out: { X: number; Y: number }[][] = [];
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out.reduce((s, x) => s + Math.abs(ClipperLib.Clipper.Area(x)), 0) / (SCALE * SCALE);
}

export function rectPoly(cx: number, cy: number, w: number, h: number): Poly {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
}

/** Distancia mínima entre dos polígonos (mm), por vértices contra segmentos. */
export function minDistance(p: Poly, q: Poly): number {
  if (intersectionArea(p, q) > 1e-6) return 0;
  let best = Infinity;
  const segDist = (pt: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
  };
  for (const [s, t] of [[p, q], [q, p]] as const) {
    for (const pt of s) {
      for (let i = 0; i < t.length; i++) {
        const d = segDist(pt, t[i], t[(i + 1) % t.length]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** Douglas-Peucker: saca vértices que se apartan menos de `tol` mm de la línea. */
export function simplify(poly: Poly, tol: number): Poly {
  if (poly.length < 8) return poly;
  const keep = new Uint8Array(poly.length);
  const stack: [number, number][] = [[0, poly.length - 1]];
  keep[0] = keep[poly.length - 1] = 1;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = poly[i0], b = poly[i1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1, dist = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((poly[i].x - a.x) * dy - (poly[i].y - a.y) * dx) / len;
      if (d > dist) { dist = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([i0, far], [far, i1]); }
  }
  const out = poly.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : poly;
}

/**
 * ¿Se pisan dos polígonos simples? (más rápido que calcular el área de la
 * intersección: alcanza con que se crucen dos lados o uno esté dentro del otro).
 */
export function polygonsOverlap(p: Poly, q: Poly, pb: BBox = bbox(p), qb: BBox = bbox(q)): boolean {
  if (pb.maxX <= qb.minX || qb.maxX <= pb.minX || pb.maxY <= qb.minY || qb.maxY <= pb.minY) return false;
  const n = p.length, m = q.length;
  for (let i = 0, ip = n - 1; i < n; ip = i++) {
    const a = p[ip], b = p[i];
    const ex0 = Math.min(a.x, b.x), ex1 = Math.max(a.x, b.x), ey0 = Math.min(a.y, b.y), ey1 = Math.max(a.y, b.y);
    if (ex1 < qb.minX || ex0 > qb.maxX || ey1 < qb.minY || ey0 > qb.maxY) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    for (let j = 0, jp = m - 1; j < m; jp = j++) {
      const c = q[jp], d = q[j];
      if (Math.max(c.x, d.x) < ex0 || Math.min(c.x, d.x) > ex1 || Math.max(c.y, d.y) < ey0 || Math.min(c.y, d.y) > ey1) continue;
      const fx = d.x - c.x, fy = d.y - c.y;
      const den = dx * fy - dy * fx;
      if (den === 0) continue;
      const t = ((c.x - a.x) * fy - (c.y - a.y) * fx) / den;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return true;
    }
  }
  // Sin cruces: uno adentro del otro, o bordes que coinciden (piezas iguales
  // en el mismo lugar). Se prueban todos los vértices y, si las cajas son
  // casi iguales, se calcula el área en común.
  for (const v of p) if (pointInPolygon(v, q)) return true;
  for (const v of q) if (pointInPolygon(v, p)) return true;
  if (Math.abs(pb.minX - qb.minX) < 1 && Math.abs(pb.maxX - qb.maxX) < 1 && Math.abs(pb.minY - qb.minY) < 1 && Math.abs(pb.maxY - qb.maxY) < 1) return intersectionArea(p, q) > 0.01;
  return false;
}
