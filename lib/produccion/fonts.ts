import { DEFAULT_FONT } from "./build";
import type { DesignConfig } from "./types";

// Las fuentes subidas viven en Storage como "fuentes/<nombre>--<id>.ttf|otf".
// En el diseño se guarda esa ruta; "Helvetica-Bold" es la fuente por defecto.

export const FONT_FOLDER = "fuentes";

export type FontEntry = { path: string; name: string };

/** Nombre legible a partir de la ruta ("fuentes/Bebas-Neue--1234.ttf" → "Bebas Neue"). */
export function fontNameFromPath(path: string): string {
  if (!path || path === DEFAULT_FONT) return "Helvetica Bold";
  const file = path.split("/").pop() ?? path;
  const base = file.replace(/\.(ttf|otf)$/i, "").split("--")[0];
  return base.replace(/[-_]+/g, " ").trim() || file;
}

/** Nombre de archivo seguro para la fuente (sin espacios raros ni barras). */
export function fontSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\.(ttf|otf)$/i, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fuente"
  );
}

/** Familia CSS con la que se registra la fuente para la vista previa. */
export function cssFamilyFor(path: string): string {
  return "duo-" + path.replace(/[^a-zA-Z0-9]/g, "");
}

/** Fuentes subidas que usa el diseño (sin la de por defecto). */
export function usedFonts(c: DesignConfig): string[] {
  const all = [c.number?.style?.font, c.name?.style?.font, c.sizeTag?.font, c.sizeIndicator?.font];
  return [...new Set(all.filter((f): f is string => !!f && f !== DEFAULT_FONT))];
}
