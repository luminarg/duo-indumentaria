import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFEmbeddedPage,
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
  drawObject,
} from "pdf-lib";
import { compose, translate } from "./geometry";
import { placementTransform } from "./nesting";
import type { TextMeasurer } from "./build";
import type { Affine, BackgroundRule, Poly, RollLayout, Segment } from "./types";

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

export async function exportRollPdf(layout: RollLayout, background: BackgroundRule, assets: ExportAssets = {}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Rollo de sublimación");
  doc.setCreator("Duo Indumentaria — Módulo de producción");

  const helvetica = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Record<string, PDFFont> = { "Helvetica-Bold": helvetica };
  for (const [name, bytes] of Object.entries(assets.fonts ?? {})) fonts[name] = await doc.embedFont(bytes, { subset: true });

  const bgPage = assets.background ? (await doc.embedPdf(assets.background, [0]))[0] : null;
  const elementPages: Record<string, PDFEmbeddedPage> = {};
  for (const [path, bytes] of Object.entries(assets.elements ?? {})) elementPages[path] = (await doc.embedPdf(bytes, [0]))[0];

  const segments = splitSegments(layout);
  for (const seg of segments) {
    const lengthMm = seg.endMm - seg.startMm;
    const page = doc.addPage([layout.settings.rollWidthMm * MM, lengthMm * MM]);
    // Rollo (mm, Y abajo, desde el inicio del tramo) → página (pt, Y arriba).
    const rollToPage: Affine = { a: MM, b: 0, c: 0, d: -MM, e: 0, f: seg.endMm * MM };

    const names = new Map<PDFEmbeddedPage, PDFName>();
    const xobj = (p: PDFEmbeddedPage) => {
      let n = names.get(p);
      if (!n) {
        n = page.node.newXObject("Arte", p.ref);
        names.set(p, n);
      }
      return n;
    };

    for (const idx of seg.pieceIndexes) {
      const placed = layout.placed[idx];
      const { print } = placed;
      const outline = print.piece.outline;
      const pieceToRoll = placementTransform(outline, placed.rotation, placed.dx, placed.dy);
      const pieceToPage = compose(pieceToRoll, rollToPage);

      // 1. Fondo recortado por la línea de la pieza.
      page.pushOperators(pushGraphicsState(), cm(pieceToPage), ...pathOps(outline), clip(), endPath());
      if (background.color) {
        const c = hexToRgb(background.color);
        page.pushOperators(setFillingRgbColor(c.red, c.green, c.blue), ...pathOps(outline), fill());
      }
      const clipCanvas = print.backgroundClip;
      if (bgPage && !(clipCanvas && clipCanvas.length === 0)) {
        // Lienzo del diseño → pieza. En modo "piezas" se recorta además por la
        // pieza del diseño, así no entra el contorno ni el arte de otra pieza.
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
        const font = fonts[t.style.font] ?? helvetica;
        const size = t.heightMm / capHeightRatio(font);
        const w = font.widthOfTextAtSize(t.text, size);
        const baseline = { x: t.center.x - w / 2, y: t.center.y + t.heightMm / 2 };
        const local: Affine = { a: 1, b: 0, c: 0, d: -1, e: baseline.x, f: baseline.y };
        page.pushOperators(pushGraphicsState(), cm(compose(local, pieceToPage)));
        page.drawText(t.text, { x: 0, y: 0, size, font, color: t.style.fill ? hexToRgb(t.style.fill) : BLACK });
        page.pushOperators(popGraphicsState());
      }

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
