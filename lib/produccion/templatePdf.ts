import { embedSrgbProfile } from "./colorProfile";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFOperator,
  closePath,
  concatTransformationMatrix,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setFillingRgbColor,
  clip,
  endPath,
} from "pdf-lib";
import { hexToRgb, type Shape } from "./templates";
import type { Poly } from "./types";

const MM = 72 / 25.4;

function pathOps(poly: Poly) {
  return [moveTo(poly[0].x, poly[0].y), ...poly.slice(1).map((p) => lineTo(p.x, p.y)), closePath()];
}

const rgb01 = (hex: string) => {
  const c = hexToRgb(hex);
  return [c.r / 255, c.g / 255, c.b / 255];
};

/**
 * PDF vectorial del lienzo de una plantilla (una página de W × H mm). Es el
 * "fondo continuo" del que después se recortan las piezas. Los degradés van
 * como sombreado real del PDF (sin escalones).
 */
export async function templateToPdf(shapes: Shape[], widthMm: number, heightMm: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  embedSrgbProfile(doc);
  doc.setTitle("Fondo generado por plantilla");
  doc.setCreator("Duo Indumentaria — Módulo de producción");
  const page = doc.addPage([widthMm * MM, heightMm * MM]);
  const ctx = doc.context;
  // Lienzo (mm, Y abajo) → página (pt, Y arriba).
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(MM, 0, 0, -MM, 0, heightMm * MM));

  let shadingDict: PDFDict | null = null;
  let shN = 0;
  for (const s of shapes) {
    if (s.pts.length < 3) continue;
    if (s.kind === "poly") {
      const [r, g, b] = rgb01(s.color);
      page.pushOperators(setFillingRgbColor(r, g, b), ...pathOps(s.pts), fill());
      continue;
    }
    // Degradé lineal: función exponencial (2 colores) o por tramos (3 o más).
    const stops = [...s.stops].sort((a, b) => a.t - b.t);
    const seg = (a: (typeof stops)[number], b: (typeof stops)[number]) =>
      ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: rgb01(a.color), C1: rgb01(b.color), N: 1 });
    const fn =
      stops.length <= 2
        ? seg(stops[0], stops[stops.length - 1])
        : ctx.obj({
            FunctionType: 3,
            Domain: [0, 1],
            Functions: stops.slice(0, -1).map((a, i) => seg(a, stops[i + 1])),
            Bounds: stops.slice(1, -1).map((x) => x.t),
            Encode: stops.slice(0, -1).flatMap(() => [0, 1]),
          });
    const sh = ctx.obj({
      ShadingType: 2,
      ColorSpace: "DeviceRGB",
      Coords: [s.from.x, s.from.y, s.to.x, s.to.y],
      Function: fn,
      Extend: [true, true],
    });
    if (!shadingDict) {
      shadingDict = ctx.obj({});
      page.node.Resources()!.set(PDFName.of("Shading"), shadingDict);
    }
    const name = `Sh${++shN}`;
    shadingDict.set(PDFName.of(name), ctx.register(sh));
    page.pushOperators(pushGraphicsState(), ...pathOps(s.pts), clip(), endPath(), PDFOperator.of("sh" as never, [PDFName.of(name)]), popGraphicsState());
  }
  page.pushOperators(popGraphicsState());
  return doc.save();
}

