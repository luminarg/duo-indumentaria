import { pdfPrimitives } from "./pdfImport";
import { svgPrimitives } from "./vectorImport";
import { customFromFilled, type CustomTemplate } from "./templates";

/**
 * Lee una plantilla dibujada en Corel (SVG o PDF): toma las formas con
 * relleno, en el orden en que se pintan. Los colores marcadores (rojo, verde,
 * azul y amarillo puros) pasan a ser Color 1–4; el resto queda fijo.
 */
export async function templateFromFile(name: string, file: { pdf?: Uint8Array; svg?: string }): Promise<Omit<CustomTemplate, "id">> {
  const prim = file.pdf ? (await pdfPrimitives(file.pdf)).prim : svgPrimitives(file.svg ?? "", { withFill: true }).prim;
  const filled = prim.subpaths.filter((s) => s.closed && s.fill && s.points.length >= 3).map((s) => ({ pts: s.points, fill: s.fill as string }));
  if (!filled.length) throw new Error("El archivo no tiene formas con relleno. Exportalo desde Corel con los colores (no solo contornos).");
  const t = customFromFilled(name, filled);
  const points = t.shapes.reduce((n, s) => n + s.pts.length, 0);
  if (points > 120_000) throw new Error("La plantilla es demasiado pesada (muchos nodos). Simplificala en Corel antes de subirla.");
  return t;
}
