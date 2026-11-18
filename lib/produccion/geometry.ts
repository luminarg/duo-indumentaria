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
