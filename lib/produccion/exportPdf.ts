import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFEmbeddedPage,
  PDFPage,
  PDFFont,
  PDFName,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  fill,
  PDFOperator,
  PDFOperatorNames,
  setFillingRgbColor,
  setStrokingRgbColor,
  setLineWidth,
  setLineJoin,
  LineJoinStyle,
  stroke,
  drawObject,
} from "pdf-lib";
import { bbox, compose, translate } from "./geometry";
import { placementTransform } from "./nesting";
import type { MockupLayout } from "./mockup";
import type { TextMeasurer } from "./build";
import type { Affine, BackgroundRule, PlacedText, Poly, PrintPiece, RollLayout, Segment } from "./types";

// Exportación del rollo a PDF vectorial.
//
// - Página = ancho del rollo × largo del tramo, en tamaño real.
// - El fondo y los elementos son PDFs exportados de Corel, embebidos como
//   objetos vectoriales (no se rasterizan) y recortados por la línea de cada pieza.
// - Contorno láser: anillo negro RGB 0,0,0 entre la línea de la pieza y su
//   desplazamiento de 3 mm hacia afuera. Fuera de ese anillo no se imprime nada.
// - Los rollos largos van en tramos (por defecto ≤ 5 m, el máximo cómodo de
//   un PDF): una página por tramo, en orden. No se imprime nada fuera de las
//   piezas (ni rótulos), para no confundir al láser.

const MM = 72 / 25.4; // pt por mm

const fillEvenOdd = () => PDFOperator.of(PDFOperatorNames.FillEvenOdd);

export const BLACK = rgb(0, 0, 0);

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Proporción alto de mayúsculas / tamaño de fuente. */
export function capHeightRatio(font: PDFFont): number {
  // pdf-lib no expone el cap height: se lee del embebedor (estándar o fontkit).
  const emb = (font as unknown as { embedder?: { font?: Record<string, unknown> } }).embedder?.font;
  if (emb) {
    if (typeof emb.CapHeight === "number") return (emb.CapHeight as number) / 1000;
    if (typeof emb.capHeight === "number" && typeof emb.unitsPerEm === "number") {
      return (emb.capHeight as number) / (emb.unitsPerEm as number);
    }
  }
  return 0.72;
}

export function pdfMeasurer(fonts: Record<string, PDFFont>, fallback: PDFFont): TextMeasurer {
  return (text, fontName, capHeightMm) => {
    const f = fonts[fontName] ?? fallback;
    const size = capHeightMm / capHeightRatio(f);
    return f.widthOfTextAtSize(text, size);
  };
}

export type ExportAssets = {
  /** Bytes del PDF de fondo (primera página = lienzo del talle base). */
  background?: Uint8Array | null;
  /** Bytes de cada PDF de elemento, por filePath. */
  elements?: Record<string, Uint8Array>;
  /** Fuentes TTF/OTF por nombre. Helvetica-Bold está siempre. */
  fonts?: Record<string, Uint8Array>;
  /** Fondos por ruta, para rollos con varias prendas o diseños. */
  backgrounds?: Record<string, Uint8Array>;
};

/** Tramos del rollo (cada uno es una página). */
export function splitSegments(layout: RollLayout): Segment[] {
  return layout.segments;
}

function pathOps(poly: Poly) {
  return [moveTo(poly[0].x, poly[0].y), ...poly.slice(1).map((p) => lineTo(p.x, p.y)), closePath()];
}

function cm(m: Affine) {
  return concatTransformationMatrix(m.a, m.b, m.c, m.d, m.e, m.f);
}

/** Espacio de un PDF embebido (pt, Y arriba) → su lienzo en mm (Y abajo). */
function embeddedToCanvas(page: PDFEmbeddedPage): Affine {
  const hMm = page.height / MM;
  return { a: 1 / MM, b: 0, c: 0, d: -1 / MM, e: 0, f: hMm };
}

export type ExportOptions = {
  /**
   * Paños uno al lado del otro en UNA página, separados `gapMm` (así lo arma
   * el taller en Corel). Sin esto, cada paño es una página.
   */
  sideBySide?: { gapMm: number };
};

/**
 * Prepara un documento para dibujar piezas impresas: fuentes, fondos y
 * elementos embebidos una sola vez. Lo usan el rollo y el mockup.
 */
async function createPainter(doc: PDFDocument, background: BackgroundRule, assets: ExportAssets) {
  doc.registerFontkit(fontkit);
  const helvetica = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Record<string, PDFFont> = { "Helvetica-Bold": helvetica };
  for (const [name, bytes] of Object.entries(assets.fonts ?? {})) fonts[name] = await doc.embedFont(bytes, { subset: true });

  const bgPages: Record<string, PDFEmbeddedPage> = {};
  for (const [path, bytes] of Object.entries(assets.backgrounds ?? {})) bgPages[path] = (await doc.embedPdf(bytes, [0]))[0];
  const defaultBg = assets.background ? (await doc.embedPdf(assets.background, [0]))[0] : null;
  const elementPages: Record<string, PDFEmbeddedPage> = {};
  for (const [path, bytes] of Object.entries(assets.elements ?? {})) elementPages[path] = (await doc.embedPdf(bytes, [0]))[0];


  const xobjNames = new WeakMap<PDFPage, Map<PDFEmbeddedPage, PDFName>>();
  const xobjFor = (page: PDFPage) => (p: PDFEmbeddedPage): PDFName => {
    let m = xobjNames.get(page);
    if (!m) {
      m = new Map();
      xobjNames.set(page, m);
    }
    const hit = m.get(p);
    if (hit) return hit;
    const n = page.node.newXObject("Arte", p.ref);
    m.set(p, n);
    return n;
  };

  /**
   * Dibuja una pieza: fondo, elementos, indicador y textos. `pieceToPage`
   * puede ser cualquier transformación (en el mockup las mangas van giradas).
   */
  function drawPiece(page: PDFPage, print: PrintPiece, pieceToPage: Affine, opts: { skipTextKinds?: PlacedText["kind"][] } = {}) {
    const xobj = xobjFor(page);
    const outline = print.piece.outline;
    // 1. Fondo recortado por la línea de la pieza.
    const bgPage = print.bgFile ? (bgPages[print.bgFile] ?? (print.bgFile === background.filePath ? defaultBg : null)) : print.bgFile === undefined ? defaultBg : null;
    const bgColor = print.bgColor !== undefined ? print.bgColor : background.color;
    page.pushOperators(pushGraphicsState(), cm(pieceToPage), ...pathOps(outline), clip(), endPath());
    if (bgColor) {
      const c = hexToRgb(bgColor);
      page.pushOperators(setFillingRgbColor(c.red, c.green, c.blue), ...pathOps(outline), fill());
    }
    const clipCanvas = print.backgroundClip;
    if (bgPage && !(clipCanvas && clipCanvas.length === 0)) {
      // Lienzo del diseño → pieza. En modo "piezas" se recorta además por la
      // pieza del diseño, así no entra el contorno ni el arte de otra pieza.
      if (clipCanvas && clipCanvas.length > 2) {
        // Sangrado: abajo, una copia del arte de esta pieza agrandada un 6 %
        // desde su centro. Si la pieza de otro talle no coincide exacto con
        // la del diseño (sisa, ruedo), los bordes se completan con el mismo
        // arte en vez de quedar del color de fondo.
        const pb = bbox(outline);
        const c = { x: (pb.minX + pb.maxX) / 2, y: (pb.minY + pb.maxY) / 2 };
        const k = 1.06;
        const grow: Affine = { a: k, b: 0, c: 0, d: k, e: c.x * (1 - k), f: c.y * (1 - k) };
        page.pushOperators(pushGraphicsState(), cm(grow), cm(print.backgroundTransform), ...pathOps(clipCanvas), clip(), endPath());
        page.pushOperators(cm(embeddedToCanvas(bgPage)), drawObject(xobj(bgPage)), popGraphicsState());
      }
      page.pushOperators(pushGraphicsState(), cm(print.backgroundTransform));
      if (clipCanvas && clipCanvas.length > 2) page.pushOperators(...pathOps(clipCanvas), clip(), endPath());
      page.pushOperators(cm(embeddedToCanvas(bgPage)), drawObject(xobj(bgPage)), popGraphicsState());
    }

    // 2. Elementos anclados (escudo, sponsors), también recortados.
    for (const el of print.elements) {
      const art = el.filePath ? elementPages[el.filePath] : undefined;
      if (!art) continue;
      const s = el.widthMm / (art.width / MM);
      const m = compose(
        compose(embeddedToCanvas(art), { a: s, b: 0, c: 0, d: s, e: 0, f: 0 }),
        translate(el.center.x - el.widthMm / 2, el.center.y - el.heightMm / 2)
      );
      page.pushOperators(pushGraphicsState(), cm(m), drawObject(xobj(art)), popGraphicsState());
    }
    page.pushOperators(popGraphicsState());

    // 3. Indicador de talle: arte subido, o cuadrado con borde.
    for (const bx of print.boxes ?? []) {
      const art = bx.artPath ? elementPages[bx.artPath] : undefined;
      if (art) {
        const s = bx.widthMm / (art.width / MM);
        const m = compose(
          compose(embeddedToCanvas(art), { a: s, b: 0, c: 0, d: s, e: 0, f: 0 }),
          translate(bx.center.x - bx.widthMm / 2, bx.center.y - bx.heightMm / 2)
        );
        page.pushOperators(pushGraphicsState(), cm(pieceToPage), cm(m), drawObject(xobj(art)), popGraphicsState());
        continue;
      }
      if (!bx.strokeMm) continue;
      const c = hexToRgb(bx.color);
      const hw = bx.widthMm / 2, hh = bx.heightMm / 2, t = bx.strokeMm;
      const { x, y } = bx.center;
      const outerSq = [{ x: x - hw, y: y - hh }, { x: x + hw, y: y - hh }, { x: x + hw, y: y + hh }, { x: x - hw, y: y + hh }];
      const innerSq = [{ x: x - hw + t, y: y - hh + t }, { x: x - hw + t, y: y + hh - t }, { x: x + hw - t, y: y + hh - t }, { x: x + hw - t, y: y - hh + t }];
      page.pushOperators(pushGraphicsState(), cm(pieceToPage), setFillingRgbColor(c.red, c.green, c.blue), ...pathOps(outerSq), ...pathOps(innerSq), fillEvenOdd(), popGraphicsState());
    }

    // 4. Textos: nombre, número, talle. Matriz local con Y hacia arriba,
    //    para que el texto no salga espejado ni dado vuelta.
    for (const t of print.texts) {
      if (opts.skipTextKinds?.includes(t.kind)) continue;
      const font = fonts[t.style.font] ?? helvetica;
      const size = t.heightMm / capHeightRatio(font);
      const w = font.widthOfTextAtSize(t.text, size);
      const baseline = { x: t.center.x - w / 2, y: t.center.y + t.heightMm / 2 };
      // Texto dado vuelta (180°) alrededor de su centro.
      const local: Affine =
        t.rotation === 180
          ? { a: -1, b: 0, c: 0, d: 1, e: 2 * t.center.x - baseline.x, f: 2 * t.center.y - baseline.y }
          : { a: 1, b: 0, c: 0, d: -1, e: baseline.x, f: baseline.y };
      page.pushOperators(pushGraphicsState(), cm(compose(local, pieceToPage)));
      page.drawText(t.text, { x: 0, y: 0, size, font, color: t.style.fill ? hexToRgb(t.style.fill) : BLACK });
      page.pushOperators(popGraphicsState());
    }

  }

  return { drawPiece, helvetica, fonts, elementPages, xobjFor };
}

export async function exportRollPdf(layout: RollLayout, background: BackgroundRule, assets: ExportAssets = {}, opts: ExportOptions = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle("Rollo de sublimación");
  doc.setCreator("Duo Indumentaria — Módulo de producción");

  const painter = await createPainter(doc, background, assets);
  const elementPages = painter.elementPages;

  const segments = splitSegments(layout);
  const rollW = layout.settings.rollWidthMm;
  const gap = Math.max(0, opts.sideBySide?.gapMm ?? 0);
  const sheetH = Math.max(1, ...segments.map((s) => s.endMm - s.startMm));
  const sheet = opts.sideBySide ? doc.addPage([(segments.length * rollW + Math.max(0, segments.length - 1) * gap) * MM, sheetH * MM]) : null;
  for (const [segIndex, seg] of segments.entries()) {
    const lengthMm = seg.endMm - seg.startMm;
    const page = sheet ?? doc.addPage([rollW * MM, lengthMm * MM]);
    // Rollo (mm, Y abajo, desde el inicio del tramo) → página (pt, Y arriba).
    // Uno al lado del otro: cada paño corrido a la derecha, todos arriba.
    const rollToPage: Affine = sheet
      ? { a: MM, b: 0, c: 0, d: -MM, e: segIndex * (rollW + gap) * MM, f: (sheetH + seg.startMm) * MM }
      : { a: MM, b: 0, c: 0, d: -MM, e: 0, f: seg.endMm * MM };

    const xobj = painter.xobjFor(page);

    // Panel de cuellos: tiras a lo ancho, con la línea divisoria entre ellas.
    if (seg.collars) {
      const cp = seg.collars;
      const x0 = layout.settings.edgeMarginMm;
      const w = layout.settings.rollWidthMm - 2 * x0;
      const art = cp.rule.artPath ? elementPages[cp.rule.artPath] : undefined;
      for (let i = 0; i < cp.strips; i++) {
        const top = cp.startMm + i * cp.stripHeightMm;
        const rect = [{ x: x0, y: top }, { x: x0 + w, y: top }, { x: x0 + w, y: top + cp.stripHeightMm }, { x: x0, y: top + cp.stripHeightMm }];
        const c = hexToRgb(cp.color);
        page.pushOperators(pushGraphicsState(), cm(rollToPage), ...pathOps(rect), clip(), endPath(), setFillingRgbColor(c.red, c.green, c.blue), ...pathOps(rect), fill());
        if (art) {
          // El arte se escala al alto de la tira y se repite a lo largo.
          const s = cp.stripHeightMm / (art.height / MM);
          const tileW = (art.width / MM) * s;
          for (let x = x0; x < x0 + w; x += tileW) {
            const m = compose(compose(embeddedToCanvas(art), { a: s, b: 0, c: 0, d: s, e: 0, f: 0 }), translate(x, top));
            page.pushOperators(pushGraphicsState(), cm(m), drawObject(xobj(art)), popGraphicsState());
          }
        }
        page.pushOperators(popGraphicsState());
      }
      // Líneas: entre tiras y en los dos bordes del panel, centradas en el corte.
      const sc = hexToRgb(cp.separatorColor);
      const t = cp.rule.separatorMm;
      if (t > 0) {
        for (let i = 0; i <= cp.strips; i++) {
          const yy = cp.startMm + i * cp.stripHeightMm;
          const y1 = Math.max(cp.startMm, yy - t / 2), y2 = Math.min(cp.endMm, yy + t / 2);
          if (y2 <= y1) continue;
          const line = [{ x: x0, y: y1 }, { x: x0 + w, y: y1 }, { x: x0 + w, y: y2 }, { x: x0, y: y2 }];
          page.pushOperators(pushGraphicsState(), cm(rollToPage), setFillingRgbColor(sc.red, sc.green, sc.blue), ...pathOps(line), fill(), popGraphicsState());
        }
      }
    }

    for (const idx of seg.pieceIndexes) {
      const placed = layout.placed[idx];
      const { print } = placed;
      const outline = print.piece.outline;
      const pieceToRoll = placementTransform(outline, placed.rotation, placed.dx, placed.dy);
      const pieceToPage = compose(pieceToRoll, rollToPage);
      painter.drawPiece(page, print, pieceToPage);

      // 5. Contorno láser: anillo negro entre la línea y +3 mm.
      const outerInPiece = applyInverse(pieceToRoll, placed.outer);
      page.pushOperators(
        pushGraphicsState(),
        cm(pieceToPage),
        setFillingRgbColor(0, 0, 0),
        ...pathOps(outerInPiece),
        ...pathOps(outline),
        fillEvenOdd(),
        popGraphicsState()
      );
    }
  }

  const bytes = await doc.save();
  return { bytes, segments, lengthMm: layout.lengthMm };
}

/** Inversa de una transformación rígida (rotación 0/180 + traslación). */
function applyInverse(m: Affine, poly: Poly): Poly {
  const det = m.a * m.d - m.b * m.c;
  return poly.map((p) => {
    const x = p.x - m.e;
    const y = p.y - m.f;
    return { x: (m.d * x - m.c * y) / det, y: (-m.b * x + m.a * y) / det };
  });
}

/**
 * Mockup plano en PDF (vectorial): frente y espalda con el arte real, sin
 * contorno láser ni talle del ruedo. Fondo gris claro y un filete fino en
 * cada pieza para que se lea la forma.
 */
export async function exportMockupPdf(mock: MockupLayout, background: BackgroundRule, assets: ExportAssets = {}, opts: { title?: string } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? "Mockup");
  doc.setCreator("Duo Indumentaria — Módulo de producción");
  const painter = await createPainter(doc, background, assets);
  const page = doc.addPage([mock.widthMm * MM, mock.heightMm * MM]);
  const toPage: Affine = { a: MM, b: 0, c: 0, d: -MM, e: 0, f: mock.heightMm * MM };
  page.pushOperators(setFillingRgbColor(0.957, 0.957, 0.961), ...pathOps([{ x: 0, y: 0 }, { x: mock.widthMm * MM, y: 0 }, { x: mock.widthMm * MM, y: mock.heightMm * MM }, { x: 0, y: mock.heightMm * MM }]), fill());
  // Sombras primero (todas debajo), así no se ven entre la manga y el cuerpo.
  for (const v of mock.views) {
    for (const it of v.items) {
      const shadow = compose(it.transform, compose(translate(4, 6), toPage));
      page.pushOperators(pushGraphicsState());
      if (it.clip) page.pushOperators(cm(shadow), ...pathOps(it.clip), clip(), endPath(), cm(invertAffine(shadow)));
      page.pushOperators(cm(shadow), setFillingRgbColor(0.82, 0.82, 0.84), ...pathOps(it.print.piece.outline), fill(), popGraphicsState());
    }
  }
  for (const v of mock.views) {
    for (const f of v.fills) {
      const c = hexToRgb(f.color);
      page.pushOperators(pushGraphicsState(), cm(toPage), setFillingRgbColor(c.red, c.green, c.blue), ...pathOps(f.poly), fill(), popGraphicsState());
    }
    for (const it of v.items) {
      const pieceToPage = compose(it.transform, toPage);
      page.pushOperators(pushGraphicsState());
      if (it.clip) page.pushOperators(cm(pieceToPage), ...pathOps(it.clip), clip(), endPath(), cm(invertAffine(pieceToPage)));
      painter.drawPiece(page, it.print, pieceToPage, { skipTextKinds: ["talle"] });
      page.pushOperators(
        pushGraphicsState(),
        cm(pieceToPage),
        setStrokingRgbColor(0.15, 0.16, 0.2),
        setLineWidth(1.6),
        setLineJoin(LineJoinStyle.Round),
        ...pathOps(it.print.piece.outline),
        stroke(),
        popGraphicsState()
      );
      page.pushOperators(popGraphicsState());
    }
  }
  for (const l of mock.labels) {
    const size = 42 * MM; // ~30 mm de alto de mayúsculas
    const w = painter.helvetica.widthOfTextAtSize(l.text, size);
    page.drawText(l.text, { x: l.x * MM - w / 2, y: (mock.heightMm - l.y) * MM, size, font: painter.helvetica, color: rgb(0.32, 0.32, 0.36) });
  }
  return doc.save();
}

function invertAffine(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}
