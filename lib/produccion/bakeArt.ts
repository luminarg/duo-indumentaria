import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFEmbeddedPage,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import { bbox, pointInPolygon } from "./geometry";
import type { Pt } from "./types";

/**
 * "Hornea" la escala del arte en sus coordenadas.
 *
 * Corel, al abrir un PDF, no le aplica la escala a las máscaras de
 * transparencia (degradés que se desvanecen): si el arte se dibuja agrandado o
 * achicado, la máscara queda en otro lado y el degradé sale sólido. Solo
 * respeta el movimiento (probado: escala 1 bien; pareja, despareja o adentro
 * del objeto, mal).
 *
 * Por eso cada talle se escribe con las coordenadas ya transformadas —
 * trazos, máscaras y degradés— y se dibuja solo movido. Además, si se da una
 * zona, quedan solo los trazos de esa pieza (el semitono son miles de puntos
 * en un solo trazo, y Corel lo copiaría entero por cada pieza).
 */

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
/** Aplica `m` y después `n` (convención de PDF: punto · m · n). */
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const tx = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const fmt = (n: number) => {
  const s = n.toFixed(3);
  return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
};
const key = (m: M) => m.map((v) => v.toFixed(5)).join(",");

export type BakeRegion = { poly: Pt[]; hole?: Pt[] | null };
type Box = { minX: number; minY: number; maxX: number; maxY: number };

const TOKEN = /%[^\r\n]*|\((?:\\.|[^\\)])*\)|<<|>>|<[0-9a-fA-F\s]*>|\[|\]|\{|\}|\/[^\s/\[\]()<>{}%]*|[-+]?(?:\d*\.\d+|\d+\.?)|[A-Za-z'"*]+/g;
const NUM = /^[-+]?(?:\d*\.\d+|\d+\.?)$/;
const PAINT = new Set(["f", "F", "f*", "S", "s", "B", "B*", "b", "b*", "n"]);
const SMALL_PT = 40;

function bytesToBinaryString(b: Uint8Array) {
  let out = "";
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return out;
}

function nums(obj: unknown): number[] | null {
  if (!(obj instanceof PDFArray)) return null;
  return obj.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : 0));
}

/** Operador con sus operandos (BI: la imagen en línea entera en `raw`). */
type Op = { t: string; ops: string[]; raw?: string };

/** Separa el contenido en operadores (una vez por objeto). */
function tokenize(src: string): Op[] {
  const re = new RegExp(TOKEN.source, "g");
  const out: Op[] = [];
  let operands: string[] = [];
  let r: RegExpExecArray | null;
  while ((r = re.exec(src))) {
    const t = r[0];
    if (t[0] === "%") continue;
    const isOp = /^[A-Za-z'"*]+$/.test(t) && t !== "true" && t !== "false" && t !== "null";
    if (!isOp) {
      operands.push(t);
      continue;
    }
    if (t === "BI") {
      const end = src.slice(re.lastIndex).search(/\sEI(?=\s|$)/);
      const stop = end < 0 ? src.length : re.lastIndex + end + 3;
      out.push({ t, ops: [], raw: src.slice(r.index, stop) });
      re.lastIndex = stop;
      operands = [];
      continue;
    }
    out.push({ t, ops: operands });
    operands = [];
  }
  return out;
}

export class ArtBaker {
  private tokens = new WeakMap<object, Op[]>();
  private n = 0;
  private cache = new Map<string, PDFRef>();
  private ids = new WeakMap<object, number>();
  constructor(private doc: PDFDocument) {}

  private id(o: object) {
    let v = this.ids.get(o);
    if (v === undefined) {
      v = ++this.n;
      this.ids.set(o, v);
    }
    return v;
  }

  /**
   * Objeto (Form XObject) con el arte de `emb` ya transformado por `lin`
   * (espacio de quien lo dibuja → página, sin el movimiento). Se dibuja con
   * escala 1. `region`, en ese mismo espacio, limita los trazos.
   */
  bakeEmbedded(emb: PDFEmbeddedPage, lin: M, region: BakeRegion | null, regionKey = ""): PDFRef | null {
    // `emb` tiene que estar ya embebido (await emb.embed()).
    const xo = this.doc.context.lookup(emb.ref);
    if (!(xo instanceof PDFStream)) return null;
    return this.bakeForm(xo, lin, region, regionKey);
  }

  private bakeForm(form: PDFStream, ctm: M, region: BakeRegion | null, regionKey: string): PDFRef | null {
    const k = `F${this.id(form)}|${key(ctm)}|${regionKey}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    if (!(form instanceof PDFRawStream)) return null;
    const ctx = this.doc.context;
    const dict = form.dict;
    const fm = (nums(dict.lookup(PDFName.of("Matrix"))) ?? ID) as M;
    const init = mul(fm, ctm);
    const res = dict.lookup(PDFName.of("Resources"));
    const resources = res instanceof PDFDict ? res : ctx.obj({});
    let toks = this.tokens.get(form);
    if (!toks) {
      toks = tokenize(bytesToBinaryString(decodePDFRawStream(form).decode()));
      this.tokens.set(form, toks);
    }
    const { content, resources: out } = this.bakeContent(toks, resources, init, region);
    const bb = nums(dict.lookup(PDFName.of("BBox"))) ?? [0, 0, 0, 0];
    const corners = [tx(init, bb[0], bb[1]), tx(init, bb[2], bb[1]), tx(init, bb[2], bb[3]), tx(init, bb[0], bb[3])];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const newDict: Record<string, unknown> = {
      Type: "XObject",
      Subtype: "Form",
      BBox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      Resources: out,
    };
    const group = dict.get(PDFName.of("Group"));
    if (group) newDict.Group = group;
    const ref = ctx.register(ctx.flateStream(content, newDict as never));
    this.cache.set(k, ref);
    return ref;
  }

  private bakeShading(sh: unknown, ctm: M): PDFRef | PDFDict | null {
    const ctx = this.doc.context;
    const d = sh instanceof PDFRef ? ctx.lookup(sh) : sh;
    if (!(d instanceof PDFDict)) return null; // mallas (streams): no soportadas
    const k = `S${this.id(d)}|${key(ctm)}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const copy = ctx.obj({});
    for (const [kk, v] of d.entries()) copy.set(kk, v);
    const type = (d.lookup(PDFName.of("ShadingType")) as PDFNumber | undefined)?.asNumber();
    const coords = nums(d.lookup(PDFName.of("Coords")));
    if (type === 2 && coords) {
      // Axial exacto: las líneas de igual color se transforman; el eje nuevo
      // va perpendicular a ellas.
      const [x0, y0, x1, y1] = coords;
      const p0 = tx(ctm, x0, y0);
      const p1 = tx(ctm, x1, y1);
      const vx = x1 - x0, vy = y1 - y0;
      const dx = ctm[0] * -vy + ctm[2] * vx, dy = ctm[1] * -vy + ctm[3] * vx;
      const ux = -dy, uy = dx;
      const uu = ux * ux + uy * uy || 1;
      const t = ((p1[0] - p0[0]) * ux + (p1[1] - p0[1]) * uy) / uu;
      copy.set(PDFName.of("Coords"), ctx.obj([p0[0], p0[1], p0[0] + ux * t, p0[1] + uy * t]));
    } else if (type === 3 && coords) {
      const s = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
      const a = tx(ctm, coords[0], coords[1]);
      const b = tx(ctm, coords[3], coords[4]);
      copy.set(PDFName.of("Coords"), ctx.obj([a[0], a[1], coords[2] * s, b[0], b[1], coords[5] * s]));
    } else if (type === 1) {
      const m = (nums(d.lookup(PDFName.of("Matrix"))) ?? ID) as M;
      copy.set(PDFName.of("Matrix"), ctx.obj(mul(m, ctm)));
    } else return null;
    copy.delete(PDFName.of("BBox"));
    const ref = ctx.register(copy);
    this.cache.set(k, ref);
    return ref;
  }

  private bakeContent(toks: Op[], resources: PDFDict, init: M, region: BakeRegion | null) {
    const ctx = this.doc.context;
    // Recursos nuevos: copia de los originales + lo horneado.
    const out = ctx.obj({});
    for (const [k, v] of resources.entries()) {
      const vv = resources.lookup(k);
      if (vv instanceof PDFDict) {
        const c = ctx.obj({});
        for (const [k2, v2] of vv.entries()) c.set(k2, v2);
        out.set(k, c);
      } else out.set(k, v);
    }
    const cat = (name: string) => {
      let d = out.lookup(PDFName.of(name));
      if (!(d instanceof PDFDict)) {
        d = ctx.obj({});
        out.set(PDFName.of(name), d);
      }
      return d as PDFDict;
    };
    const srcCat = (name: string) => {
      const d = resources.lookup(PDFName.of(name));
      return d instanceof PDFDict ? d : null;
    };
    const newName = (category: string, value: PDFRef | PDFDict) => {
      const n = `K${++this.n}`;
      cat(category).set(PDFName.of(n), value);
      return n;
    };

    // Zona (opcional) para dejar afuera subtrazos de otras piezas.
    const poly = region?.poly ?? null;
    const hole = region?.hole ?? null;
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
    const stack: M[] = [];
    // Estado del texto (fuente, interlineado…): es parte del estado gráfico y
    // dura entre bloques BT…ET. Como cada bloque se envuelve en q…Q (para
    // ponerle la matriz), se repite el estado vigente al empezar cada uno.
    const TEXT_STATE = new Set(["Tf", "Tc", "Tw", "Tz", "TL", "Tr", "Ts"]);
    let textState: Record<string, string> = {};
    const textStack: Record<string, string>[] = [];
    let ctm = init;
    let subs: { text: string; box: Box }[] = [];
    let sub = "";
    let subBox: Box | null = null;
    let clipOp = "";
    let fillIsPattern = false;
    let strokeIsPattern = false;
    let textBuf: string[] | null = null;
    const closeSub = () => {
      if (sub && subBox) subs.push({ text: sub, box: subBox });
      else if (sub) subs.push({ text: sub, box: { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 } });
      sub = "";
      subBox = null;
    };
    const pt = (x: number, y: number) => {
      const [a, b] = tx(ctm, x, y);
      if (!subBox) subBox = { minX: a, minY: b, maxX: a, maxY: b };
      else {
        if (a < subBox.minX) subBox.minX = a;
        if (a > subBox.maxX) subBox.maxX = a;
        if (b < subBox.minY) subBox.minY = b;
        if (b > subBox.maxY) subBox.maxY = b;
      }
      return `${fmt(a)} ${fmt(b)}`;
    };
    const ctmOp = () => `${ctm.map(fmt).join(" ")} cm`;
    const isPatternCs = (name: string) => {
      if (name === "/Pattern") return true;
      const cs = srcCat("ColorSpace")?.lookup(PDFName.of(name.slice(1)));
      return cs instanceof PDFArray && cs.lookup(0) === PDFName.of("Pattern");
    };

    for (const tok of toks) {
      const t = tok.t;
      const ops = tok.ops;
      if (t === "BI") {
        parts.push(`q ${ctmOp()}\n${tok.raw}\nQ\n`);
        continue;
      }
      const n: number[] = [];
      for (const o of ops) if (NUM.test(o)) n.push(Number(o));
      const raw = (ops.length ? ops.join(" ") + " " : "") + t;

      if (TEXT_STATE.has(t)) textState = { ...textState, [t]: raw };
      if (textBuf) {
        textBuf.push(raw);
        if (t === "ET") {
          parts.push(`q ${ctmOp()}\n${textBuf.join("\n")}\nQ\n`);
          textBuf = null;
        }
        continue;
      }
      switch (t) {
        case "BT":
          textBuf = [raw, ...Object.values(textState)];
          continue;
        case "q":
          stack.push(ctm);
          textStack.push(textState);
          parts.push("q\n");
          continue;
        case "Q":
          ctm = stack.pop() ?? init;
          textState = textStack.pop() ?? textState;
          parts.push("Q\n");
          continue;
        case "cm":
          if (n.length >= 6) ctm = mul(n.slice(-6) as M, ctm);
          continue;
        case "m":
          closeSub();
          sub += `${pt(n[0], n[1])} m\n`;
          continue;
        case "l":
          sub += `${pt(n[0], n[1])} l\n`;
          continue;
        case "c":
          sub += `${pt(n[0], n[1])} ${pt(n[2], n[3])} ${pt(n[4], n[5])} c\n`;
          continue;
        case "v":
          sub += `${pt(n[0], n[1])} ${pt(n[2], n[3])} v\n`;
          continue;
        case "y":
          sub += `${pt(n[0], n[1])} ${pt(n[2], n[3])} y\n`;
          continue;
        case "re": {
          closeSub();
          const [x, y, w, h] = n;
          sub += `${pt(x, y)} m\n${pt(x + w, y)} l\n${pt(x + w, y + h)} l\n${pt(x, y + h)} l\nh\n`;
          closeSub();
          continue;
        }
        case "h":
          sub += "h\n";
          continue;
        case "W":
        case "W*":
          clipOp = t;
          continue;
      }
      if (PAINT.has(t)) {
        closeSub();
        const isClip = !!clipOp;
        const all = subs;
        subs = [];
        let kept = all;
        if (poly && all.length > 1) kept = all.filter((s) => !drop(s.box));
        else if (poly && all.length === 1 && !isClip && boxOut(all[0].box)) kept = [];
        if (kept.length === 0 && !isClip) {
          clipOp = "";
          continue;
        }
        if (kept.length === 0) parts.push("0 0 m\n0 0 l\nh\n");
        for (const s of kept) parts.push(s.text);
        if (isClip) parts.push(clipOp + "\n");
        parts.push(t + "\n");
        clipOp = "";
        continue;
      }
      if (t === "w" && n.length) {
        const s = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
        parts.push(`${fmt(n[0] * s)} w\n`);
        continue;
      }
      if (t === "cs") fillIsPattern = isPatternCs(ops[0] ?? "");
      if (t === "CS") strokeIsPattern = isPatternCs(ops[0] ?? "");
      if ((t === "scn" && fillIsPattern) || (t === "SCN" && strokeIsPattern)) {
        const nm = ops[ops.length - 1];
        const pat = nm?.startsWith("/") ? srcCat("Pattern")?.get(PDFName.of(nm.slice(1))) : undefined;
        const pd = pat instanceof PDFRef ? ctx.lookup(pat) : pat;
        const pdict = pd instanceof PDFStream ? pd.dict : pd instanceof PDFDict ? pd : null;
        if (pdict) {
          // La matriz del patrón es relativa al espacio del objeto: se le suma
          // la transformación inicial (la del contenido, no la actual).
          const pm = (nums(pdict.lookup(PDFName.of("Matrix"))) ?? ID) as M;
          let value: PDFRef | PDFDict;
          if (pd instanceof PDFDict) {
            const c = ctx.obj({});
            for (const [k2, v2] of pd.entries()) c.set(k2, v2);
            c.set(PDFName.of("Matrix"), ctx.obj(mul(pm, init)));
            value = ctx.register(c);
          } else value = pat as PDFRef; // patrón de mosaico: se deja igual
          const nn = newName("Pattern", value);
          parts.push([...ops.slice(0, -1), `/${nn}`, t].join(" ") + "\n");
          continue;
        }
      }
      if (t === "gs" && ops[0]) {
        const gsObj = srcCat("ExtGState")?.lookup(PDFName.of(ops[0].slice(1)));
        const smask = gsObj instanceof PDFDict ? gsObj.lookup(PDFName.of("SMask")) : null;
        if (gsObj instanceof PDFDict && smask instanceof PDFDict) {
          const g = smask.lookup(PDFName.of("G"));
          const baked = g instanceof PDFStream ? this.bakeForm(g, ctm, null, "") : null;
          if (baked) {
            const sm = ctx.obj({});
            for (const [k2, v2] of smask.entries()) sm.set(k2, v2);
            sm.set(PDFName.of("G"), baked);
            const ng = ctx.obj({});
            for (const [k2, v2] of gsObj.entries()) ng.set(k2, v2);
            ng.set(PDFName.of("SMask"), sm);
            const nn = newName("ExtGState", ctx.register(ng));
            parts.push(`/${nn} gs\n`);
            continue;
          }
        }
      }
      if (t === "sh" && ops[0]) {
        const shObj = srcCat("Shading")?.get(PDFName.of(ops[0].slice(1)));
        const baked = shObj ? this.bakeShading(shObj, ctm) : null;
        if (baked) {
          parts.push(`/${newName("Shading", baked)} sh\n`);
          continue;
        }
        parts.push(`q ${ctmOp()}\n${raw}\nQ\n`);
        continue;
      }
      if (t === "Do" && ops[0]) {
        const x = srcCat("XObject")?.lookup(PDFName.of(ops[0].slice(1)));
        const sub2 = x instanceof PDFStream ? x.dict.lookup(PDFName.of("Subtype")) : null;
        if (x instanceof PDFStream && sub2 === PDFName.of("Form")) {
          const baked = this.bakeForm(x, ctm, null, "");
          if (baked) {
            parts.push(`/${newName("XObject", baked)} Do\n`);
            continue;
          }
        }
        // Imagen: con su transformación alrededor.
        parts.push(`q ${ctmOp()}\n${raw}\nQ\n`);
        continue;
      }
      parts.push(raw + "\n");
    }
    return { content: parts.join(""), resources: out };
  }
}

export type { M as BakeMatrix };
