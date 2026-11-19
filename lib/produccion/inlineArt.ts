import { bbox, pointInPolygon } from "./geometry";
import type { Pt } from "./types";
import { PDFArray, PDFDict, PDFDocument, PDFEmbeddedPage, PDFName, PDFNumber, PDFOperator, PDFPage, PDFRawStream, decodePDFRawStream } from "pdf-lib";

/**
 * Arte de un PDF (diseño, escudo) copiado DENTRO del contenido de la página,
 * en vez de como objeto reutilizable (Form XObject).
 *
 * Por qué: Corel, al abrir un PDF, pierde las transparencias (máscaras de
 * degradé) que están dentro de un objeto reutilizable, y además duplica el
 * diseño entero por cada pieza que lo usa (miles de puntos del semitono por
 * pieza → archivo inmanejable). Acá cada pieza lleva solo los trazos que caen
 * en su zona, con las transparencias al nivel de la página, como las exporta
 * Corel.
 */

type Box = { minX: number; minY: number; maxX: number; maxY: number };
/** Un trazo: sus subtrazos (cada uno con su caja) y el operador que lo pinta. */
type Sub = { text: string; box: Box };
type Item = { text: string; box: Box | null; subs?: Sub[]; clip?: boolean };
type M = [number, number, number, number, number, number];

export type ParsedArt = {
  items: Item[];
  /** Recursos del arte (ya copiados al documento) por categoría → nombres. */
  resources: PDFDict;
  prefix: string;
  /** Matriz y caja del objeto original (espacio de contenido → quien lo dibuja). */
  matrix: M;
  bbox: [number, number, number, number];
};

const mul = (m: M, n: M): M => [
  n[0] * m[0] + n[2] * m[1],
  n[1] * m[0] + n[3] * m[1],
  n[0] * m[2] + n[2] * m[3],
  n[1] * m[2] + n[3] * m[3],
  n[0] * m[4] + n[2] * m[5] + n[4],
  n[1] * m[4] + n[3] * m[5] + n[5],
];
const ID: M = [1, 0, 0, 1, 0, 0];

const TOKEN = /%[^\r\n]*|\((?:\\.|[^\\)])*\)|<<|>>|<[0-9a-fA-F\s]*>|\[|\]|\/[^\s/\[\]()<>{}%]*|[-+]?(?:\d*\.\d+|\d+\.?)|[A-Za-z'"*]+/g;
const PATH_BUILD = new Set(["m", "l", "c", "v", "y", "h", "re"]);
const PAINT = new Set(["f", "F", "f*", "S", "s", "B", "B*", "b", "b*", "n"]);
const CATEGORIES = ["ExtGState", "ColorSpace", "Pattern", "Shading", "XObject", "Font", "Properties"];

let counter = 0;

/** Bytes → texto de 1 byte por carácter (sin pasar por windows-1252, que cambia 0x80–0x9F). */
function bytesToBinaryString(b: Uint8Array) {
  let out = "";
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return out;
}

function numbersOf(obj: unknown, n: number, fallback: number[]): number[] {
  if (obj instanceof PDFArray && obj.size() === n) return obj.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : 0));
  return fallback;
}

/** Lee el contenido del arte embebido y lo separa en trazos con su caja. */
export async function parseEmbeddedArt(doc: PDFDocument, emb: PDFEmbeddedPage): Promise<ParsedArt | null> {
  await emb.embed();
  const xo = doc.context.lookup(emb.ref);
  if (!(xo instanceof PDFRawStream)) return null;
  const src = bytesToBinaryString(decodePDFRawStream(xo).decode());
  const resources = xo.dict.lookup(PDFName.of("Resources"));
  if (!(resources instanceof PDFDict)) return null;
  const prefix = `A${++counter}_`;

  // Nombres de recursos a renombrar (para no chocar con los de la página).
  const names = new Set<string>();
  for (const cat of CATEGORIES) {
    const d = resources.lookup(PDFName.of(cat));
    if (d instanceof PDFDict) for (const k of d.keys()) names.add(k.asString().slice(1));
  }
  const rename = (t: string) => t.replace(/\/([^\s/\[\]()<>{}%]+)/g, (all, n: string) => (names.has(n) ? `/${prefix}${n}` : all));

  const items: Item[] = [];
  const stack: M[] = [];
  let ctm: M = ID;
  let nums: number[] = [];
  let opStart = 0;
  let pathText = "";
  let pathBox: Box | null = null;
  let subs: Sub[] = [];
  let subText = "";
  let subBox: Box | null = null;
  let clipping = false;
  let wText = "";
  const closeSub = () => {
    if (subText && subBox) subs.push({ text: subText, box: subBox });
    subText = "";
    subBox = null;
  };
  let inText = 0;
  let textBuf = "";
  const grow = (b: Box | null, px: number, py: number): Box => {
    if (!b) return { minX: px, minY: py, maxX: px, maxY: py };
    if (px < b.minX) b.minX = px;
    if (px > b.maxX) b.maxX = px;
    if (py < b.minY) b.minY = py;
    if (py > b.maxY) b.maxY = py;
    return b;
  };
  const addPt = (x: number, y: number) => {
    const px = ctm[0] * x + ctm[2] * y + ctm[4];
    const py = ctm[1] * x + ctm[3] * y + ctm[5];
    pathBox = grow(pathBox, px, py);
    subBox = grow(subBox, px, py);
  };

  TOKEN.lastIndex = 0;
  let r: RegExpExecArray | null;
  while ((r = TOKEN.exec(src))) {
    const t = r[0];
    if (t[0] === "%") continue;
    const isOp = /^[A-Za-z'"*]+$/.test(t) && t !== "true" && t !== "false" && t !== "null";
    if (!isOp) {
      if (/^[-+]?(?:\d*\.\d+|\d+\.?)$/.test(t)) nums.push(Number(t));
      continue;
    }
    let text = src.slice(opStart, TOKEN.lastIndex);
    if (t === "BI") {
      // Imagen en línea: hasta EI (los datos son binarios).
      const end = src.slice(TOKEN.lastIndex).search(/\sEI(?=\s|$)/);
      const stop = end < 0 ? src.length : TOKEN.lastIndex + end + 3;
      text = src.slice(opStart, stop);
      TOKEN.lastIndex = stop;
    }
    opStart = TOKEN.lastIndex;
    const a = nums;
    nums = [];

    if (inText || t === "BT") {
      if (t === "BT") inText++;
      textBuf += text;
      if (t === "ET") {
        inText--;
        if (!inText) {
          items.push({ text: rename(textBuf), box: null });
          textBuf = "";
        }
      }
      continue;
    }
    if (PATH_BUILD.has(t)) {
      // Cada "m" o "re" empieza un subtrazo (un punto del semitono, por ejemplo).
      if (t === "m" || t === "re") closeSub();
      pathText += text;
      subText += text;
      if (t === "m" || t === "l") addPt(a[a.length - 2], a[a.length - 1]);
      else if (t === "c") for (let i = 0; i < 3; i++) addPt(a[i * 2], a[i * 2 + 1]);
      else if (t === "v" || t === "y") for (let i = 0; i < 2; i++) addPt(a[i * 2], a[i * 2 + 1]);
      else if (t === "re") {
        const [x, y, w, h] = a.slice(-4);
        addPt(x, y);
        addPt(x + w, y);
        addPt(x + w, y + h);
        addPt(x, y + h);
      }
      continue;
    }
    if (t === "W" || t === "W*") {
      pathText += text;
      wText += text;
      clipping = true;
      continue;
    }
    if (PAINT.has(t)) {
      closeSub();
      if (subs.length < 2 || pathBox === null) {
        // Un recorte se conserva siempre (afecta a lo que sigue).
        items.push({ text: rename(pathText + text), box: clipping || t === "n" ? null : pathBox });
      } else {
        // Trazo o recorte compuesto (p. ej. los miles de puntos del semitono).
        items.push({ text: rename(wText + text), box: clipping ? null : pathBox, clip: clipping, subs: subs.map((x) => ({ text: rename(x.text), box: x.box })) });
      }
      wText = "";
      pathText = "";
      pathBox = null;
      subs = [];
      clipping = false;
      continue;
    }
    if (t === "q") stack.push(ctm);
    else if (t === "Q") ctm = stack.pop() ?? ID;
    else if (t === "cm" && a.length >= 6) ctm = mul(a.slice(-6) as M, ctm);
    items.push({ text: rename(text), box: null });
  }

  const matrix = numbersOf(xo.dict.lookup(PDFName.of("Matrix")), 6, ID) as M;
  const bbox = numbersOf(xo.dict.lookup(PDFName.of("BBox")), 4, [0, 0, emb.width, emb.height]) as [number, number, number, number];
  return { items, resources, prefix, matrix, bbox };
}

const pageArts = new WeakMap<PDFPage, Set<ParsedArt>>();

/** Agrega a la página los recursos del arte (una vez por página). */
function linkResources(page: PDFPage, art: ParsedArt) {
  let set = pageArts.get(page);
  if (!set) {
    set = new Set();
    pageArts.set(page, set);
  }
  if (set.has(art)) return;
  set.add(art);
  const ctx = page.doc.context;
  const pageRes = page.node.Resources() ?? ctx.obj({});
  if (!page.node.Resources()) page.node.set(PDFName.of("Resources"), pageRes);
  for (const cat of CATEGORIES) {
    const from = art.resources.lookup(PDFName.of(cat));
    if (!(from instanceof PDFDict)) continue;
    let to = pageRes.lookup(PDFName.of(cat));
    if (!(to instanceof PDFDict)) {
      to = ctx.obj({});
      pageRes.set(PDFName.of(cat), to);
    }
    for (const [k, v] of from.entries()) (to as PDFDict).set(PDFName.of(art.prefix + k.asString().slice(1)), v);
  }
}

function invert(m: M): M {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** Zona a dibujar (espacio de quien dibuja el arte): adentro de `poly` y, si hay, afuera de `hole`. */
export type ArtRegion = { poly: Pt[]; hole?: Pt[] | null };

const SMALL_PT = 40;

/**
 * Operador que dibuja el arte en la página, como lo haría `Do`, con solo los
 * trazos que caen en la zona. Un subtrazo chico (un punto del semitono) se
 * deja afuera si su centro no cae en `poly` (que ya viene agrandada un
 * margen mayor que el punto) o cae en `hole` (tapado por el arte de arriba).
 * Uno grande se deja afuera solo si su caja no toca la de `poly`.
 */
export function inlineArtOperator(page: PDFPage, art: ParsedArt, region: ArtRegion | null): PDFOperator {
  linkResources(page, art);
  const inv = invert(art.matrix);
  const toContent = (q: Pt): Pt => ({ x: inv[0] * q.x + inv[2] * q.y + inv[4], y: inv[1] * q.x + inv[3] * q.y + inv[5] });
  const poly = region ? region.poly.map(toContent) : null;
  const hole = region?.hole ? region.hole.map(toContent) : null;
  const pb = poly ? bbox(poly) : null;
  const hb = hole ? bbox(hole) : null;
  const boxOut = (b: Box) => !!pb && (b.maxX < pb.minX || b.minX > pb.maxX || b.maxY < pb.minY || b.minY > pb.maxY);
  const drop = (b: Box) => {
    if (!poly || !pb) return false;
    if (boxOut(b)) return true;
    if (b.maxX - b.minX > SMALL_PT || b.maxY - b.minY > SMALL_PT) return false;
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    if (!pointInPolygon(c, poly)) return true;
    if (hole && hb && c.x > hb.minX && c.x < hb.maxX && c.y > hb.minY && c.y < hb.maxY && pointInPolygon(c, hole)) return true;
    return false;
  };

  const parts: string[] = [];
  const [x0, y0, x1, y1] = art.bbox;
  parts.push(`q ${art.matrix.join(" ")} cm ${x0} ${y0} ${x1 - x0} ${y1 - y0} re W n\n`);
  for (const it of art.items) {
    if (it.box && boxOut(it.box)) continue;
    if (it.subs) {
      // Trazo o recorte compuesto (p. ej. todo el semitono): solo los
      // subtrazos de la zona. Uno que no la toca no cambia el relleno adentro.
      let any = false;
      for (const sub of it.subs)
        if (!drop(sub.box)) {
          parts.push(sub.text);
          any = true;
        }
      if (any) parts.push(it.text);
      // Recorte sin nada en la zona: recorta todo (como el original ahí).
      else if (it.clip) parts.push("\n0 0 0 0 re" + it.text);
      continue;
    }
    parts.push(it.text);
  }
  parts.push("\nQ");
  // El "nombre" del operador va tal cual al contenido de la página.
  return PDFOperator.of(parts.join("") as never);
}
