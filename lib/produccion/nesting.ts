import { applyPoly, bbox, compose, offset, polygonsOverlap, rotateQuarterAbout, simplify, translate } from "./geometry";
import type { Affine, BBox, PlacedPiece, Poly, PrintPiece, ProductionSettings, RollLayout, Rotation } from "./types";

// Tizada en el rollo.
//
// Eje X = ancho del rollo (1550 mm), eje Y = largo (crece hacia abajo).
// Cada pieza ocupa su "huella": la línea de la pieza desplazada hacia afuera
// el contorno láser + la mitad de la separación (+0,1 mm de resguardo). Si
// las huellas no se pisan, entre contornos queda al menos la separación
// pedida (6 mm), o sea 6 + 2×3 = 12 mm entre las líneas reales de vector.
//
// Giros:
//   - 180°: en todas las piezas (respeta el hilo de la tela). Se usa para
//     armar tiras de mangas alternadas (cada una con la copa en el hueco de la
//     vecina), pares de mangas y pares de piernas de short (una girada, la
//     cintura de una contra la de la otra), y para elegir la orientación que
//     menos rollo gasta.
//   - 90°/270°: solo mangas sueltas y solo si `sleeveQuarterTurns` está
//     activo (apagado: el taller usa las mangas solo a 0° o 180°).
//
// Algoritmo (abajo-izquierda con huecos): cada unidad se prueba en muchas
// columnas X; en cada una se busca, desde el principio del rollo, la primera
// altura donde su forma real no pisa a ninguna de las ya ubicadas (así entra
// al costado de piezas anteriores si hay lugar), y después se la sube de a
// poco mientras no toque. Se elige la posición que termina más arriba. Se
// prueban varios órdenes de carga y estrategias y se queda el más corto.

export const DEFAULT_SETTINGS: ProductionSettings = {
  rollWidthMm: 1550,
  contourMm: 3,
  gapMm: 6,
  rotations: [0, 180],
  sleeveQuarterTurns: false, // el taller pide mangas solo a 0°/180° (hilo de la tela)
  maxSegmentLengthMm: 5000,
  edgeMarginMm: 10,
};

/** Transformación pieza → rollo: giro alrededor del centro de la pieza y traslación. */
export function placementTransform(outline: Poly, rotation: Rotation, dx: number, dy: number): Affine {
  const b = bbox(outline);
  const r = rotateQuarterAbout({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, rotation);
  return compose(r, translate(dx, dy));
}


const addRot = (a: Rotation, b: Rotation) => ((a + b) % 360) as Rotation;

/** Una pieza dentro de una unidad, con su giro propio dentro de la unidad. */
type Member = { print: PrintPiece; baseRot: Rotation; outline: Partial<Record<Rotation, Poly>> };

/** Unidad a acomodar: una pieza sola, un par o una tira. */
type Unit = {
  members: Member[];
  /** Huellas por giro de la unidad, normalizadas (bbox desde 0,0). */
  footprint: Partial<Record<Rotation, Poly[]>>;
  fpBoxes: Partial<Record<Rotation, BBox[]>>;
  /** Altura del centro de masa de la huella (desde arriba), por giro. */
  cy: Partial<Record<Rotation, number>>;
  rots: Rotation[];
  /** Medidas con giro 0. */
  w: number;
  h: number;
  area: number;
  /** Va al final del rollo (después de todo lo demás). */
  last?: boolean;
};

const shift = (poly: Poly, dx: number, dy: number) => poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
/** Gira un polígono dentro de la caja [0,w]×[0,h] y lo vuelve a apoyar en (0,0). */
function rotIn(poly: Poly, w: number, h: number, r: Rotation): Poly {
  if (r === 0) return poly;
  if (r === 180) return poly.map((p) => ({ x: w - p.x, y: h - p.y }));
  if (r === 90) return poly.map((p) => ({ x: h - p.y, y: p.x }));
  return poly.map((p) => ({ x: p.y, y: w - p.x }));
}
const dims = (u: Unit, r: Rotation) => (r === 90 || r === 270 ? { w: u.h, h: u.w } : { w: u.w, h: u.h });

const isSleeve = (p: PrintPiece) => p.piece.kind === "manga_izq" || p.piece.kind === "manga_der";
const isLegPiece = (p: PrintPiece) => p.piece.kind === "pierna_izq" || p.piece.kind === "pierna_der";

function footprintOf(print: PrintPiece, s: ProductionSettings): Poly {
  // +0,4 mm y simplificada a 0,3 mm: menos vértices (mucho más rápido de
  // comparar) y sigue conteniendo a la huella exacta (+0,1 de resguardo).
  const fp = offset(print.piece.outline, s.contourMm + s.gapMm / 2 + 0.4);
  if (!fp) throw new Error(`No se pudo calcular el contorno de ${print.key}`);
  return simplify(fp, 0.3);
}

/** Normaliza pieza + huella para que la huella arranque en (0,0), con un giro dado. */
function oriented(print: PrintPiece, fp: Poly, rot: 0 | 180) {
  const t = placementTransform(print.piece.outline, rot, 0, 0);
  const f = applyPoly(t, fp);
  const o = applyPoly(t, print.piece.outline);
  const b = bbox(f);
  return { fp: shift(f, -b.minX, -b.minY), outline: shift(o, -b.minX, -b.minY), w: b.maxX - b.minX, h: b.maxY - b.minY, rot };
}

function finishUnit(members: { print: PrintPiece; outline: Poly; baseRot: Rotation }[], polys: Poly[], rots: Rotation[] = [0, 180]): Unit {
  const b = bbox(polys.flat());
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const fp0 = polys.map((p) => shift(p, -b.minX, -b.minY));
  const out0 = members.map((m) => shift(m.outline, -b.minX, -b.minY));
  const footprint: Unit["footprint"] = {};
  for (const r of rots) footprint[r] = fp0.map((p) => rotIn(p, w, h, r));
  return {
    members: members.map((m, i) => {
      const outline: Member["outline"] = {};
      for (const r of rots) outline[r] = rotIn(out0[i], w, h, r);
      return { print: m.print, baseRot: m.baseRot, outline };
    }),
    footprint,
    fpBoxes: {},
    cy: {},
    rots,
    w,
    h,
    area: w * h,
  };
}

function singleUnit(print: PrintPiece, s: ProductionSettings): Unit {
  const o = oriented(print, footprintOf(print, s), 0);
  const rots: Rotation[] = s.rotations.includes(180) ? [0, 180] : [0];
  if (s.sleeveQuarterTurns && isSleeve(print)) rots.push(90, 270);
  return finishUnit([{ print, outline: o.outline, baseRot: 0 }], [o.fp], rots);
}

/**
 * Par encastrado: la primera derecha, la segunda girada 180°, corrida hacia
 * la izquierda hasta tocar (sin pisar la separación), probando varias alturas
 * relativas. Si no ahorra espacio frente a ponerlas una al lado de la otra,
 * devuelve null. Sirve para mangas y para piernas de short.
 */
function interlockPair(a: PrintPiece, b: PrintPiece, s: ProductionSettings): Unit | null {
  const A = oriented(a, footprintOf(a, s), 0);
  const B = oriented(b, footprintOf(b, s), 180);
  const h = Math.max(A.h, B.h);
  const dys = new Set([0, h - B.h, A.h - h]);
  for (const f of [0.1, 0.2, 0.3]) { dys.add(f * h); dys.add(-f * h); }
  let best: { dx: number; dy: number; area: number } | null = null;
  for (const dy of dys) {
    let dx = A.w;
    const fits = (x: number) => !polygonsOverlap(A.fp, shift(B.fp, x, dy));
    if (!fits(dx)) continue;
    for (const step of [20, 5, 1, 0.25]) {
      while (fits(dx - step) && dx - step > -B.w) dx -= step;
    }
    const minX = Math.min(0, dx), maxX = Math.max(A.w, dx + B.w);
    const minY = Math.min(0, dy), maxY = Math.max(A.h, dy + B.h);
    const area = (maxX - minX) * (maxY - minY);
    if (!best || area < best.area) best = { dx, dy, area };
  }
  if (!best || best.area > (A.w + B.w) * h - 25 * h) return null;
  return finishUnit(
    [
      { print: a, outline: A.outline, baseRot: 0 },
      { print: b, outline: shift(B.outline, best.dx, best.dy), baseRot: 180 },
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
  type Chain = { members: { print: PrintPiece; outline: Poly; baseRot: Rotation }[]; polys: Poly[] };
  const build = (dyFrac: number) => {
    const dy = dyFrac * h;
    const chains: Chain[] = [];
    let cur: Chain | null = null;
    let lastX = 0, lastW = 0, idx = 0;
    for (const item of prepared) {
      if (!cur) { cur = { members: [], polys: [] }; chains.push(cur); idx = 0; lastX = 0; lastW = 0; }
      const rot: 0 | 180 = idx % 2 === 0 ? 180 : 0;
      const o = item.o[rot];
      const y = rot === 0 ? dy : 0;
      let x = cur.polys.length ? lastX + lastW : 0;
      const prev = cur.polys.slice(-2);
      const fits = (xx: number) => prev.every((q) => !polygonsOverlap(shift(o.fp, xx, y), q));
      if (cur.polys.length) for (const step of [20, 5, 1, 0.25]) while (x - step >= 0 && fits(x - step)) x -= step;
      if (x + o.w > usable + 1e-6 && cur.polys.length) {
        // No entra: arranca otra tira.
        cur = { members: [], polys: [] }; chains.push(cur); idx = 0; x = 0;
        const o2 = item.o[180];
        cur.members.push({ print: item.p, outline: o2.outline, baseRot: 180 });
        cur.polys.push(o2.fp);
        lastX = 0; lastW = o2.w; idx = 1;
        continue;
      }
      cur.members.push({ print: item.p, outline: shift(o.outline, x, y), baseRot: rot });
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

/** Piernas de short de a pares (por prenda y talle), una girada 180°. */
function legUnits(prints: PrintPiece[], s: ProductionSettings): Unit[] {
  const units: Unit[] = [];
  const byGarment = new Map<string, PrintPiece[]>();
  for (const p of prints) {
    const k = `${p.garment.orderItemId}|${p.piece.sizeLabel}`;
    (byGarment.get(k) ?? byGarment.set(k, []).get(k)!).push(p);
  }
  for (const list of byGarment.values()) {
    while (list.length >= 2) {
      const a = list.shift()!, b = list.shift()!;
      const pair = interlockPair(a, b, s);
      if (pair) units.push(pair);
      else units.push(singleUnit(a, s), singleUnit(b, s));
    }
    for (const rest of list) units.push(singleUnit(rest, s));
  }
  return units;
}

/** Cómo van las mangas: en tiras alternadas, de a pares o sueltas. */
type SleeveMode = "tira" | "pares" | "sueltas";

function buildUnits(prints: PrintPiece[], s: ProductionSettings, mode: SleeveMode, usable: number, chainFrac = 1): Unit[] {
  const can180 = s.rotations.includes(180);
  const others = prints.filter((p) => !isSleeve(p) && !(can180 && isLegPiece(p)));
  const units: Unit[] = others.map((p) => singleUnit(p, s));
  // Short: las piernas de cada prenda, encastradas (salvo en "sueltas", que
  // deja al motor probar todo pieza por pieza).
  const legs = prints.filter((p) => can180 && isLegPiece(p));
  units.push(...(mode === "sueltas" ? legs.map((p) => singleUnit(p, s)) : legUnits(legs, s)));

  const sleeves = prints.filter(isSleeve);
  if (mode === "sueltas" || !can180) {
    units.push(...sleeves.map((p) => singleUnit(p, s)));
    return units;
  }
  if (mode === "tira") {
    // Una tira por talle (las mangas de un mismo talle encastran parejo).
    const bySize = new Map<string, PrintPiece[]>();
    for (const p of sleeves) (bySize.get(p.piece.sizeLabel) ?? bySize.set(p.piece.sizeLabel, []).get(p.piece.sizeLabel)!).push(p);
    // Una parte de las mangas va en tiras (filas completas) y el resto suelta,
    // para rellenar los huecos que dejan los cuerpos.
    for (const list of bySize.values()) {
      const k = Math.round(list.length * chainFrac);
      units.push(...sleeveChains(list.slice(0, k), s, usable));
      units.push(...list.slice(k).map((p) => singleUnit(p, s)));
    }
    return units;
  }
  const byGarment = new Map<string, PrintPiece[]>();
  for (const p of sleeves) {
    const k = `${p.garment.orderItemId}|${p.piece.sizeLabel}`;
    (byGarment.get(k) ?? byGarment.set(k, []).get(k)!).push(p);
  }
  for (const list of byGarment.values()) {
    while (list.length >= 2) {
      const a = list.shift()!, b = list.shift()!;
      const pair = interlockPair(a, b, s);
      if (pair && pair.w <= usable) units.push(pair);
      else units.push(singleUnit(a, s), singleUnit(b, s));
    }
    for (const rest of list) units.push(singleUnit(rest, s));
  }
  return units;
}

type Placed = { u: Unit; rot: Rotation; x: number; y: number; polys: Poly[]; boxes: BBox[]; box: BBox };

function overlapsAny(polys: Poly[], boxes: BBox[], box: BBox, placed: Placed[]): boolean {
  for (const p of placed) {
    if (box.maxX <= p.box.minX || box.minX >= p.box.maxX || box.maxY <= p.box.minY || box.minY >= p.box.maxY) continue;
    for (let i = 0; i < polys.length; i++) for (let j = 0; j < p.polys.length; j++) if (polygonsOverlap(polys[i], p.polys[j], boxes[i], p.boxes[j])) return true;
  }
  return false;
}

function centroidY(polys: Poly[]): number {
  let a = 0, cy = 0;
  for (const poly of polys)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const cr = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      a += cr;
      cy += (poly[j].y + poly[i].y) * cr;
    }
  return a ? cy / (3 * a) : 0;
}

function at(u: Unit, rot: Rotation, x: number, y: number) {
  const d = dims(u, rot);
  const polys = u.footprint[rot]!.map((p) => shift(p, x, y));
  const boxes = (u.fpBoxes[rot] ??= u.footprint[rot]!.map(bbox)).map((b) => ({ minX: b.minX + x, maxX: b.maxX + x, minY: b.minY + y, maxY: b.maxY + y }));
  return { polys, boxes, box: { minX: x, minY: y, maxX: x + d.w, maxY: y + d.h } };
}

type Band = { placed: Placed[] };

/**
 * Ubica una unidad en una banda: abajo-izquierda, buscando huecos desde el
 * principio. `floor` = no puede empezar antes de esa Y (para lo que va al
 * final). Devuelve null si no entra en el largo máximo.
 */
function placeInBand(band: Band, u: Unit, usable: number, maxLen: number, floor = 0): Placed | null {
  let chosen: Placed | null = null;
  let chosenG = Infinity;
  for (const rot of u.rots) {
    const d = dims(u, rot);
    if (d.w > usable + 1e-6) continue;
    // Columnas candidatas: bordes, junto a cada pieza ya ubicada y una grilla.
    const xs = new Set<number>([0, usable - d.w]);
    for (const p of band.placed) {
      xs.add(p.box.maxX);
      xs.add(p.box.minX - d.w);
      xs.add(p.box.minX);
    }
    for (let x = 0; x <= usable - d.w; x += 80) xs.add(x);
    const cols = [...new Set([...xs].map((x0) => Math.floor(Math.min(Math.max(0, x0), usable - d.w) * 2) / 2))];
    for (const x of cols) {
      // Alturas candidatas: el piso y debajo de cada pieza que comparte columna
      // (y su parte de arriba, por si hay hueco al costado).
      const ys = new Set<number>([floor]);
      for (const p of band.placed) {
        if (p.box.maxX <= x || p.box.minX >= x + d.w) continue;
        if (p.box.maxY >= floor) ys.add(p.box.maxY);
        if (p.box.minY >= floor) ys.add(p.box.minY);
      }
      const sorted = [...ys].sort((a, b) => a - b);
      for (const y0 of sorted) {
        if (chosen && y0 + d.h >= chosen.box.maxY + 0.5) break; // no puede mejorar
        let cur = at(u, rot, x, y0);
        if (overlapsAny(cur.polys, cur.boxes, cur.box, band.placed)) continue;
        // Subir de a poco mientras la forma real no toque.
        let y = y0;
        for (const step of [20, 5, 1]) {
          while (y - step >= floor) {
            const next = at(u, rot, x, y - step);
            if (overlapsAny(next.polys, next.boxes, next.box, band.placed)) break;
            y -= step;
            cur = next;
          }
        }
        // Lo que termina más arriba; a igualdad, lo que deja el peso más
        // arriba (el lado "con hueco" hacia abajo, para que la próxima pieza
        // encastre: así se alternan las piernas del short, por ejemplo) y
        // después lo más a la izquierda.
        const g = y + (u.cy[rot] ??= centroidY(u.footprint[rot]!));
        if (!chosen || cur.box.maxY < chosen.box.maxY - 0.5 || (cur.box.maxY < chosen.box.maxY + 0.5 && (g < chosenG - 0.5 || (g < chosenG + 0.5 && x < chosen.x)))) {
          chosen = { u, rot, x, y, ...cur };
          chosenG = g;
        }
        break; // primera altura libre en esta columna
      }
    }
  }
  if (!chosen || chosen.box.maxY > maxLen + 1e-6) return null;
  band.placed.push(chosen);
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
    m === "tira" ? [["tira", 1], ["tira", 0.5], ["tira", 0]] : [[m, 1]]);
  for (const [mode, frac] of runs) {
    const units = buildUnits(prints, settings, mode, usable, frac);
    for (const u of units) {
      const p = u.members[0].print.piece;
      if (Math.min(...u.rots.map((r) => dims(u, r).w)) > usable) throw new Error(`La pieza ${p.kind} talle ${p.sizeLabel} no entra en el ancho del rollo`);
      if (Math.min(...u.rots.map((r) => dims(u, r).h)) > maxLen) throw new Error(`La pieza ${p.kind} talle ${p.sizeLabel} es más larga que un tramo`);
    }
    // Se prueban varios órdenes de carga y se queda el que gasta menos rollo.
    for (const order of orders) {
      const sorted = [...units].sort((a, b) => Number(!!a.last) - Number(!!b.last) || order(a, b));
      const layout = nestOrdered(sorted, usable, maxLen, settings);
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
      // Lo que va al final arranca debajo de todo lo de la banda.
      const floor = u.last ? Math.max(0, ...band.placed.map((p) => p.box.maxY)) : 0;
      if (placeInBand(band, u, usable, maxLen, floor)) { ok = true; break; }
    }
    if (!ok) {
      const band: Band = { placed: [] };
      bands.push(band);
      if (!placeInBand(band, u, usable, maxLen)) throw new Error("No se pudo ubicar una pieza en el rollo");
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
        const rotation = addRot(m.baseRot, p.rot);
        // El giro es alrededor del centro de la pieza: la traslación es la
        // diferencia entre el centro ubicado y el centro original.
        const local = shift(m.outline[p.rot]!, p.x + settings.edgeMarginMm, p.y + offsetY);
        const src = bbox(m.print.piece.outline);
        const dst = bbox(local);
        const dx = (dst.minX + dst.maxX) / 2 - (src.minX + src.maxX) / 2;
        const dy = (dst.minY + dst.maxY) / 2 - (src.minY + src.maxY) / 2;
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


