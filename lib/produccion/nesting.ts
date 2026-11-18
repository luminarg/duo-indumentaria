import { applyPoly, bbox, compose, IDENTITY, intersectionArea, offset, rotate180About, translate } from "./geometry";
import type { Affine, BBox, PlacedPiece, Poly, PrintPiece, ProductionSettings, RollLayout } from "./types";

// Tizada en el rollo.
//
// Eje X = ancho del rollo (1550 mm), eje Y = largo (crece hacia abajo).
// Cada pieza ocupa su "huella": la línea de la pieza desplazada hacia afuera
// el contorno láser + la mitad de la separación (+0,1 mm de resguardo). Si
// las huellas no se pisan, entre contornos queda al menos la separación
// pedida (6 mm), o sea 6 + 2×3 = 12 mm entre las líneas reales de vector.
//
// Giro de 180°: está permitido en todas las piezas (respeta el hilo de la
// tela). Se usa para:
//   - Armar tiras de mangas alternadas (girada, derecha, girada…), cada una
//     con la copa en el hueco de la vecina; las filas se apoyan por el lado
//     recto. También se prueban pares sueltos y mangas sueltas, y se queda
//     lo que menos rollo gasta.
//   - Elegir, para cada pieza o par, la orientación que menos rollo gasta.
//
// Algoritmo: cada unidad se ubica por su rectángulo (skyline: lo más arriba
// y a la izquierda posible) y después se la "sube" mientras su forma real no
// toque a las demás. Se prueban varios órdenes de carga y se queda el más corto.

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

/** Una pieza dentro de una unidad: su contorno ya ubicado en coordenadas de la unidad. */
type Member = { print: PrintPiece; outline: Record<0 | 180, Poly> };

/** Unidad a acomodar: una pieza sola o un par de mangas encastradas. */
type Unit = {
  members: Member[];
  footprint: Record<0 | 180, Poly[]>; // normalizada: bbox arranca en (0,0)
  w: number;
  h: number;
  area: number;
};

const shift = (poly: Poly, dx: number, dy: number) => poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
const rot180In = (poly: Poly, w: number, h: number) => poly.map((p) => ({ x: w - p.x, y: h - p.y }));

function footprintOf(print: PrintPiece, s: ProductionSettings): Poly {
  const fp = offset(print.piece.outline, s.contourMm + s.gapMm / 2 + 0.1);
  if (!fp) throw new Error(`No se pudo calcular el contorno de ${print.key}`);
  return fp;
}

/** Normaliza pieza + huella para que la huella arranque en (0,0), con un giro dado. */
function oriented(print: PrintPiece, fp: Poly, rot: 0 | 180) {
  const t = placementTransform(print.piece.outline, rot, 0, 0);
  const f = applyPoly(t, fp);
  const o = applyPoly(t, print.piece.outline);
  const b = bbox(f);
  return { fp: shift(f, -b.minX, -b.minY), outline: shift(o, -b.minX, -b.minY), w: b.maxX - b.minX, h: b.maxY - b.minY };
}

function finishUnit(members: { print: PrintPiece; outline: Poly }[], polys: Poly[]): Unit {
  const b = bbox(polys.flat());
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const fp0 = polys.map((p) => shift(p, -b.minX, -b.minY));
  const out0 = members.map((m) => shift(m.outline, -b.minX, -b.minY));
  return {
    members: members.map((m, i) => ({ print: m.print, outline: { 0: out0[i], 180: rot180In(out0[i], w, h) } })),
    footprint: { 0: fp0, 180: fp0.map((p) => rot180In(p, w, h)) },
    w,
    h,
    area: w * h,
  };
}

function singleUnit(print: PrintPiece, s: ProductionSettings): Unit {
  const o = oriented(print, footprintOf(print, s), 0);
  return finishUnit([{ print, outline: o.outline }], [o.fp]);
}

/**
 * Par de mangas: la primera derecha, la segunda girada 180°, corrida hacia la
 * izquierda hasta tocar (sin pisar la separación). Si no ahorra espacio
 * frente a ponerlas una al lado de la otra, devuelve null.
 */
function sleevePair(a: PrintPiece, b: PrintPiece, s: ProductionSettings): Unit | null {
  const A = oriented(a, footprintOf(a, s), 0);
  const B = oriented(b, footprintOf(b, s), 180);
  const h = Math.max(A.h, B.h);
  let best: { dx: number; dy: number; w: number } | null = null;
  for (const dy of [0, h - B.h]) {
    let dx = A.w;
    const fits = (x: number) => intersectionArea(A.fp, shift(B.fp, x, dy)) <= 0.01;
    for (const step of [20, 5, 1, 0.25]) {
      while (dx - step >= 0 && fits(dx - step)) dx -= step;
    }
    const w = Math.max(A.w, dx + B.w);
    if (!best || w < best.w) best = { dx, dy, w };
  }
  if (!best || best.w > A.w + B.w - 5) return null;
  return finishUnit(
    [
      { print: a, outline: A.outline },
      { print: b, outline: shift(B.outline, best.dx, best.dy) },
    ],
    [A.fp, shift(B.fp, best.dx, best.dy)]
  );
}

/**
 * Tira de mangas: todas alternadas (girada, derecha, girada, derecha…), cada
 * una corrida hacia la izquierda hasta tocar a la anterior respetando la
 * separación. Las derechas bajan `dy` para que la copa entre más en el hueco
 * de la vecina. Se prueban varios `dy` y se queda el que menos superficie
 * gasta por manga. Las tiras se cortan al ancho útil del rollo.
 */
function sleeveChains(list: PrintPiece[], s: ProductionSettings, usable: number): Unit[] {
  if (!list.length) return [];
  const prepared = list.map((p) => {
    const fp = footprintOf(p, s);
    return { p, o: { 0: oriented(p, fp, 0), 180: oriented(p, fp, 180) } as Record<0 | 180, ReturnType<typeof oriented>> };
  });
  const h = Math.max(...prepared.map((x) => x.o[0].h));
  const build = (dyFrac: number) => {
    const dy = dyFrac * h;
    const chains: { members: { print: PrintPiece; outline: Poly }[]; polys: Poly[] }[] = [];
    let cur: (typeof chains)[number] | null = null;
    let lastX = 0, lastW = 0, idx = 0;
    for (const item of prepared) {
      if (!cur) { cur = { members: [], polys: [] }; chains.push(cur); idx = 0; lastX = 0; lastW = 0; }
      const rot: 0 | 180 = idx % 2 === 0 ? 180 : 0;
      const o = item.o[rot];
      const y = rot === 0 ? dy : 0;
      let x = cur.polys.length ? lastX + lastW : 0;
      const prev = cur.polys.slice(-2);
      const fits = (xx: number) => prev.every((q) => intersectionArea(shift(o.fp, xx, y), q) <= 0.01);
      if (cur.polys.length) for (const step of [20, 5, 1, 0.25]) while (x - step >= 0 && fits(x - step)) x -= step;
      if (x + o.w > usable + 1e-6 && cur.polys.length) {
        // No entra: arranca otra tira.
        cur = { members: [], polys: [] }; chains.push(cur); idx = 0; x = 0;
        const o2 = item.o[180];
        cur.members.push({ print: item.p, outline: o2.outline });
        cur.polys.push(o2.fp);
        lastX = 0; lastW = o2.w; idx = 1;
        continue;
      }
      cur.members.push({ print: item.p, outline: shift(o.outline, x, y) });
      cur.polys.push(shift(o.fp, x, y));
      lastX = x; lastW = o.w; idx++;
    }
    const total = chains.reduce((acc, c) => { const b = bbox(c.polys.flat()); return acc + (b.maxX - b.minX) * (b.maxY - b.minY); }, 0);
    return { chains, perSleeve: total / prepared.length };
  };
  let best: ReturnType<typeof build> | null = null;
  for (const f of [0, 0.1, 0.2, 0.3, 0.4]) {
    const r = build(f);
    if (!best || r.perSleeve < best.perSleeve - 1) best = r;
  }
  return best!.chains.map((c) => finishUnit(c.members, c.polys));
}

/** Agrupa las mangas de cada prenda en pares encastrados; el resto va suelto. */
type SleeveMode = "tira" | "pares" | "sueltas";

function buildUnits(prints: PrintPiece[], s: ProductionSettings, mode: SleeveMode, usable: number, chainFrac = 1): Unit[] {
  if (mode === "sueltas") return prints.map((p) => singleUnit(p, s));
  if (mode === "tira") {
    const isSleeve = (p: PrintPiece) => p.piece.kind === "manga_izq" || p.piece.kind === "manga_der";
    const units = prints.filter((p) => !isSleeve(p)).map((p) => singleUnit(p, s));
    // Una tira por talle (las mangas de un mismo talle encastran parejo).
    const bySize = new Map<string, PrintPiece[]>();
    for (const p of prints.filter(isSleeve)) (bySize.get(p.piece.sizeLabel) ?? bySize.set(p.piece.sizeLabel, []).get(p.piece.sizeLabel)!).push(p);
    // Una parte de las mangas va en tiras (filas completas) y el resto suelta,
    // para rellenar los huecos que dejan los cuerpos.
    for (const list of bySize.values()) {
      const k = Math.round(list.length * chainFrac);
      units.push(...sleeveChains(list.slice(0, k), s, usable));
      units.push(...list.slice(k).map((p) => singleUnit(p, s)));
    }
    return units;
  }
  const units: Unit[] = [];
  const sleeves = new Map<string, PrintPiece[]>();
  for (const p of prints) {
    if (s.rotations.includes(180) && (p.piece.kind === "manga_izq" || p.piece.kind === "manga_der")) {
      const k = `${p.garment.orderItemId}|${p.piece.sizeLabel}`;
      (sleeves.get(k) ?? sleeves.set(k, []).get(k)!).push(p);
    } else units.push(singleUnit(p, s));
  }
  for (const list of sleeves.values()) {
    while (list.length >= 2) {
      const a = list.shift()!, b = list.shift()!;
      const pair = sleevePair(a, b, s);
      if (pair && pair.w <= usable) units.push(pair);
      else units.push(singleUnit(a, s), singleUnit(b, s));
    }
    for (const rest of list) units.push(singleUnit(rest, s));
  }
  return units;
}

type Placed = { u: Unit; rot: 0 | 180; x: number; y: number; polys: Poly[]; box: BBox };

function overlapsAny(polys: Poly[], box: BBox, placed: Placed[]): boolean {
  for (const p of placed) {
    if (box.maxX <= p.box.minX || box.minX >= p.box.maxX || box.maxY <= p.box.minY || box.minY >= p.box.maxY) continue;
    for (const a of polys) for (const b of p.polys) if (intersectionArea(a, b) > 0.01) return true;
  }
  return false;
}

function at(u: Unit, rot: 0 | 180, x: number, y: number) {
  const polys = u.footprint[rot].map((p) => shift(p, x, y));
  return { polys, box: { minX: x, minY: y, maxX: x + u.w, maxY: y + u.h } };
}

type Band = { sky: { x: number; w: number; y: number }[]; placed: Placed[] };

/** Ubica una unidad en una banda; devuelve null si no entra en el largo máximo. */
function placeInBand(band: Band, u: Unit, usable: number, maxLen: number, s: ProductionSettings): Placed | null {
  // Posiciones candidatas en X: inicio de cada tramo del skyline, alineada al
  // final de cada tramo, y una grilla cada 50 mm.
  const xs = new Set<number>();
  for (const seg of band.sky) {
    xs.add(seg.x);
    xs.add(seg.x + seg.w - u.w);
  }
  for (let x = 0; x <= usable - u.w; x += 50) xs.add(x);
  xs.add(usable - u.w);
  const rest = (x: number) => {
    let y = 0;
    for (const seg of band.sky) {
      if (seg.x + seg.w <= x + 1e-6 || seg.x >= x + u.w - 1e-6) continue;
      y = Math.max(y, seg.y);
    }
    return y;
  };
  const starts = [...xs]
    .filter((x) => x >= -1e-6 && x + u.w <= usable + 1e-6)
    .map((x) => ({ x: Math.max(0, x), y: rest(Math.max(0, x)) }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 8);
  if (!starts.length) return null;

  let chosen: Placed | null = null;
  for (const start of starts) {
    for (const rot of s.rotations) {
      let y = start.y;
      let cur = at(u, rot, start.x, y);
      if (overlapsAny(cur.polys, cur.box, band.placed)) continue;
      for (const step of [20, 5, 1]) {
        while (y - step >= 0) {
          const next = at(u, rot, start.x, y - step);
          if (overlapsAny(next.polys, next.box, band.placed)) break;
          y -= step;
          cur = next;
        }
      }
      if (!chosen || cur.box.maxY < chosen.box.maxY - 1e-6 || (Math.abs(cur.box.maxY - chosen.box.maxY) < 1e-6 && start.x < chosen.x)) {
        chosen = { u, rot, x: start.x, y, ...cur };
      }
    }
  }
  if (!chosen || chosen.box.maxY > maxLen + 1e-6) return null;
  band.placed.push(chosen);

  // Actualizar skyline con el rectángulo ocupado.
  const top = chosen.box.maxY;
  const x0 = chosen.x, x1 = chosen.x + u.w;
  const nextSky: Band["sky"] = [];
  for (const seg of band.sky) {
    const s0 = seg.x, s1 = seg.x + seg.w;
    if (s1 <= x0 + 1e-6 || s0 >= x1 - 1e-6) { nextSky.push(seg); continue; }
    if (s0 < x0) nextSky.push({ x: s0, w: x0 - s0, y: seg.y });
    if (s1 > x1) nextSky.push({ x: x1, w: s1 - x1, y: seg.y });
  }
  nextSky.push({ x: x0, w: x1 - x0, y: Math.max(top, chosen.y) });
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
  // Mangas en tiras alternadas (todas o una parte, el resto rellena huecos
  // al lado de los cuerpos), de a pares o sueltas: se queda la que gasta menos.
  const strategies: SleeveMode[] = settings.rotations.includes(180) ? ["tira", "pares", "sueltas"] : ["sueltas"];
  const orders: ((a: Unit, b: Unit) => number)[] = [
    (a, b) => b.h - a.h || b.area - a.area,
    (a, b) => b.area - a.area,
    (a, b) => b.w - a.w || b.h - a.h,
  ];
  let best: RollLayout | null = null;
  const runs: [SleeveMode, number][] = strategies.flatMap((m): [SleeveMode, number][] =>
    m === "tira" ? [["tira", 1], ["tira", 0.75], ["tira", 0.5], ["tira", 0.25]] : [[m, 1]]);
  for (const [mode, frac] of runs) {
    const units = buildUnits(prints, settings, mode, usable, frac);
    for (const u of units) {
      const p = u.members[0].print.piece;
      if (u.w > usable) throw new Error(`La pieza ${p.kind} talle ${p.sizeLabel} no entra en el ancho del rollo`);
      if (u.h > maxLen) throw new Error(`La pieza ${p.kind} talle ${p.sizeLabel} es más larga que un tramo`);
    }
    // Se prueban varios órdenes de carga y se queda el que gasta menos rollo.
    for (const order of orders) {
      const layout = nestOrdered([...units].sort(order), usable, maxLen, settings);
      if (!best || layout.lengthMm < best.lengthMm - 1e-6) best = layout;
    }
  }
  return best!;
}

function nestOrdered(units: Unit[], usable: number, maxLen: number, settings: ProductionSettings): RollLayout {
  const bands: Band[] = [];
  for (const u of units) {
    let ok = false;
    for (const band of bands) {
      if (placeInBand(band, u, usable, maxLen, settings)) { ok = true; break; }
    }
    if (!ok) {
      const band: Band = { sky: [{ x: 0, w: usable, y: 0 }], placed: [] };
      bands.push(band);
      if (!placeInBand(band, u, usable, maxLen, settings)) throw new Error("No se pudo ubicar una pieza en el rollo");
    }
  }

  const result: PlacedPiece[] = [];
  const segments: RollLayout["segments"] = [];
  let offsetY = 0;
  for (const band of bands) {
    const bandLen = Math.max(...band.placed.map((p) => p.box.maxY));
    const idx: number[] = [];
    for (const p of band.placed) {
      for (const m of p.u.members) {
        // Contorno de la pieza ya ubicado → giro total y traslación.
        const local = shift(m.outline[p.rot], p.x + settings.edgeMarginMm, p.y + offsetY);
        const src = bbox(m.print.piece.outline);
        const dst = bbox(local);
        // ¿La pieza quedó girada respecto de su dibujo? Se compara un vértice.
        const o0 = m.print.piece.outline[0];
        const l0 = local[0];
        const straight = Math.abs(l0.x - dst.minX - (o0.x - src.minX)) < 0.01 && Math.abs(l0.y - dst.minY - (o0.y - src.minY)) < 0.01;
        const rotation: 0 | 180 = straight ? 0 : 180;
        const dx = dst.minX - src.minX;
        const dy = dst.minY - src.minY;
        const outerLocal = offset(m.print.piece.outline, settings.contourMm)!;
        const outer = applyPoly(placementTransform(m.print.piece.outline, rotation, dx, dy), outerLocal);
        idx.push(result.length);
        result.push({ print: m.print, rotation, dx, dy, outer });
      }
    }
    segments.push({ startMm: offsetY, endMm: offsetY + bandLen, pieceIndexes: idx });
    offsetY += bandLen;
  }
  return { settings, placed: result, segments, lengthMm: offsetY };
}
