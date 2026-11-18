import { applyPoly, bbox, compose, IDENTITY, intersectionArea, offset, rotate180About, translate } from "./geometry";
import type { Affine, BBox, PlacedPiece, Poly, PrintPiece, ProductionSettings, RollLayout } from "./types";

// Tizada en el rollo.
//
// Eje X = ancho del rollo (1550 mm), eje Y = largo (crece hacia abajo).
// Cada pieza ocupa su "huella": la línea de la pieza desplazada hacia afuera
// el contorno láser + la mitad de la separación. Si las huellas no se pisan,
// entre contornos queda exactamente la separación pedida (6 mm), o sea
// 6 + 2×3 = 12 mm entre las líneas reales de vector.
//
// Algoritmo: primero se ubica cada pieza por su rectángulo (skyline, de abajo
// hacia arriba y de izquierda a derecha), después se la "sube" de a 1 mm
// mientras su forma real no toque a las demás, probando 0° y 180°. Así las
// piezas trapezoidales encastran en vez de quedar en cajas.

export const DEFAULT_SETTINGS: ProductionSettings = {
  rollWidthMm: 1550,
  contourMm: 3,
  gapMm: 6,
  rotations: [0, 180],
  maxSegmentLengthMm: 5000,
  edgeMarginMm: 10,
};

/** Transformación pieza → rollo para una rotación y traslación dadas. */
export function placementTransform(outline: Poly, rotation: 0 | 180, dx: number, dy: number): Affine {
  const b = bbox(outline);
  const r = rotation === 180 ? rotate180About({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }) : IDENTITY;
  return compose(r, translate(dx, dy));
}

type Candidate = {
  print: PrintPiece;
  footprint: Record<0 | 180, Poly>; // normalizada: bbox arranca en (0,0)
  normalize: Record<0 | 180, { dx: number; dy: number }>;
  w: number;
  h: number;
  area: number;
};

function prepare(print: PrintPiece, s: ProductionSettings): Candidate {
  // +0,1 mm de resguardo para que la separación real nunca quede por debajo de la pedida.
  const fp = offset(print.piece.outline, s.contourMm + s.gapMm / 2 + 0.1);
  if (!fp) throw new Error(`No se pudo calcular el contorno de ${print.key}`);
  const footprint = {} as Record<0 | 180, Poly>;
  const normalize = {} as Record<0 | 180, { dx: number; dy: number }>;
  for (const rot of [0, 180] as const) {
    const rotated = applyPoly(placementTransform(print.piece.outline, rot, 0, 0), fp);
    const b = bbox(rotated);
    normalize[rot] = { dx: -b.minX, dy: -b.minY };
    footprint[rot] = rotated.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
  }
  const b = bbox(footprint[0]);
  return { print, footprint, normalize, w: b.maxX - b.minX, h: b.maxY - b.minY, area: (b.maxX - b.minX) * (b.maxY - b.minY) };
}

type Placed = { c: Candidate; rot: 0 | 180; x: number; y: number; poly: Poly; box: BBox };

function overlapsAny(poly: Poly, box: BBox, placed: Placed[], skip?: Placed): boolean {
  for (const p of placed) {
    if (p === skip) continue;
    if (box.maxX <= p.box.minX || box.minX >= p.box.maxX || box.maxY <= p.box.minY || box.minY >= p.box.maxY) continue;
    if (intersectionArea(poly, p.poly) > 0.01) return true;
  }
  return false;
}

function at(c: Candidate, rot: 0 | 180, x: number, y: number) {
  const poly = c.footprint[rot].map((p) => ({ x: p.x + x, y: p.y + y }));
  return { poly, box: bbox(poly) };
}

type Band = { sky: { x: number; w: number; y: number }[]; placed: Placed[] };

/** Ubica una pieza en una banda; devuelve null si no entra en el largo máximo. */
function placeInBand(band: Band, c: Candidate, usable: number, maxLen: number, s: ProductionSettings): Placed | null {
  // Posiciones candidatas en X: inicio de cada tramo del skyline, alineada al
  // final de cada tramo, y una grilla cada 50 mm. Para cada una, la Y de
  // apoyo según el skyline (por rectángulos).
  const xs = new Set<number>();
  for (const seg of band.sky) {
    xs.add(seg.x);
    xs.add(seg.x + seg.w - c.w);
  }
  for (let x = 0; x <= usable - c.w; x += 50) xs.add(x);
  xs.add(usable - c.w);
  const rest = (x: number) => {
    let y = 0;
    for (const seg of band.sky) {
      if (seg.x + seg.w <= x + 1e-6 || seg.x >= x + c.w - 1e-6) continue;
      y = Math.max(y, seg.y);
    }
    return y;
  };
  const starts = [...xs]
    .filter((x) => x >= -1e-6 && x + c.w <= usable + 1e-6)
    .map((x) => ({ x: Math.max(0, x), y: rest(Math.max(0, x)) }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 8); // las mejores por rectángulo; después se compactan con la forma real
  if (!starts.length) return null;

  // Compactación: subir mientras no toque, probando las rotaciones permitidas.
  let chosen: Placed | null = null;
  for (const start of starts) {
    for (const rot of s.rotations) {
      let y = start.y;
      let cur = at(c, rot, start.x, y);
      if (overlapsAny(cur.poly, cur.box, band.placed)) continue;
      for (const step of [20, 5, 1]) {
        while (y - step >= 0) {
          const next = at(c, rot, start.x, y - step);
          if (overlapsAny(next.poly, next.box, band.placed)) break;
          y -= step;
          cur = next;
        }
      }
      if (!chosen || cur.box.maxY < chosen.box.maxY - 1e-6 || (Math.abs(cur.box.maxY - chosen.box.maxY) < 1e-6 && start.x < chosen.x)) {
        chosen = { c, rot, x: start.x, y, ...cur };
      }
    }
  }
  if (!chosen) return null;
  const best = { x: chosen.x, y: chosen.y };
  if (chosen.box.maxY > maxLen + 1e-6) return null;
  band.placed.push(chosen);

  // Actualizar skyline con el rectángulo ocupado.
  const top = chosen.box.maxY;
  const x0 = best.x, x1 = best.x + c.w;
  const nextSky: Band["sky"] = [];
  for (const seg of band.sky) {
    const s0 = seg.x, s1 = seg.x + seg.w;
    if (s1 <= x0 + 1e-6 || s0 >= x1 - 1e-6) { nextSky.push(seg); continue; }
    if (s0 < x0) nextSky.push({ x: s0, w: x0 - s0, y: seg.y });
    if (s1 > x1) nextSky.push({ x: x1, w: s1 - x1, y: seg.y });
  }
  nextSky.push({ x: x0, w: x1 - x0, y: Math.max(top, best.y) });
  nextSky.sort((a, b) => a.x - b.x);
  band.sky = nextSky.reduce<Band["sky"]>((acc, seg) => {
    const last = acc[acc.length - 1];
    if (last && Math.abs(last.y - seg.y) < 1e-6 && Math.abs(last.x + last.w - seg.x) < 1e-6) last.w += seg.w;
    else acc.push({ ...seg });
    return acc;
  }, []);
  return chosen;
}

/**
 * Arma la tizada. El rollo se arma en tramos de hasta `maxSegmentLengthMm`
 * (cada tramo es una página del PDF): como las piezas encastran, no hay una
 * línea recta libre para cortar después, así que cada tramo se arma por separado.
 */
export function nest(prints: PrintPiece[], settings: ProductionSettings = DEFAULT_SETTINGS): RollLayout {
  const usable = settings.rollWidthMm - 2 * settings.edgeMarginMm;
  const maxLen = settings.maxSegmentLengthMm;
  const all = prints.map((p) => prepare(p, settings));
  for (const c of all) {
    if (c.w > usable) throw new Error(`La pieza ${c.print.piece.kind} talle ${c.print.piece.sizeLabel} no entra en el ancho del rollo`);
    if (c.h > maxLen) throw new Error(`La pieza ${c.print.piece.kind} talle ${c.print.piece.sizeLabel} es más larga que un tramo`);
  }
  // Se prueban varios órdenes de carga y se queda el que gasta menos rollo.
  const orders: ((a: Candidate, b: Candidate) => number)[] = [
    (a, b) => b.h - a.h || b.area - a.area,
    (a, b) => b.area - a.area,
    (a, b) => b.w - a.w || b.h - a.h,
  ];
  let best: RollLayout | null = null;
  for (const order of orders) {
    const layout = nestOrdered([...all].sort(order), usable, maxLen, settings);
    if (!best || layout.lengthMm < best.lengthMm - 1e-6) best = layout;
  }
  return best!;
}

function nestOrdered(cands: Candidate[], usable: number, maxLen: number, settings: ProductionSettings): RollLayout {
  const bands: Band[] = [];
  for (const c of cands) {
    let ok = false;
    for (const band of bands) {
      if (placeInBand(band, c, usable, maxLen, settings)) { ok = true; break; }
    }
    if (!ok) {
      const band: Band = { sky: [{ x: 0, w: usable, y: 0 }], placed: [] };
      bands.push(band);
      if (!placeInBand(band, c, usable, maxLen, settings)) throw new Error("No se pudo ubicar una pieza en el rollo");
    }
  }

  const result: PlacedPiece[] = [];
  const segments: RollLayout["segments"] = [];
  let offsetY = 0;
  for (const band of bands) {
    const bandLen = Math.max(...band.placed.map((p) => p.box.maxY));
    const idx: number[] = [];
    for (const p of band.placed) {
      const n = p.c.normalize[p.rot];
      const dx = p.x + n.dx + settings.edgeMarginMm;
      const dy = p.y + n.dy + offsetY;
      const outerLocal = offset(p.c.print.piece.outline, settings.contourMm)!;
      const outer = applyPoly(placementTransform(p.c.print.piece.outline, p.rot, dx, dy), outerLocal);
      idx.push(result.length);
      result.push({ print: p.c.print, rotation: p.rot, dx, dy, outer });
    }
    segments.push({ startMm: offsetY, endMm: offsetY + bandLen, pieceIndexes: idx });
    offsetY += bandLen;
  }
  return { settings, placed: result, segments, lengthMm: offsetY };
}
