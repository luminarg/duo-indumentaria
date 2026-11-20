import { shoulderTip } from "./assembly";
import { bbox, compose, spanAtY, translate } from "./geometry";
import { shoulderTop } from "./rules";
import type { Affine, PatternPiece, Poly, PrintPiece } from "./types";

// Mockup plano: la prenda armada vista de frente y de espalda, con el mismo
// arte que va al rollo. Las mangas se muestran por la mitad (como una remera
// apoyada en la mesa), saliendo del hombro hacia afuera; el cuerpo va encima.

export type MockupItem = {
  print: PrintPiece;
  /** Pieza → mockup (mm, Y abajo). */
  transform: Affine;
  /** Recorte extra en coordenadas de la pieza (media manga). */
  clip?: Poly;
};
export type MockupView = {
  title: string;
  items: MockupItem[];
  /** Relleno de la sisa (entre la sisa del cuerpo y la manga), en coordenadas del mockup. */
  fills: { poly: Poly; color: string }[];
};
export type MockupLayout = { views: MockupView[]; widthMm: number; heightMm: number; labels: { text: string; x: number; y: number }[] };

const rot = (deg: number): Affine => {
  const r = (deg * Math.PI) / 180;
  return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 };
};
const apply = (m: Affine, p: { x: number; y: number }) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

/** ¿La copa de la manga está abajo en el dibujo? (la copa es la punta angosta) */
function capIsDown(sleeve: PatternPiece): boolean {
  const b = bbox(sleeve.outline);
  const h = b.maxY - b.minY;
  const w = (y: number) => {
    const s = spanAtY(sleeve.outline, y);
    return s ? s[1] - s[0] : 0;
  };
  return w(b.minY + h * 0.06) > w(b.maxY - h * 0.06);
}

/**
 * Manga → mockup: la punta de la copa en la punta del hombro del cuerpo y el
 * eje de la manga hacia afuera y abajo, a `angle` grados de la vertical.
 * Se muestra la mitad que queda del lado del cuerpo.
 */
function sleeveItem(print: PrintPiece, body: PatternPiece, side: "min" | "max", angle: number): MockupItem {
  const s = print.piece;
  const b = bbox(s.outline);
  const flip: Affine = capIsDown(s) ? { a: -1, b: 0, c: 0, d: -1, e: b.minX + b.maxX, f: b.minY + b.maxY } : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const upright = { ...s, outline: s.outline.map((p) => apply(flip, p)), shoulderPoint: undefined };
  const cap = shoulderTop(upright);
  const tip = shoulderTip(body, side);
  // Ángulo: que la esquina de la sisa de la manga caiga sobre la axila del
  // cuerpo (así la manga cierra la sisa). Si no se puede medir, `angle`.
  const ub0 = bbox(upright.outline);
  const capZone = upright.outline.filter((p) => p.y <= ub0.minY + (ub0.maxY - ub0.minY) * 0.45);
  const under = capZone.reduce((best, p) => (side === "max" ? (p.x < best.x ? p : best) : p.x > best.x ? p : best), capZone[0] ?? cap);
  const pit = armpit(body, side, tip);
  let phi = side === "max" ? -angle : angle;
  if (pit && under) {
    const vs = Math.atan2(under.y - cap.y, under.x - cap.x);
    const vb = Math.atan2(pit.y - tip.y, pit.x - tip.x);
    const auto = ((vb - vs) * 180) / Math.PI;
    const norm = ((auto + 540) % 360) - 180;
    if (Math.abs(norm) < 85) phi = norm;
  }
  const m = compose(compose(compose(flip, translate(-cap.x, -cap.y)), rot(phi)), translate(tip.x, tip.y));
  // Media manga del lado del cuerpo (en el dibujo derecho, antes del giro).
  const ub = bbox(upright.outline);
  const halfUpright: Poly =
    side === "max"
      ? [{ x: ub.minX - 5, y: ub.minY - 5 }, { x: cap.x, y: ub.minY - 5 }, { x: cap.x, y: ub.maxY + 5 }, { x: ub.minX - 5, y: ub.maxY + 5 }]
      : [{ x: cap.x, y: ub.minY - 5 }, { x: ub.maxX + 5, y: ub.minY - 5 }, { x: ub.maxX + 5, y: ub.maxY + 5 }, { x: cap.x, y: ub.maxY + 5 }];
  // El recorte va en coordenadas de la pieza original: deshacer el volteo (es su propia inversa).
  const clip = halfUpright.map((p) => apply(flip, p));
  return { print, transform: m, clip };
}

/**
 * Arma las dos vistas con las piezas de UNA prenda (las de un mismo
 * jugador): frente con mangas a los costados, y espalda al lado.
 */
export function mockupLayout(prints: PrintPiece[], opts: { angleDeg?: number; gapMm?: number; marginMm?: number } = {}): MockupLayout {
  const angle = opts.angleDeg ?? 58;
  const gap = opts.gapMm ?? 180;
  const margin = opts.marginMm ?? 60;
  const byKind = new Map(prints.map((p) => [p.piece.kind, p]));
  const front = byKind.get("frente");
  const back = byKind.get("espalda");
  const sl = byKind.get("manga_izq");
  const sr = byKind.get("manga_der");
  const views: MockupView[] = [];
  const view = (title: string, body: PrintPiece | undefined, izqSide: "min" | "max") => {
    if (!body) return;
    const items: MockupItem[] = [];
    // Mangas primero (quedan debajo del cuerpo).
    if (sl) items.push(sleeveItem(sl, body.piece, izqSide, angle));
    if (sr) items.push(sleeveItem(sr, body.piece, izqSide === "max" ? "min" : "max", angle));
    items.push({ print: body, transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } });
    // La manga apoyada no copia la curva de la sisa: se rellena ese hueco con
    // el color de la manga (queda debajo de la manga y del cuerpo).
    const fills: MockupView["fills"] = [];
    for (const side of ["min", "max"] as const) {
      const sleeve = side === izqSide ? sl : sr;
      if (!sleeve) continue;
      const curve = armholeCurve(body.piece, side);
      if (curve) fills.push({ poly: curve, color: sleeve.bgColor || "#d4d4d8" });
    }
    views.push({ title, items, fills });
  };
  // De frente, la manga izquierda de quien la usa está a la derecha del dibujo; de espalda, a la izquierda.
  view("FRENTE", front, "max");
  view("ESPALDA", back, "min");
  // Short: cada pierna abierta, como se ve desde afuera.
  for (const [kind, title] of [["pierna_der", "PIERNA DERECHA"], ["pierna_izq", "PIERNA IZQUIERDA"]] as const) {
    const leg = byKind.get(kind);
    if (leg) views.push({ title, items: [{ print: leg, transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }], fills: [] });
  }

  // Ubicar las vistas una al lado de la otra, alineadas por el hombro.
  const boxOf = (v: MockupView) => {
    const pts = v.items.flatMap((it) => {
      const outline = it.print.piece.outline;
      const pts = it.clip ? outline.filter((p) => insideConvex(it.clip!, p)) : outline;
      return (pts.length ? pts : outline).map((p) => apply(it.transform, p));
    });
    return bbox(pts);
  };
  const boxes = views.map(boxOf);
  const top = Math.min(...boxes.map((b) => b.minY));
  const labelH = 110;
  let x = margin;
  const labels: MockupLayout["labels"] = [];
  views.forEach((v, i) => {
    const b = boxes[i];
    const shift = translate(x - b.minX, margin + labelH - top);
    v.items = v.items.map((it) => ({ ...it, transform: compose(it.transform, shift) }));
    v.fills = v.fills.map((f) => ({ ...f, poly: f.poly.map((p) => apply(shift, p)) }));
    labels.push({ text: v.title, x: x + (b.maxX - b.minX) / 2, y: margin + labelH * 0.55 });
    x += b.maxX - b.minX + gap;
  });
  const height = Math.max(...boxes.map((b) => b.maxY - top)) + margin * 2 + labelH;
  return { views, widthMm: x - gap + margin, heightMm: height, labels };
}

function insideConvex(poly: Poly, p: { x: number; y: number }): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    const s = Math.sign(c);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Axila del cuerpo de un lado: donde termina la sisa y arranca el costado. */
function armpit(body: PatternPiece, side: "min" | "max", tip: { x: number; y: number }) {
  const b = bbox(body.outline);
  const h = b.maxY - tip.y;
  const sideX = (p: { x: number }) => (side === "max" ? p.x : -p.x);
  const mid = body.outline.filter((p) => p.y > tip.y + h * 0.3 && p.y < tip.y + h * 0.6);
  if (!mid.length) return null;
  const seam = Math.max(...mid.map(sideX));
  const cands = body.outline.filter((p) => p.y > tip.y + 5 && p.y < tip.y + h * 0.6 && sideX(p) >= seam - 2);
  if (!cands.length) return null;
  return cands.reduce((best, p) => (p.y < best.y ? p : best));
}

/** Curva de la sisa (de la punta del hombro a la axila), cerrada con la recta. */
function armholeCurve(body: PatternPiece, side: "min" | "max"): Poly | null {
  const tip = shoulderTip(body, side);
  const pit = armpit(body, side, tip);
  if (!pit) return null;
  const o = body.outline;
  const i0 = o.findIndex((p) => p === tip || (p.x === tip.x && p.y === tip.y));
  const i1 = o.findIndex((p) => p === pit || (p.x === pit.x && p.y === pit.y));
  if (i0 < 0 || i1 < 0) return null;
  const walk = (dir: 1 | -1) => {
    const out: Poly = [];
    for (let k = i0; ; k = (k + dir + o.length) % o.length) {
      out.push(o[k]);
      if (k === i1 || out.length > o.length) break;
    }
    return out;
  };
  const a = walk(1), b = walk(-1);
  // La sisa es el camino corto que no baja más que la axila.
  const ok = (path: Poly) => path.every((p) => p.y <= pit.y + 1);
  const path = ok(a) && (!ok(b) || a.length <= b.length) ? a : ok(b) ? b : null;
  return path && path.length >= 3 ? path : null;
}
