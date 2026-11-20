import { area, bbox } from "./geometry";
import type { BBox, PieceKind, Poly, Pt } from "./types";

// Importación de moldería desde archivos vectoriales de Corel.
//
// Corre igual en el navegador y en Node (sin DOM): el SVG se lee con un
// lector propio de etiquetas y paths, y el PDF llega ya convertido a las
// mismas "primitivas" (subtrazados + textos) desde pdfImport.ts.
//
// Un archivo puede traer UN talle o TODOS: si hay textos con el talle debajo
// de cada grupo de piezas (como en "MOLDE REMERA CLASICA"), cada pieza se
// asigna al texto más cercano que tenga abajo.

export type Primitives = {
  /** Subtrazados ya aplanados, en mm, con Y hacia abajo. */
  subpaths: { points: Poly; closed: boolean; fill?: string | null }[];
  /** Textos sueltos (posible etiqueta de talle), en mm. */
  texts: { text: string; x: number; y: number; sizeMm: number }[];
};

export type ImportedPiece = {
  outline: Poly; // normalizada: bbox arranca en (0,0)
  widthMm: number;
  heightMm: number;
  areaMm2: number;
  /** Posición original en el archivo (para mostrarlo y agrupar). */
  box: BBox;
  kind: PieceKind;
  sizeLabel: string | null;
};

export type ImportResult = { pieces: ImportedPiece[]; sizes: string[]; notes: string[] };

// ---------------------------------------------------------------- SVG

type M = [number, number, number, number, number, number]; // a b c d e f
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const ap = (m: M, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function parseTransform(t: string | undefined): M {
  if (!t) return I;
  let m = I;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(t))) {
    const v = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let n: M = I;
    if (r[1] === "matrix" && v.length === 6) n = v as M;
    else if (r[1] === "translate") n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (r[1] === "scale") n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (r[1] === "rotate") {
      const a = ((v[0] ?? 0) * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      n = [c, s, -s, c, 0, 0];
      if (v.length === 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
    } else if (r[1] === "skewX") n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (r[1] === "skewY") n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(s))) out[r[1].replace(/^(svg|xlink|inkscape|sodipodi):/, "")] = r[3] ?? r[4] ?? "";
  return out;
}

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };
function lengthMm(v?: string): number | null {
  if (!v) return null;
  const m = v.trim().match(/^([\d.]+)\s*([a-z]*)$/i);
  if (!m) return null;
  const f = UNIT_MM[m[2].toLowerCase()];
  return f == null ? null : Number(m[1]) * f;
}

/** Aplana un atributo d de SVG en subtrazados (coordenadas de usuario). */
export function flattenPathD(d: string, curveSteps = 16): { points: Pt[]; closed: boolean }[] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: { points: Pt[]; closed: boolean }[] = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  let lcx = 0, lcy = 0; // último punto de control (para S/T)
  let cur: Pt[] | null = null;
  const num = () => Number(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const start = () => {
    if (cur && cur.length > 1) out.push({ points: cur, closed: false });
    cur = [{ x, y }];
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    for (let k = 1; k <= curveSteps; k++) {
      const t = k / curveSteps, u = 1 - t;
      cur!.push({
        x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      });
    }
    lcx = x2; lcy = y2; x = x3; y = y3;
  };
  while (i < toks.length) {
    if (!isNum()) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        x = ox + num(); y = oy + num(); sx = x; sy = y;
        start();
        cmd = rel ? "l" : "L"; // coordenadas siguientes son líneas
        break;
      }
      case "L": x = ox + num(); y = oy + num(); cur ??= [{ x: sx, y: sy }]; cur.push({ x, y }); lcx = x; lcy = y; break;
      case "H": x = (rel ? x : 0) + num(); cur ??= []; cur.push({ x, y }); lcx = x; lcy = y; break;
      case "V": y = (rel ? y : 0) + num(); cur ??= []; cur.push({ x, y }); lcx = x; lcy = y; break;
      case "C": { cur ??= [{ x, y }]; const a = [num(), num(), num(), num(), num(), num()]; cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]); break; }
      case "S": { cur ??= [{ x, y }]; const a = [num(), num(), num(), num()]; cubic(2 * x - lcx, 2 * y - lcy, ox + a[0], oy + a[1], ox + a[2], oy + a[3]); break; }
      case "Q": {
        cur ??= [{ x, y }];
        const qx = ox + num(), qy = oy + num(), ex = ox + num(), ey = oy + num();
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        lcx = qx; lcy = qy;
        break;
      }
      case "T": {
        cur ??= [{ x, y }];
        const qx = 2 * x - lcx, qy = 2 * y - lcy, ex = ox + num(), ey = oy + num();
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        lcx = qx; lcy = qy;
        break;
      }
      case "A": {
        // Arcos: se aproximan con una recta (Corel casi no los exporta en moldes).
        num(); num(); num(); num(); num();
        x = ox + num(); y = oy + num();
        cur ??= []; cur.push({ x, y });
        break;
      }
      case "Z": {
        if (cur && cur.length > 2) out.push({ points: cur, closed: true });
        cur = null; x = sx; y = sy;
        break;
      }
      default:
        i++; // token desconocido: se saltea
    }
  }
  if (cur && (cur as Pt[]).length > 1) {
    const pts = cur as Pt[];
    const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;
    out.push({ points: pts, closed });
  }
  return out;
}

/** Lee un SVG (de Corel u otro programa) y devuelve primitivas en mm. */
export function svgPrimitives(svg: string, opts: { withFill?: boolean } = {}): { prim: Primitives; notes: string[] } {
  const notes: string[] = [];
  const prim: Primitives = { subpaths: [], texts: [] };
  const stack: M[] = [I];
  // Relleno (solo para plantillas): atributo, style o clase CSS (Corel exporta
  // con clases .fil0 {fill:#…}). Se hereda de los grupos.
  const classFill = new Map<string, string>();
  if (opts.withFill) {
    for (const m of svg.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      const f = m[2].match(/fill:\s*([^;}\s]+)/i)?.[1];
      if (f) classFill.set(m[1], f);
    }
  }
  const fillStack: (string | null)[] = ["#000000"];
  const fillOf = (a: Record<string, string>, inherited: string | null): string | null => {
    let f: string | undefined = a.style?.match(/fill:\s*([^;]+)/i)?.[1]?.trim() ?? a.fill;
    if (!f && a.class) for (const c of a.class.split(/\s+/)) if (classFill.has(c)) f = classFill.get(c);
    if (!f || f === "inherit") return inherited;
    if (f === "none" || f.startsWith("url(")) return null;
    return normalizeColor(f);
  };
  let root: M | null = null;
  let textCtx: { m: M; x: number; y: number; size: number; buf: string } | null = null;

  const tagRe = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let r: RegExpExecArray | null;
  while ((r = tagRe.exec(svg))) {
    if (r[5] !== undefined) {
      if (textCtx) textCtx.buf += r[5];
      continue;
    }
    const closing = r[1] === "/";
    const name = r[2].replace(/^\w+:/, "").toLowerCase();
    const selfClose = r[4] === "/";
    if (closing) {
      if (name === "g" || name === "svg" || name === "a" || name === "symbol") {
        stack.pop();
        if (fillStack.length > 1) fillStack.pop();
      }
      if (name === "text" && textCtx) {
        const t = textCtx.buf.replace(/\s+/g, " ").trim();
        if (t) {
          const p = ap(textCtx.m, textCtx.x, textCtx.y);
          const s = Math.hypot(textCtx.m[0], textCtx.m[1]) * textCtx.size;
          prim.texts.push({ text: t, x: p.x, y: p.y, sizeMm: s });
        }
        textCtx = null;
      }
      continue;
    }
    const a = attrs(r[3]);
    const parent = stack[stack.length - 1];
    let m = mul(parent, parseTransform(a.transform));

    if (name === "svg" && !root) {
      // Escala del documento: viewBox → mm.
      const vb = a.viewBox?.split(/[\s,]+/).map(Number);
      const w = lengthMm(a.width), h = lengthMm(a.height);
      let sx = 25.4 / 96, sy = 25.4 / 96, tx = 0, ty = 0;
      if (vb && vb.length === 4) {
        if (w && h) { sx = w / vb[2]; sy = h / vb[3]; }
        else notes.push("El SVG no declara su tamaño en mm: se asumieron 96 px por pulgada. Revisá las medidas.");
        tx = -vb[0] * sx; ty = -vb[1] * sy;
      } else if (!w) notes.push("El SVG no declara su tamaño: se asumieron 96 px por pulgada. Revisá las medidas.");
      root = [sx, 0, 0, sy, tx, ty];
      m = mul(root, parseTransform(a.transform));
      stack.push(m);
      fillStack.push(fillOf(a, fillStack[fillStack.length - 1]));
      continue;
    }
    if (name === "g" || name === "svg" || name === "a" || name === "symbol") {
      if (!selfClose) {
        stack.push(m);
        fillStack.push(fillOf(a, fillStack[fillStack.length - 1]));
      }
      continue;
    }
    if (name === "defs" || name === "clippath" || name === "mask") {
      // Lo que está en defs no se dibuja: se saltea hasta el cierre.
      if (!selfClose) {
        const end = svg.indexOf(`</${r[2]}>`, tagRe.lastIndex);
        if (end > 0) tagRe.lastIndex = end + r[2].length + 3;
      }
      continue;
    }

    const fill = opts.withFill ? fillOf(a, fillStack[fillStack.length - 1]) : undefined;
    const push = (pts: Pt[], closed: boolean) =>
      prim.subpaths.push(
        opts.withFill
          ? { points: pts.map((p) => ap(m, p.x, p.y)), closed: closed || !!fill, fill }
          : { points: pts.map((p) => ap(m, p.x, p.y)), closed }
      );

    if (name === "path" && a.d) {
      for (const sp of flattenPathD(a.d)) push(sp.points, sp.closed);
    } else if ((name === "polygon" || name === "polyline") && a.points) {
      const v = a.points.split(/[\s,]+/).filter(Boolean).map(Number);
      const pts: Pt[] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push({ x: v[k], y: v[k + 1] });
      push(pts, name === "polygon");
    } else if (name === "rect") {
      const x = Number(a.x ?? 0), y = Number(a.y ?? 0), w = Number(a.width ?? 0), h = Number(a.height ?? 0);
      push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true);
    } else if (name === "text" || name === "tspan") {
      if (name === "text") {
        const size = Number((a["font-size"] ?? a.style?.match(/font-size:\s*([\d.]+)/)?.[1] ?? "0").replace(/[a-z]+$/i, ""));
        textCtx = { m, x: Number(a.x ?? 0), y: Number(a.y ?? 0), size, buf: "" };
        if (selfClose) textCtx = null;
      } else if (textCtx && a["font-size"]) {
        textCtx.size = Number(a["font-size"].replace(/[a-z]+$/i, "")) || textCtx.size;
      }
    }
  }
  return { prim, notes };
}

// ---------------------------------------------------------------- piezas y talles

const SIZE_RE = /^(\d{1,2}|X{0,3}S|M|X{0,4}L|\d?XL|\d?XS)$/i;
const ADULT = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "XXXXL"];
const sizeOrder = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 100 + ADULT.indexOf(s));

type Group = { body: ImportedPiece[]; sleeves: ImportedPiece[]; box: BBox };

function unionBox(list: { box: BBox }[]): BBox {
  return {
    minX: Math.min(...list.map((p) => p.box.minX)),
    minY: Math.min(...list.map((p) => p.box.minY)),
    maxX: Math.max(...list.map((p) => p.box.maxX)),
    maxY: Math.max(...list.map((p) => p.box.maxY)),
  };
}

const similar = (a: ImportedPiece, b: ImportedPiece, tol = 0.04) =>
  Math.abs(a.widthMm - b.widthMm) <= tol * Math.max(a.widthMm, b.widthMm) &&
  Math.abs(a.heightMm - b.heightMm) <= tol * Math.max(a.heightMm, b.heightMm);

/**
 * De primitivas a piezas agrupadas por talle.
 *
 * 1. Piezas = formas cerradas grandes que no están dentro de otra.
 * 2. Etiquetas de talle = textos sueltos ("2", "M", "XXL"…) fuera de las piezas.
 *    Las formas que caen en la franja de una etiqueta (números pasados a
 *    curvas) se descartan.
 * 3. Cuerpos (más altos que anchos) se emparejan de a dos; mangas (más
 *    anchas que altas) también. Cada par de mangas va con el par de cuerpos
 *    del mismo puesto por tamaño: los talles crecen parejo.
 * 4. Cada grupo toma la etiqueta que tiene debajo. Si a unos grupos les falta
 *    y las etiquetas siguen una serie (2, 4, 6, 8…), se deduce el resto.
 */
export function piecesFromPrimitives(prim: Primitives, minAreaMm2 = 2000): ImportResult {
  const notes: string[] = [];
  let polys = prim.subpaths
    .filter((s) => s.closed || Math.hypot(s.points[0].x - s.points[s.points.length - 1].x, s.points[0].y - s.points[s.points.length - 1].y) < 1)
    .map((s) => dedupe(s.points))
    .filter((p) => p.length >= 3 && area(p) >= minAreaMm2);

  const inside = (p: Poly, q: Poly) => {
    const b = bbox(p), c = bbox(q);
    return c.minX <= b.minX + 0.5 && c.minY <= b.minY + 0.5 && c.maxX >= b.maxX - 0.5 && c.maxY >= b.maxY - 0.5 && area(q) > area(p);
  };
  const before = polys.length;
  polys = polys.filter((p, i) => !polys.some((q, j) => i !== j && inside(p, q)));
  const containedDropped = before - polys.length;

  // Etiquetas: textos de talle que no están dentro de una pieza.
  const sizeTexts = prim.texts
    .map((t) => ({ ...t, text: t.text.trim().toUpperCase() }))
    .filter((t) => SIZE_RE.test(t.text) && !polys.some((p) => pointInside(p, { x: t.x, y: t.y })));
  // Los textos chiquitos (marcas de talle dentro o al lado de una pieza) no son rótulos de grupo.
  const biggest = Math.max(0, ...sizeTexts.map((t) => t.sizeMm));
  const labels = sizeTexts.filter((t) => t.sizeMm >= biggest * 0.25);

  // Formas en la franja de una etiqueta = números o letras pasados a curvas.
  const bands = labels.map((l) => ({ min: l.y - l.sizeMm * 1.1, max: l.y + l.sizeMm * 0.35 }));
  const beforeGlyphs = polys.length;
  polys = polys.filter((p) => {
    const b = bbox(p);
    return !bands.some((band) => b.minY >= band.min && b.maxY <= band.max);
  });
  const glyphsDropped = beforeGlyphs - polys.length;
  if (containedDropped + glyphsDropped) {
    notes.push(`Se ignoraron ${containedDropped + glyphsDropped} formas que no son piezas (dentro de otra pieza o textos pasados a curvas).`);
  }

  const pieces: ImportedPiece[] = polys.map((p) => {
    const b = bbox(p);
    return {
      outline: p.map((q) => ({ x: q.x - b.minX, y: q.y - b.minY })),
      widthMm: b.maxX - b.minX,
      heightMm: b.maxY - b.minY,
      areaMm2: area(p),
      box: b,
      kind: "otra" as PieceKind,
      sizeLabel: null,
    };
  });

  // Emparejar cuerpos y mangas.
  // Las piernas de short se emparejan como los cuerpos (una al lado de la otra).
  const bodies = pieces.filter((p) => p.heightMm > p.widthMm || isLegShape(p)).sort((a, b) => a.box.minY - b.box.minY || a.box.minX - b.box.minX);
  const sleeves = pieces.filter((p) => p.heightMm <= p.widthMm && !isLegShape(p)).sort((a, b) => a.box.minX - b.box.minX || a.box.minY - b.box.minY);
  const pairUp = (list: ImportedPiece[], near: (a: ImportedPiece, b: ImportedPiece) => boolean) => {
    const used = new Set<ImportedPiece>();
    const pairs: ImportedPiece[][] = [];
    for (const a of list) {
      if (used.has(a)) continue;
      const b = list.find((x) => x !== a && !used.has(x) && similar(a, x) && near(a, x));
      used.add(a);
      if (b) { used.add(b); pairs.push([a, b]); } else pairs.push([a]);
    }
    return pairs;
  };
  const bodyPairs = pairUp(bodies, (a, b) => {
    const gap = Math.max(a.box.minX, b.box.minX) - Math.min(a.box.maxX, b.box.maxX);
    return gap < 0.15 * a.widthMm && Math.abs(a.box.maxY - b.box.maxY) < 0.1 * a.heightMm;
  });
  const sleevePairs = pairUp(sleeves, (a, b) => {
    const dx = Math.abs(a.box.minX - b.box.minX), dy = Math.abs(a.box.minY - b.box.minY);
    return Math.hypot(dx, dy) < 1.5 * a.heightMm + a.widthMm * 0.2;
  });

  const width = (g: ImportedPiece[]) => Math.max(...g.map((p) => p.widthMm));
  const groups: Group[] = bodyPairs.map((b) => ({ body: b, sleeves: [], box: unionBox(b) }));
  if (sleevePairs.length === groups.length) {
    // Mismo puesto por tamaño.
    const gs = [...groups].sort((a, b) => width(a.body) - width(b.body));
    const ss = [...sleevePairs].sort((a, b) => width(a) - width(b));
    gs.forEach((g, i) => (g.sleeves = ss[i]));
  } else {
    // Al grupo de cuerpos más cercano.
    for (const sp of sleevePairs) {
      const box = unionBox(sp);
      const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
      let best: Group | null = null, bd = Infinity;
      for (const g of groups) {
        const d = Math.hypot(Math.max(g.box.minX - cx, 0, cx - g.box.maxX), Math.max(g.box.minY - cy, 0, cy - g.box.maxY));
        if (d < bd) { bd = d; best = g; }
      }
      if (best) best.sleeves.push(...sp);
      else groups.push({ body: [], sleeves: sp, box });
    }
  }
  for (const g of groups) g.box = unionBox([...g.body, ...g.sleeves]);

  // Etiqueta de cada grupo: el texto de talle debajo, centrado.
  const assigned = new Map<Group, string>();
  for (const g of groups) {
    const cx = (g.box.minX + g.box.maxX) / 2;
    const w = g.box.maxX - g.box.minX;
    let best: { t: string; d: number } | null = null;
    for (const l of labels) {
      const lcx = l.x + (l.text.length * l.sizeMm * 0.6) / 2; // el texto arranca en x
      if (l.y < g.box.maxY - 1 || Math.abs(lcx - cx) > w * 0.75) continue;
      // Tiene que ser el rótulo inmediato: sin otras piezas entre el grupo y el texto.
      const top = l.y - l.sizeMm;
      const blocked = pieces.some(
        (p) => p.box.minY > g.box.maxY + 1 && p.box.maxY < top && p.box.maxX > g.box.minX && p.box.minX < g.box.maxX
      );
      if (blocked) continue;
      const d = l.y - g.box.maxY + Math.abs(lcx - cx);
      if (!best || d < best.d) best = { t: l.text, d };
    }
    if (best) assigned.set(g, best.t);
  }

  // Deducir los que faltan si las etiquetas numéricas siguen una serie.
  const byWidth = [...groups].sort((a, b) => width(a.body.length ? a.body : a.sleeves) - width(b.body.length ? b.body : b.sleeves));
  const deduced: string[] = [];
  for (let i = 0; i < byWidth.length; i++) {
    if (assigned.has(byWidth[i])) continue;
    const prev = byWidth.slice(0, i).reverse().filter((g) => assigned.has(g)).slice(0, 2).map((g) => Number(assigned.get(g)));
    if (prev.length === 2 && prev.every(Number.isFinite) && prev[0] > prev[1]) {
      const next = String(prev[0] + (prev[0] - prev[1]));
      const taken = new Set(assigned.values());
      if (!taken.has(next)) {
        assigned.set(byWidth[i], next);
        deduced.push(next);
      }
    }
  }
  if (deduced.length) notes.push(`Talles deducidos por la serie (no había texto legible): ${deduced.join(", ")}. Revisalos.`);

  for (const g of groups) {
    const label = assigned.get(g) ?? null;
    for (const p of [...g.body, ...g.sleeves]) p.sizeLabel = label;
    guessKinds([...g.body, ...g.sleeves]);
    const legs = g.body.filter(isLegShape).length;
    if (legs) {
      if (legs !== 2 || g.body.length !== 2 || g.sleeves.length) notes.push(`El talle ${label ?? "sin nombre"} tiene ${legs} piernas de short y ${g.body.length + g.sleeves.length - legs} piezas más (se esperaban 2 piernas).`);
    } else if (g.body.length !== 2 || g.sleeves.length !== 2) notes.push(`El talle ${label ?? "sin nombre"} tiene ${g.body.length} cuerpos y ${g.sleeves.length} mangas (se esperaban 2 y 2).`);
  }
  const missing = groups.filter((g) => !assigned.has(g)).length;
  if (missing && groups.length > 1) notes.push(`${missing} grupos de piezas no tienen talle: asignalo a mano.`);

  const sizes = [...new Set([...assigned.values()])].sort((a, b) => sizeOrder(a) - sizeOrder(b));
  return { pieces, sizes, notes };
}

function pointInside(poly: Poly, p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function dedupe(p: Poly): Poly {
  const out: Poly = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - q.x, last.y - q.y) > 0.05) out.push(q);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 0.05) out.pop();
  return out;
}

/**
 * En un grupo de talle: los dos cuerpos (más altos que anchos), el de escote
 * más profundo es el frente. Las mangas: la de más arriba (o más a la
 * izquierda) es la izquierda; como son simétricas da igual.
 */
/**
 * Pierna de short: más ancha que alta pero casi cuadrada (una manga es mucho
 * más ancha que alta) y grande.
 */
function isLegShape(p: ImportedPiece) {
  return p.heightMm <= p.widthMm && p.heightMm >= p.widthMm * 0.7 && p.heightMm > 250;
}

export function guessKinds(list: ImportedPiece[]) {
  // En las piernas, la cintura es más alta del lado del trasero.
  for (const leg of list.filter(isLegShape)) {
    const top = leg.outline.reduce((t, q) => (q.y < t.y ? q : t));
    // Trasero (lo más alto) a la izquierda del dibujo → delantero a la derecha → pierna derecha.
    leg.kind = top.x < leg.widthMm / 2 ? "pierna_der" : "pierna_izq";
  }
  const rest = list.filter((p) => !isLegShape(p));
  const bodies = rest.filter((p) => p.heightMm > p.widthMm).sort((a, b) => b.areaMm2 - a.areaMm2);
  const sleeves = rest.filter((p) => p.heightMm <= p.widthMm).sort((p, q) => p.box.minY - q.box.minY || p.box.minX - q.box.minX);
  const neckDepth = (p: ImportedPiece) => {
    const cx = p.widthMm / 2;
    const near = p.outline.filter((q) => Math.abs(q.x - cx) < p.widthMm * 0.08);
    return near.length ? Math.min(...near.map((q) => q.y)) : 0;
  };
  const [a, b, ...restB] = bodies;
  if (a && b) {
    const front = neckDepth(a) >= neckDepth(b) ? a : b;
    front.kind = "frente";
    (front === a ? b : a).kind = "espalda";
  } else if (a) a.kind = "frente";
  if (sleeves[0]) sleeves[0].kind = "manga_izq";
  if (sleeves[1]) sleeves[1].kind = "manga_der";
  for (const r of [...restB, ...sleeves.slice(2)]) r.kind = "otra";
}

export function importSvg(svgText: string): ImportResult {
  const { prim, notes } = svgPrimitives(svgText);
  const res = piecesFromPrimitives(prim);
  return { ...res, notes: [...notes, ...res.notes] };
}

/** "#abc", "#aabbcc", "rgb(…)" o nombres básicos → "#AABBCC". */
function normalizeColor(f: string): string | null {
  const v = f.trim().toLowerCase();
  if (v.startsWith("#")) {
    const h = v.slice(1);
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
    return /^[0-9a-f]{6}$/.test(full) ? "#" + full.toUpperCase() : null;
  }
  const m = v.match(/rgb\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?/);
  if (m) {
    const pct = v.includes("%");
    const c = [m[1], m[2], m[3]].map((x) => Math.round(pct ? (Number(x) * 255) / 100 : Number(x)));
    return "#" + c.map((x) => Math.min(255, x).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  const named: Record<string, string> = { black: "#000000", white: "#FFFFFF", red: "#FF0000", lime: "#00FF00", green: "#008000", blue: "#0000FF", yellow: "#FFFF00" };
  return named[v] ?? null;
}
