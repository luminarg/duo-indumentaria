import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { area, bbox } from "./geometry";
import { piecesFromPrimitives, type ImportResult, type Primitives } from "./vectorImport";
import type { Pt } from "./types";

// Importación de moldería desde PDF exportado de Corel.
//
// Se lee el contenido de la página con pdf-lib (ya está en el proyecto) y se
// interpretan solo los operadores de trazado: m l c v y h re, cm, q/Q. Sirve
// en el navegador y en Node.
//
// Corel exporta las líneas con grosor como RELLENOS: cada pieza aparece como
// un anillo (borde exterior + borde interior). En la moldería de Duo esa línea
// es el contorno de 3 mm para el láser, que va POR FUERA de la pieza, así que
// la pieza real es el borde interior del anillo.

const MM_PER_PT = 25.4 / 72;

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  n[0] * m[0] + n[2] * m[1],
  n[1] * m[0] + n[3] * m[1],
  n[0] * m[2] + n[2] * m[3],
  n[1] * m[2] + n[3] * m[3],
  n[0] * m[4] + n[2] * m[5] + n[4],
  n[1] * m[4] + n[3] * m[5] + n[5],
];

function tokenize(src: string): (number | string)[] {
  const out: (number | string)[] = [];
  const re = /%[^\r\n]*|\((?:\\.|[^\\)])*\)|<<|>>|<[0-9a-fA-F\s]*>|\[|\]|\/[^\s/\[\]()<>{}%]+|[-+]?(?:\d*\.\d+|\d+\.?)|[A-Za-z'"*]+/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(src))) {
    const t = r[0];
    if (t[0] === "%") continue;
    const n = Number(t);
    out.push(/^[-+]?(?:\d*\.\d+|\d+\.?)$/.test(t) && Number.isFinite(n) ? n : t);
  }
  return out;
}

export async function pdfPrimitives(bytes: Uint8Array, pageIndex = 0): Promise<{ prim: Primitives; notes: string[] }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(pageIndex);
  const { height } = page.getSize();
  const contents = page.node.Contents();
  const streams = !contents ? [] : contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  let src = "";
  for (const s of streams) {
    if (s instanceof PDFRawStream) src += new TextDecoder("latin1").decode(decodePDFRawStream(s).decode()) + "\n";
  }

  // Página (pt, Y arriba) → mm con Y abajo.
  const toMm = (m: M, x: number, y: number): Pt => {
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    return { x: px * MM_PER_PT, y: (height - py) * MM_PER_PT };
  };

  const prim: Primitives = { subpaths: [], texts: [] };
  const stack: M[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  let path: { points: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const args: number[] = [];
  const steps = 16;
  let fillColor: string | null = null;
  const fillStack: (string | null)[] = [];
  const hex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

  // Al rellenar, todo subtrazado se cierra solo (regla de PDF).
  const flushPath = (paint: boolean, fill = false) => {
    if (cur && cur.length > 1) path.push({ points: cur, closed: false });
    if (fill) for (const sp of path) if (sp.points.length > 2) { sp.closed = true; (sp as { fill?: string | null }).fill = fillColor; }
    if (paint) prim.subpaths.push(...path);
    path = [];
    cur = null;
  };
  const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const x0 = cx, y0 = cy;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
      cur!.push(toMm(ctm, x, y));
    }
    cx = x3; cy = y3;
  };

  for (const tok of tokenize(src)) {
    if (typeof tok === "number") { args.push(tok); continue; }
    const a = args.splice(0);
    switch (tok) {
      case "q": stack.push(ctm); fillStack.push(fillColor); break;
      case "Q": ctm = stack.pop() ?? ctm; fillColor = fillStack.pop() ?? fillColor; break;
      case "rg": if (a.length >= 3) fillColor = hex(a[a.length - 3], a[a.length - 2], a[a.length - 1]); break;
      case "g": if (a.length >= 1) fillColor = hex(a[0], a[0], a[0]); break;
      case "k": if (a.length >= 4) { const [c, m, y, k] = a.slice(-4); fillColor = hex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)); } break;
      // Corel usa espacios de color ICC: "/CS14 cs 0.06 0.17 0.36 scn".
      case "sc":
      case "scn":
        if (a.length === 1) fillColor = hex(a[0], a[0], a[0]);
        else if (a.length === 3) fillColor = hex(a[0], a[1], a[2]);
        else if (a.length === 4) { const [c, m, y, k] = a; fillColor = hex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)); }
        break;
      case "cm": if (a.length >= 6) ctm = mul(ctm, a.slice(-6) as M); break;
      case "m":
        if (cur && cur.length > 1) path.push({ points: cur, closed: false });
        cx = sx = a[0]; cy = sy = a[1];
        cur = [toMm(ctm, cx, cy)];
        break;
      case "l": cur ??= [toMm(ctm, cx, cy)]; cx = a[0]; cy = a[1]; cur.push(toMm(ctm, cx, cy)); break;
      case "c": cur ??= [toMm(ctm, cx, cy)]; curve(a[0], a[1], a[2], a[3], a[4], a[5]); break;
      case "v": cur ??= [toMm(ctm, cx, cy)]; curve(cx, cy, a[0], a[1], a[2], a[3]); break;
      case "y": cur ??= [toMm(ctm, cx, cy)]; curve(a[0], a[1], a[2], a[3], a[2], a[3]); break;
      case "h":
        if (cur && cur.length > 2) path.push({ points: cur, closed: true });
        cur = null; cx = sx; cy = sy;
        break;
      case "re": {
        const [x, y, w, h] = a;
        path.push({ points: [toMm(ctm, x, y), toMm(ctm, x + w, y), toMm(ctm, x + w, y + h), toMm(ctm, x, y + h)], closed: true });
        break;
      }
      case "f": case "F": case "f*": case "B": case "B*": case "b": case "b*": case "S": case "s":
        if (tok === "s" || tok === "b" || tok === "b*") { if (cur && cur.length > 2) path.push({ points: cur, closed: true }); cur = null; }
        flushPath(true, tok !== "S" && tok !== "s");
        break;
      case "n": flushPath(false); break;
      default: break; // texto, colores, imágenes: no interesan para la moldería
    }
  }

  const notes: string[] = [];
  const t = takeInnerOfRings(prim);
  if (t) notes.push(`Las líneas vienen con ${t.toFixed(1)} mm de grosor: se tomó el borde interior como línea de la pieza (el contorno queda por fuera).`);
  return { prim, notes };
}

/**
 * Si una forma cerrada contiene a otra casi igual (un anillo de grosor
 * parejo), se descarta la exterior y queda la interior. Devuelve el grosor
 * medio encontrado, o null si no había anillos.
 */
function takeInnerOfRings(prim: Primitives): number | null {
  const closed = prim.subpaths.filter((s) => s.closed && s.points.length > 2 && area(s.points) > 500);
  const drop = new Set<(typeof closed)[number]>();
  const widths: number[] = [];
  for (const outer of closed) {
    const bo = bbox(outer.points);
    for (const inner of closed) {
      if (inner === outer || drop.has(inner)) continue;
      const bi = bbox(inner.points);
      const d = [bi.minX - bo.minX, bi.minY - bo.minY, bo.maxX - bi.maxX, bo.maxY - bi.maxY];
      if (d.some((v) => v < -0.01)) continue;
      const mean = d.reduce((s, v) => s + v, 0) / 4;
      if (mean <= 0 || mean > 6 || d.some((v) => Math.abs(v - mean) > Math.max(1, mean))) continue;
      const ratio = area(inner.points) / area(outer.points);
      if (ratio < 0.9) continue;
      drop.add(outer);
      widths.push(mean);
      break;
    }
  }
  if (!drop.size) return null;
  prim.subpaths = prim.subpaths.filter((s) => !drop.has(s as (typeof closed)[number]));
  return widths.reduce((s, v) => s + v, 0) / widths.length;
}

export async function importPdf(bytes: Uint8Array): Promise<ImportResult> {
  const { prim, notes } = await pdfPrimitives(bytes);
  const res = piecesFromPrimitives(prim);
  return { ...res, notes: [...notes, ...res.notes] };
}
