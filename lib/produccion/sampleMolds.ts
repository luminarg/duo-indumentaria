import type { PatternPiece, Poly } from "./types";

// MOLDES DE PRUEBA — solo para tests y vista previa mientras no está la
// moldería real. Formas simplificadas con medidas aproximadas en mm.
// Cuando lleguen los PDFs de Corel se reemplazan por los importados.

export const SAMPLE_MODEL_ID = "modelo-prueba";

// Ancho de pieza de frente (incluye costura) y largo, por talle.
export const SAMPLE_SIZES: { label: string; w: number; h: number }[] = [
  { label: "6", w: 400, h: 500 },
  { label: "8", w: 420, h: 530 },
  { label: "10", w: 440, h: 560 },
  { label: "12", w: 460, h: 590 },
  { label: "14", w: 480, h: 620 },
  { label: "16", w: 500, h: 650 },
  { label: "XS", w: 500, h: 670 },
  { label: "S", w: 520, h: 690 },
  { label: "M", w: 540, h: 710 },
  { label: "L", w: 560, h: 730 },
  { label: "XL", w: 590, h: 750 },
  { label: "2XL", w: 620, h: 770 },
  { label: "3XL", w: 650, h: 790 },
  { label: "4XL", w: 680, h: 810 },
];

function quad(a: [number, number], c: [number, number], b: [number, number], n = 10): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
    out.push([x, y]);
  }
  return out;
}

/** Pieza de cuerpo en unidades (ancho 10, alto 14), con escote más o menos profundo. */
function bodyUnits(neckDepth: number): [number, number][] {
  const pts: [number, number][] = [[3.4, 0], [0.4, 1.1]];
  pts.push(...quad([0.4, 1.1], [1.1, 2.6], [0, 4.0]));
  pts.push([0.25, 14], [9.75, 14], [10, 4.0]);
  pts.push(...quad([10, 4.0], [8.9, 2.6], [9.6, 1.1]));
  pts.push([6.6, 0]);
  pts.push(...quad([6.6, 0], [5, neckDepth * 2], [3.4, 0]).slice(0, -1));
  return pts;
}

/** Manga corta: copa curva arriba, puño abajo. Unidades: ancho 10, alto 6. */
function sleeveUnits(): [number, number][] {
  const pts: [number, number][] = [[0, 3]];
  pts.push(...quad([0, 3], [2.5, 0], [5, 0]));
  pts.push(...quad([5, 0], [7.5, 0], [10, 3]));
  pts.push([9.3, 6], [0.7, 6]);
  return pts;
}

function scale(units: [number, number][], uw: number, uh: number, w: number, h: number): Poly {
  return units.map(([x, y]) => ({ x: (x * w) / uw, y: (y * h) / uh }));
}

export function sampleMolds(): PatternPiece[] {
  const out: PatternPiece[] = [];
  for (const s of SAMPLE_SIZES) {
    const front = scale(bodyUnits(1.5), 10, 14, s.w, s.h);
    const back = scale(bodyUnits(0.5), 10, 14, s.w, s.h);
    const sw = s.w * 0.72;
    const sh = s.h * 0.3;
    const sleeve = scale(sleeveUnits(), 10, 6, sw, sh);
    out.push(
      { id: `prueba-${s.label}-frente`, modelId: SAMPLE_MODEL_ID, sizeLabel: s.label, kind: "frente", outline: front },
      { id: `prueba-${s.label}-espalda`, modelId: SAMPLE_MODEL_ID, sizeLabel: s.label, kind: "espalda", outline: back },
      { id: `prueba-${s.label}-manga_izq`, modelId: SAMPLE_MODEL_ID, sizeLabel: s.label, kind: "manga_izq", outline: sleeve },
      { id: `prueba-${s.label}-manga_der`, modelId: SAMPLE_MODEL_ID, sizeLabel: s.label, kind: "manga_der", outline: sleeve.map((p) => ({ x: sw - p.x, y: p.y })).reverse() }
    );
  }
  return out;
}
