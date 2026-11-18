import { area, bbox } from "./geometry";
import type { PieceKind, Poly } from "./types";

// Importación de moldes desde SVG (Corel: Archivo → Exportar → SVG).
// Corre en el NAVEGADOR: usa el motor SVG del propio navegador para recorrer
// curvas y transformaciones, así que acepta cualquier path que Corel exporte.
//
// Cada forma cerrada grande es una pieza. Las formas chicas (textos, piquetes)
// y las que quedan dentro de otra pieza se descartan.

export type ImportedPiece = { outline: Poly; widthMm: number; heightMm: number; areaMm2: number; guessedKind: PieceKind };

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

function lengthToMm(v: string | null): number | null {
  if (!v) return null;
  const m = v.trim().match(/^([\d.]+)\s*([a-z]*)$/i);
  if (!m) return null;
  const f = UNIT_MM[m[2].toLowerCase()];
  return f ? Number(m[1]) * f : null;
}

export function parseSvgPieces(svgText: string, minAreaMm2 = 2000): { pieces: ImportedPiece[]; notes: string[] } {
  const notes: string[] = [];
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = parsed.documentElement as unknown as SVGSVGElement;
  if (root.nodeName.toLowerCase() !== "svg") throw new Error("El archivo no es un SVG válido");

  // Escala: unidades del viewBox → mm.
  const vb = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const wMm = lengthToMm(root.getAttribute("width"));
  let mmPerUnit = 25.4 / 96;
  if (vb && vb.length === 4 && wMm) mmPerUnit = wMm / vb[2];
  else if (wMm && !vb) mmPerUnit = 25.4 / 96;
  else notes.push("El SVG no declara su tamaño en mm: se asumieron 96 px por pulgada. Revisá las medidas.");

  // Montarlo oculto en la página para poder medir.
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden";
  const live = document.importNode(root, true) as SVGSVGElement;
  host.appendChild(live);
  document.body.appendChild(host);

  try {
    // Separar paths con varios subtrazados (solo si usan M absoluta).
    for (const p of Array.from(live.querySelectorAll("path"))) {
      const d = p.getAttribute("d") ?? "";
      if (/m/.test(d.replace(/^\s*m/i, ""))) continue; // 'm' relativa: no se puede partir sin parsear
      const parts = d.split(/(?=M)/).filter((s) => s.trim());
      if (parts.length < 2) continue;
      for (const part of parts) {
        const q = p.cloneNode() as SVGPathElement;
        q.setAttribute("d", part);
        p.parentNode?.insertBefore(q, p);
      }
      p.remove();
    }

    const shapes = Array.from(live.querySelectorAll("path, polygon, rect, ellipse, circle")) as SVGGeometryElement[];
    const polys: Poly[] = [];
    for (const el of shapes) {
      if (typeof el.getTotalLength !== "function") continue;
      const L = el.getTotalLength();
      if (!L) continue;
      const n = Math.min(4000, Math.max(60, Math.ceil((L * mmPerUnit) / 2))); // un punto cada ~2 mm
      const ctm = el.getCTM();
      const pts: Poly = [];
      for (let i = 0; i < n; i++) {
        let pt = el.getPointAtLength((L * i) / n);
        if (ctm) pt = pt.matrixTransform(ctm);
        pts.push({ x: pt.x * mmPerUnit, y: pt.y * mmPerUnit });
      }
      const end = el.getPointAtLength(L);
      const endT = ctm ? end.matrixTransform(ctm) : end;
      const closed = Math.hypot(endT.x * mmPerUnit - pts[0].x, endT.y * mmPerUnit - pts[0].y) < 1;
      if (!closed) continue;
      if (area(pts) < minAreaMm2) continue;
      polys.push(pts);
    }

    // Descartar formas contenidas en otra (líneas de costura internas, etc.).
    const keep = polys.filter((p, i) => {
      const b = bbox(p);
      return !polys.some((q, j) => {
        if (i === j) return false;
        const c = bbox(q);
        return c.minX <= b.minX && c.minY <= b.minY && c.maxX >= b.maxX && c.maxY >= b.maxY && area(q) > area(p);
      });
    });
    if (keep.length < polys.length) notes.push(`Se ignoraron ${polys.length - keep.length} formas que quedaban dentro de otra pieza.`);

    const pieces: ImportedPiece[] = keep.map((p) => {
      const b = bbox(p);
      const outline = p.map((q) => ({ x: q.x - b.minX, y: q.y - b.minY }));
      return { outline, widthMm: b.maxX - b.minX, heightMm: b.maxY - b.minY, areaMm2: area(p), guessedKind: "otra" as PieceKind };
    });
    guessKinds(pieces);
    return { pieces, notes };
  } finally {
    host.remove();
  }
}

/** Escote más profundo = frente. Las dos piezas más grandes son cuerpo; las dos siguientes, mangas. */
export function guessKinds(pieces: ImportedPiece[]) {
  const byArea = [...pieces].sort((a, b) => b.areaMm2 - a.areaMm2);
  const neckDepth = (p: ImportedPiece) => {
    const cx = p.widthMm / 2;
    const near = p.outline.filter((q) => Math.abs(q.x - cx) < p.widthMm * 0.05);
    return near.length ? Math.min(...near.map((q) => q.y)) : 0;
  };
  const [a, b, s1, s2] = byArea;
  if (a && b) {
    const front = neckDepth(a) >= neckDepth(b) ? a : b;
    front.guessedKind = "frente";
    (front === a ? b : a).guessedKind = "espalda";
  } else if (a) a.guessedKind = "frente";
  if (s1) s1.guessedKind = "manga_izq";
  if (s2) s2.guessedKind = "manga_der";
}
