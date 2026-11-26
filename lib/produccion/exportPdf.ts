import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFEmbeddedPage,
  PDFPage,
  PDFFont,
  PDFName,
  PDFRef,
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
  setTextRenderingMode,
  TextRenderingMode,
  setCharacterSpacing,
  setFontAndSize,
  showText,
  beginText,
  endText,
  stroke,
  drawObject,
} from "pdf-lib";
import { apply, bbox, compose, offset, translate } from "./geometry";
import { placementTransform } from "./nesting";
import { embedAsGroup, embedSrgbProfile, markTransparencyGroup } from "./colorProfile";
import { ArtBaker } from "./bakeArt";
import type { MockupLayout } from "./mockup";
import type { TextMeasurer } from "./build";
import type { Affine, BackgroundRule, PlacedText, Poly, PrintPiece, Pt, RollLayout, Segment } from "./types";

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

/** Matriz del texto (x der., y arriba, origen al inicio de la base) a la pieza (mm, Y abajo). */
export function textToPiece(t: Pick<PlacedText, "center" | "heightMm" | "rotation" | "align">, widthMm: number): Affine {
  const r = ((t.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.round(Math.cos(r) * 1e9) / 1e9, sin = Math.round(Math.sin(r) * 1e9) / 1e9;
  const ax = t.align === "inicio" ? 0 : t.align === "fin" ? widthMm : widthMm / 2;
  const h2 = t.heightMm / 2;
  return { a: cos, b: sin, c: sin, d: -cos, e: t.center.x - cos * ax - sin * h2, f: t.center.y - sin * ax + cos * h2 };
}

/** Giro de `deg` grados (horario con Y hacia abajo) alrededor de un punto. */
function rotateAbout(c: { x: number; y: number }, deg: number): Affine {
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: c.x - cos * c.x + sin * c.y, f: c.y - sin * c.x - cos * c.y };
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
  // Fuente entera, sin recortar: el recorte de fontkit falla con algunas
  // fuentes ("value" argument is out of bounds al guardar) y rompe el PDF.
  for (const [name, bytes] of Object.entries(assets.fonts ?? {})) fonts[name] = await doc.embedFont(bytes, { subset: false });

  const bgPages: Record<string, PDFEmbeddedPage> = {};
  for (const [path, bytes] of Object.entries(assets.backgrounds ?? {})) bgPages[path] = await embedAsGroup(doc, bytes);
  const defaultBg = assets.background ? await embedAsGroup(doc, assets.background) : null;
  const elementPages: Record<string, PDFEmbeddedPage> = {};
  for (const [path, bytes] of Object.entries(assets.elements ?? {})) elementPages[path] = await embedAsGroup(doc, bytes);


  const xobjNames = new WeakMap<PDFPage, Map<PDFRef, PDFName>>();
  const refName = (page: PDFPage, ref: PDFRef): PDFName => {
    let m = xobjNames.get(page);
    if (!m) {
      m = new Map();
      xobjNames.set(page, m);
    }
    const hit = m.get(ref);
    if (hit) return hit;
    const n = page.node.newXObject("Arte", ref);
    m.set(ref, n);
    return n;
  };
  const xobjFor = (page: PDFPage) => (p: PDFEmbeddedPage): PDFName => refName(page, p.ref);

  // Corel no escala las máscaras de transparencia: cada arte se escribe con la
  // escala ya aplicada (ver bakeArt.ts) y se dibuja solo movido.
  for (const e of [...Object.values(bgPages), ...Object.values(elementPages), ...(defaultBg ? [defaultBg] : [])]) await e.embed();
  const baker = new ArtBaker(doc);
  const invA = (m: Affine): Affine => {
    const det = m.a * m.d - m.b * m.c;
    const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det;
    return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
  };
  /**
   * Operadores para dibujar `emb` con `art` (espacio del arte → espacio
   * actual), estando en `current` (espacio actual → página). `region` y
   * `hole` (espacio actual) limitan los trazos a la zona visible.
   */
  const artOps = (page: PDFPage, emb: PDFEmbeddedPage, art: Affine, current: Affine, region: Poly | null = null, hole: Poly | null = null) => {
    const F = compose(art, current);
    const toBaked = (q: Pt) => {
      const p = apply(current, q);
      return { x: p.x - F.e, y: p.y - F.f };
    };
    const poly = region ? (offset(region, 8) ?? region).map(toBaked) : null;
    const holeB = hole ? hole.map(toBaked) : null;
    const rk = poly ? JSON.stringify([bbox(poly), poly.length, holeB ? bbox(holeB) : null], (_k, v) => (typeof v === "number" ? Math.round(v * 2) / 2 : v)) : "";
    let ref: PDFRef | null = null;
    try {
      ref = baker.bakeEmbedded(emb, [F.a, F.b, F.c, F.d, 0, 0], poly ? { poly, hole: holeB } : null, rk);
    } catch {
      ref = null;
    }
    if (!ref) return [cm(art), drawObject(xobjFor(page)(emb))];
    // Neto: solo el movimiento (lo único que Corel respeta en las máscaras).
    return [cm(compose(translate(F.e, F.f), invA(current))), drawObject(refName(page, ref))];
  };

  /**
   * Dibuja una pieza: fondo, elementos, indicador y textos. `pieceToPage`
   * puede ser cualquier transformación (en el mockup las mangas van giradas).
   */
  function drawPiece(page: PDFPage, print: PrintPiece, pieceToPage: Affine, opts: { skipTextKinds?: PlacedText["kind"][] } = {}) {
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
      if (clipCanvas && clipCanvas.length > 2 && !print.noBleed) {
        // Sangrado: abajo, una copia del arte de esta pieza agrandada un 6 %
        // desde su centro. Si la pieza de otro talle no coincide exacto con
        // la del diseño (sisa, ruedo), los bordes se completan con el mismo
        // arte en vez de quedar del color de fondo.
        const pb = bbox(outline);
        const c = { x: (pb.minX + pb.maxX) / 2, y: (pb.minY + pb.maxY) / 2 };
        const k = 1.06;
        const grow: Affine = { a: k, b: 0, c: 0, d: k, e: c.x * (1 - k), f: c.y * (1 - k) };
        page.pushOperators(pushGraphicsState(), cm(grow), cm(print.backgroundTransform), ...pathOps(clipCanvas), clip(), endPath());
        // Lo de adentro lo tapa el arte de arriba: alcanza con el borde.
        const cb = bbox(clipCanvas);
        const inset = (k - 1) * Math.max(cb.maxX - cb.minX, cb.maxY - cb.minY) + 10;
        const cur = compose(compose(print.backgroundTransform, grow), pieceToPage);
        page.pushOperators(...artOps(page, bgPage, embeddedToCanvas(bgPage), cur, clipCanvas, offset(clipCanvas, -inset)), popGraphicsState());
      }
      page.pushOperators(pushGraphicsState(), cm(print.backgroundTransform));
      if (clipCanvas && clipCanvas.length > 2) page.pushOperators(...pathOps(clipCanvas), clip(), endPath());
      const visible = clipCanvas && clipCanvas.length > 2 ? clipCanvas : outline.map((q) => apply(invA(print.backgroundTransform), q));
      page.pushOperators(...artOps(page, bgPage, embeddedToCanvas(bgPage), compose(print.backgroundTransform, pieceToPage), visible), popGraphicsState());
    }

    // 2. Elementos anclados (escudo, sponsors), también recortados.
    for (const el of print.elements) {
      const art = el.filePath ? elementPages[el.filePath] : undefined;
      if (!art) continue;
      const s = el.widthMm / (art.width / MM);
      let m = compose(
        compose(embeddedToCanvas(art), { a: s, b: 0, c: 0, d: s, e: 0, f: 0 }),
        translate(el.center.x - el.widthMm / 2, el.center.y - el.heightMm / 2)
      );
      if (el.rotation) m = compose(m, rotateAbout(el.center, el.rotation));
      page.pushOperators(pushGraphicsState(), ...artOps(page, art, m, pieceToPage), popGraphicsState());
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
        page.pushOperators(pushGraphicsState(), cm(pieceToPage), ...artOps(page, art, m, pieceToPage), popGraphicsState());
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
      const spacing = t.style.letterSpacingMm ?? 0;
      const w = font.widthOfTextAtSize(t.text, size) + spacing * Math.max(0, [...t.text].length - 1);
      // Texto (x a la derecha, y arriba, origen al inicio de la línea de base)
      // → pieza: girado `rotation` (horario) alrededor de su punto de anclaje.
      const local = textToPiece(t, w);
      const key = page.node.newFontDictionary(font.name, font.ref);
      const encoded = font.encodeText(t.text);
      page.pushOperators(pushGraphicsState(), cm(compose(local, pieceToPage)), setCharacterSpacing(spacing));
      // Contorno: un trazo del doble del grosor, debajo del relleno (así
      // sobresale hacia afuera lo pedido y no se come la letra).
      if (t.style.stroke && (t.style.strokeMm ?? 0) > 0) {
        const c = hexToRgb(t.style.stroke);
        page.pushOperators(
          setStrokingRgbColor(c.red, c.green, c.blue),
          setLineWidth(2 * (t.style.strokeMm ?? 0)),
          setLineJoin(LineJoinStyle.Round),
          beginText(),
          setFontAndSize(key, size),
          setTextRenderingMode(TextRenderingMode.Outline),
          showText(encoded),
          endText()
        );
      }
      const f = t.style.fill ? hexToRgb(t.style.fill) : BLACK;
      page.pushOperators(
        setFillingRgbColor(f.red, f.green, f.blue),
        beginText(),
        setFontAndSize(key, size),
        setTextRenderingMode(TextRenderingMode.Fill),
        showText(encoded),
        endText(),
        popGraphicsState()
      );
    }

  }

  return { drawPiece, helvetica, fonts, elementPages, xobjFor, artOps };
}

export async function exportRollPdf(layout: RollLayout, background: BackgroundRule, assets: ExportAssets = {}, opts: ExportOptions = {}) {
  const doc = await PDFDocument.create();
  embedSrgbProfile(doc);
  doc.setTitle("Rollo de sublimación");
  doc.setCreator("Duo Indumentaria — Módulo de producción");

  const painter = await createPainter(doc, background, assets);
  const elementPages = painter.elementPages;

  const segments = splitSegments(layout);
  const rollW = layout.settings.rollWidthMm;
  const gap = Math.max(0, opts.sideBySide?.gapMm ?? 0);
  const sheetH = Math.max(1, ...segments.map((s) => s.endMm - s.startMm));
  const sheet = opts.sideBySide ? doc.addPage([(segments.length * rollW + Math.max(0, segments.length - 1) * gap) * MM, sheetH * MM]) : null;
  if (sheet) markTransparencyGroup(sheet);
  for (const [segIndex, seg] of segments.entries()) {
    const lengthMm = seg.endMm - seg.startMm;
    const page = sheet ?? doc.addPage([rollW * MM, lengthMm * MM]);
    markTransparencyGroup(page);
    // Rollo (mm, Y abajo, desde el inicio del tramo) → página (pt, Y arriba).
    // Uno al lado del otro: cada paño corrido a la derecha, todos arriba.
    const rollToPage: Affine = sheet
      ? { a: MM, b: 0, c: 0, d: -MM, e: segIndex * (rollW + gap) * MM, f: (sheetH + seg.startMm) * MM }
      : { a: MM, b: 0, c: 0, d: -MM, e: 0, f: seg.endMm * MM };


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
            page.pushOperators(pushGraphicsState(), ...painter.artOps(page, art, m, rollToPage), popGraphicsState());
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
  embedSrgbProfile(doc);
  doc.setTitle(opts.title ?? "Mockup");
  doc.setCreator("Duo Indumentaria — Módulo de producción");
  const painter = await createPainter(doc, background, assets);
  const page = doc.addPage([mock.widthMm * MM, mock.heightMm * MM]);
  markTransparencyGroup(page);
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

/**
 * Una página por pieza (del tamaño de la pieza + margen), con el arte
 * "sangrado" hacia afuera de la línea: lo usa el mockup fotográfico, que
 * necesita arte un poco más allá del borde para cubrir hombros y costados.
 */
export async function exportPiecePages(prints: PrintPiece[], background: BackgroundRule, assets: ExportAssets = {}, opts: { marginMm?: number; bleed?: number; bleedMm?: number } = {}) {
  const doc = await PDFDocument.create();
  embedSrgbProfile(doc);
  const painter = await createPainter(doc, background, assets);
  const margin = opts.marginMm ?? 60;
  const k = opts.bleed ?? 1.18;
  for (const print of prints) {
    const b = bbox(print.piece.outline);
    const w = b.maxX - b.minX + 2 * margin;
    const h = b.maxY - b.minY + 2 * margin;
    const page = doc.addPage([w * MM, h * MM]);
    markTransparencyGroup(page);
    const toPage: Affine = { a: MM, b: 0, c: 0, d: -MM, e: (margin - b.minX) * MM, f: (h - margin + b.minY) * MM };
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    // Fondo de la página del color de la pieza (fuera de la línea no queda blanco).
    const bgc = hexToRgb(print.bgColor ?? background.color ?? "#FFFFFF");
    page.pushOperators(setFillingRgbColor(bgc.red, bgc.green, bgc.blue), ...pathOps([{ x: 0, y: 0 }, { x: w * MM, y: 0 }, { x: w * MM, y: h * MM }, { x: 0, y: h * MM }]), fill());
    // Debajo: el mismo arte recortado por la línea agrandada 10 mm (sangrado
    // corto: tapa el borde sin traer arte de las piezas vecinas). Más afuera,
    // el color de fondo de la pieza.
    void c;
    void k;
    const grown = offset(print.piece.outline, Math.min(opts.bleedMm ?? 10, margin));
    if (grown) painter.drawPiece(page, { ...print, piece: { ...print.piece, outline: grown } }, toPage, { skipTextKinds: ["talle", "nombre", "numero"] });
    painter.drawPiece(page, print, toPage, { skipTextKinds: ["talle"] });
  }
  return doc.save();
}
