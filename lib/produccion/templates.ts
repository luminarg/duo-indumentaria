import { assemblyTransforms } from "./assembly";
import { bbox } from "./geometry";
import type { AssemblyRule, PatternPiece, PieceKind, Poly, Pt } from "./types";

// Plantillas de fondo: formas generadas sobre el LIENZO de la prenda armada
// (frente, espalda y mangas en su lugar, como el PowerClip). Cada pieza se
// recorta de ahí, así que las rayas coinciden en las costuras y escalan con
// el talle. Todo en mm, Y hacia abajo, origen arriba a la izquierda del lienzo.

export type Stop = { t: number; color: string };
export type Shape =
  | { kind: "poly"; pts: Poly; color: string }
  | { kind: "grad"; pts: Poly; from: Pt; to: Pt; stops: Stop[] };

export type ParamDef =
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: "check"; default: boolean };

export type ParamValues = Record<string, number | string | boolean>;

/** Dónde quedó cada pieza en el lienzo (para centrar un chevron en el pecho, etc.). */
export type Anchor = { cx: number; top: number; bottom: number; width: number };
export type CanvasInfo = { widthMm: number; heightMm: number; anchors: Partial<Record<PieceKind, Anchor>> };

export type TemplateSpec = {
  /** Id de plantilla del sistema, o "custom:<uuid>" para una subida. */
  id: string;
  params: ParamValues;
  /** colors[0] = fondo (Color 1); el resto, Color 2, 3, 4. */
  colors: string[];
};

/** Plantilla subida (SVG/PDF de Corel): formas normalizadas 0–1 y colores marcadores → lugares. */
export type CustomTemplate = {
  id: string;
  name: string;
  category: string;
  aspect: number; // alto / ancho del dibujo original
  slots: number;
  shapes: { pts: [number, number][]; slot?: number; color?: string }[];
};

export type TemplateDef = {
  id: string;
  name: string;
  category: string;
  slots: number;
  defaultColors: string[];
  params: ParamDef[];
  render: (p: ParamValues, c: string[], canvas: CanvasInfo) => Shape[];
};

// ───────────────────────────────────────────────────────────── utilidades

/** Generador pseudoaleatorio con semilla (mismo diseño en preview y PDF). */
export function rng(seed: number) {
  let a = Math.floor(seed) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (p: ParamValues, k: string, d: number) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : d);
const str = (p: ParamValues, k: string, d: string) => (typeof p[k] === "string" ? (p[k] as string) : d);
const bool = (p: ParamValues, k: string, d: boolean) => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);
const col = (c: string[], i: number) => c[i] ?? c[c.length - 1] ?? "#000000";
const rad = (deg: number) => (deg * Math.PI) / 180;

function rect(x: number, y: number, w: number, h: number): Poly {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function fullCanvas(cv: CanvasInfo): Poly {
  return rect(0, 0, cv.widthMm, cv.heightMm);
}

/** Banda recta de ancho w que pasa por `center`, con las líneas a `angle` grados (0 = vertical). */
function band(center: Pt, angle: number, w: number, length: number): Poly {
  const a = rad(angle);
  const d = { x: Math.sin(a), y: -Math.cos(a) }; // dirección de la raya
  const n = { x: Math.cos(a), y: Math.sin(a) }; // normal (a lo ancho)
  const L = length / 2;
  const h = w / 2;
  return [
    { x: center.x - d.x * L - n.x * h, y: center.y - d.y * L - n.y * h },
    { x: center.x + d.x * L - n.x * h, y: center.y + d.y * L - n.y * h },
    { x: center.x + d.x * L + n.x * h, y: center.y + d.y * L + n.y * h },
    { x: center.x - d.x * L + n.x * h, y: center.y - d.y * L + n.y * h },
  ];
}

function circle(c: Pt, r: number, seg = 14): Poly {
  const out: Poly = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

function front(cv: CanvasInfo): Anchor {
  return cv.anchors.frente ?? { cx: cv.widthMm / 2, top: 0, bottom: cv.heightMm, width: cv.widthMm / 3 };
}

/** Rayas paralelas a `angle`, simétricas respecto del centro del frente. */
function stripes(p: ParamValues, c: string[], cv: CanvasInfo, angle: number): Shape[] {
  const w = Math.max(1, num(p, "ancho", 40));
  const gap = Math.max(0, num(p, "separacion", 40));
  const colors = Math.max(1, Math.min(3, Math.round(num(p, "colores", 1))));
  const f = front(cv);
  const centerY = (f.top + f.bottom) / 2;
  const diag = Math.hypot(cv.widthMm, cv.heightMm) * 2;
  const period = w + gap;
  const n = { x: Math.cos(rad(angle)), y: Math.sin(rad(angle)) };
  const shapes: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
  const count = Math.ceil(diag / period) + 2;
  // "centrada": una raya justo en el centro del pecho; si no, el hueco.
  const phase = bool(p, "centrada", true) ? 0 : period / 2;
  for (let i = -count; i <= count; i++) {
    const off = i * period + phase;
    const center = { x: f.cx + n.x * off, y: centerY + n.y * off };
    shapes.push({ kind: "poly", pts: band(center, angle, w, diag), color: col(c, 1 + (((i % colors) + colors) % colors)) });
  }
  return shapes;
}

// ───────────────────────────────────────────────────────── plantillas base

const C = {
  azul: "#0F2C5C",
  celeste: "#1EA7E1",
  rojo: "#C8102E",
  blanco: "#FFFFFF",
  negro: "#111111",
  amarillo: "#F2C200",
  verde: "#1B7F3B",
  gris: "#8A8F98",
};

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: "liso",
    name: "Liso",
    category: "Básicos",
    slots: 1,
    defaultColors: [C.azul],
    params: [],
    render: (_p, c, cv) => [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }],
  },
  {
    id: "rayas_verticales",
    name: "Rayas verticales",
    category: "Rayas",
    slots: 4,
    defaultColors: [C.blanco, C.rojo, C.azul, C.negro],
    params: [
      { key: "ancho", label: "Ancho de raya", type: "range", min: 5, max: 200, step: 1, default: 45, unit: "mm" },
      { key: "separacion", label: "Separación", type: "range", min: 0, max: 200, step: 1, default: 45, unit: "mm" },
      { key: "colores", label: "Colores de raya", type: "range", min: 1, max: 3, step: 1, default: 1 },
      { key: "centrada", label: "Raya en el centro del pecho", type: "check", default: true },
    ],
    render: (p, c, cv) => stripes(p, c, cv, 0),
  },
  {
    id: "rayas_horizontales",
    name: "Rayas horizontales",
    category: "Rayas",
    slots: 4,
    defaultColors: [C.azul, C.amarillo, C.blanco, C.negro],
    params: [
      { key: "ancho", label: "Ancho de raya", type: "range", min: 5, max: 200, step: 1, default: 60, unit: "mm" },
      { key: "separacion", label: "Separación", type: "range", min: 0, max: 200, step: 1, default: 60, unit: "mm" },
      { key: "colores", label: "Colores de raya", type: "range", min: 1, max: 3, step: 1, default: 1 },
      { key: "centrada", label: "Raya en el centro", type: "check", default: true },
    ],
    render: (p, c, cv) => stripes(p, c, cv, 90),
  },
  {
    id: "rayas_diagonales",
    name: "Rayas diagonales",
    category: "Rayas",
    slots: 4,
    defaultColors: [C.negro, C.rojo, C.blanco, C.gris],
    params: [
      { key: "angulo", label: "Ángulo", type: "range", min: -75, max: 75, step: 1, default: 35, unit: "°" },
      { key: "ancho", label: "Ancho de raya", type: "range", min: 5, max: 200, step: 1, default: 30, unit: "mm" },
      { key: "separacion", label: "Separación", type: "range", min: 0, max: 200, step: 1, default: 60, unit: "mm" },
      { key: "colores", label: "Colores de raya", type: "range", min: 1, max: 3, step: 1, default: 1 },
      { key: "centrada", label: "Raya en el centro", type: "check", default: true },
    ],
    render: (p, c, cv) => stripes(p, c, cv, num(p, "angulo", 35)),
  },
  {
    id: "banda_diagonal",
    name: "Banda diagonal",
    category: "Bandas",
    slots: 3,
    defaultColors: [C.blanco, C.rojo, C.negro],
    params: [
      { key: "angulo", label: "Ángulo", type: "range", min: -75, max: 75, step: 1, default: -40, unit: "°" },
      { key: "ancho", label: "Ancho", type: "range", min: 20, max: 400, step: 1, default: 130, unit: "mm" },
      { key: "altura", label: "Altura (desde el hombro)", type: "range", min: 0, max: 800, step: 5, default: 300, unit: "mm" },
      { key: "filete", label: "Filete (Color 3)", type: "range", min: 0, max: 40, step: 1, default: 8, unit: "mm" },
    ],
    render: (p, c, cv) => {
      const f = front(cv);
      const center = { x: f.cx, y: f.top + num(p, "altura", 300) };
      const ang = num(p, "angulo", -40);
      const w = num(p, "ancho", 130);
      const fil = num(p, "filete", 8);
      const L = Math.hypot(cv.widthMm, cv.heightMm) * 2;
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      if (fil > 0) out.push({ kind: "poly", pts: band(center, ang + 90, w + 2 * fil, L), color: col(c, 2) });
      out.push({ kind: "poly", pts: band(center, ang + 90, w, L), color: col(c, 1) });
      return out;
    },
  },
  {
    id: "franja_pecho",
    name: "Franja en el pecho",
    category: "Bandas",
    slots: 3,
    defaultColors: [C.azul, C.blanco, C.celeste],
    params: [
      { key: "altura", label: "Altura (desde el hombro)", type: "range", min: 0, max: 800, step: 5, default: 220, unit: "mm" },
      { key: "ancho", label: "Ancho", type: "range", min: 10, max: 400, step: 1, default: 110, unit: "mm" },
      { key: "filete", label: "Filete (Color 3)", type: "range", min: 0, max: 40, step: 1, default: 0, unit: "mm" },
    ],
    render: (p, c, cv) => {
      const f = front(cv);
      const y = f.top + num(p, "altura", 220);
      const w = num(p, "ancho", 110);
      const fil = num(p, "filete", 0);
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      if (fil > 0) out.push({ kind: "poly", pts: rect(0, y - fil, cv.widthMm, w + 2 * fil), color: col(c, 2) });
      out.push({ kind: "poly", pts: rect(0, y, cv.widthMm, w), color: col(c, 1) });
      return out;
    },
  },
  {
    id: "chevron",
    name: "Chevron",
    category: "Geométricos",
    slots: 3,
    defaultColors: [C.negro, C.amarillo, C.blanco],
    params: [
      { key: "cantidad", label: "Cantidad de V", type: "range", min: 1, max: 12, step: 1, default: 3 },
      { key: "grosor", label: "Grosor", type: "range", min: 5, max: 150, step: 1, default: 40, unit: "mm" },
      { key: "separacion", label: "Separación", type: "range", min: 0, max: 150, step: 1, default: 30, unit: "mm" },
      { key: "profundidad", label: "Ángulo", type: "range", min: 5, max: 60, step: 1, default: 28, unit: "°" },
      { key: "altura", label: "Altura (desde el hombro)", type: "range", min: 0, max: 800, step: 5, default: 260, unit: "mm" },
      {
        key: "sentido",
        label: "Punta",
        type: "select",
        default: "abajo",
        options: [
          { value: "abajo", label: "Hacia abajo" },
          { value: "arriba", label: "Hacia arriba" },
        ],
      },
      { key: "alternar", label: "Alternar Color 2 y 3", type: "check", default: false },
      { key: "espalda", label: "Repetir en la espalda", type: "check", default: true },
    ],
    render: (p, c, cv) => {
      const n = Math.round(num(p, "cantidad", 3));
      const t = num(p, "grosor", 40);
      const gap = num(p, "separacion", 30);
      const tan = Math.tan(rad(num(p, "profundidad", 28)));
      const down = str(p, "sentido", "abajo") === "abajo";
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      const centers = [front(cv)];
      if (bool(p, "espalda", true) && cv.anchors.espalda) centers.push(cv.anchors.espalda);
      for (const a of centers) {
        const y0 = a.top + num(p, "altura", 260);
        const L = a.width / 2 + 40; // hasta pasar apenas el costado (el recorte corta el resto)
        for (let i = 0; i < n; i++) {
          const dy = i * (t + gap) * (down ? 1 : -1);
          const s = down ? -1 : 1; // los brazos suben (punta abajo) o bajan
          const tip = y0 + dy;
          const pts: Poly = [
            { x: a.cx - L, y: tip + s * L * tan },
            { x: a.cx, y: tip },
            { x: a.cx + L, y: tip + s * L * tan },
            { x: a.cx + L, y: tip + s * L * tan + t },
            { x: a.cx, y: tip + t },
            { x: a.cx - L, y: tip + s * L * tan + t },
          ];
          out.push({ kind: "poly", pts, color: col(c, bool(p, "alternar", false) && i % 2 ? 2 : 1) });
        }
      }
      return out;
    },
  },
  {
    id: "degrade",
    name: "Degradé",
    category: "Degradés",
    slots: 3,
    defaultColors: [C.azul, C.celeste, C.blanco],
    params: [
      { key: "angulo", label: "Dirección", type: "range", min: -90, max: 90, step: 5, default: 0, unit: "°" },
      { key: "tres", label: "Usar Color 3 al final", type: "check", default: false },
      { key: "medio", label: "Punto medio", type: "range", min: 10, max: 90, step: 1, default: 50, unit: "%" },
    ],
    render: (p, c, cv) => {
      const a = rad(num(p, "angulo", 0));
      const d = { x: Math.sin(a), y: Math.cos(a) }; // 0° = de arriba hacia abajo
      const f = front(cv);
      const cy = (f.top + f.bottom) / 2;
      const half = Math.abs(d.x) * cv.widthMm * 0.5 + Math.abs(d.y) * (f.bottom - f.top) * 0.5;
      const from = { x: f.cx - d.x * half, y: cy - d.y * half };
      const to = { x: f.cx + d.x * half, y: cy + d.y * half };
      const m = num(p, "medio", 50) / 100;
      const stops: Stop[] = bool(p, "tres", false)
        ? [
            { t: 0, color: col(c, 0) },
            { t: m, color: col(c, 1) },
            { t: 1, color: col(c, 2) },
          ]
        : [
            { t: 0, color: col(c, 0) },
            { t: 1, color: col(c, 1) },
          ];
      return [{ kind: "grad", pts: fullCanvas(cv), from, to, stops }];
    },
  },
  {
    id: "puntos",
    name: "Puntos degradé (halftone)",
    category: "Degradés",
    slots: 3,
    defaultColors: [C.azul, C.celeste, C.rojo],
    params: [
      { key: "paso", label: "Separación de puntos", type: "range", min: 6, max: 40, step: 1, default: 14, unit: "mm" },
      { key: "max", label: "Punto más grande", type: "range", min: 10, max: 100, step: 1, default: 80, unit: "%" },
      { key: "angulo", label: "Dirección", type: "range", min: -180, max: 180, step: 5, default: 0, unit: "°" },
      { key: "dos", label: "Pasar de Color 2 a Color 3", type: "check", default: false },
      { key: "invertir", label: "Invertir (grandes arriba)", type: "check", default: false },
    ],
    render: (p, c, cv) => {
      const s = num(p, "paso", 14);
      const rmax = (s / 2) * (num(p, "max", 80) / 100);
      const a = rad(num(p, "angulo", 0));
      const d = { x: Math.sin(a), y: Math.cos(a) };
      const f = front(cv);
      const cy = (f.top + f.bottom) / 2;
      const half = Math.abs(d.x) * cv.widthMm * 0.5 + Math.abs(d.y) * (f.bottom - f.top) * 0.5 || 1;
      const two = bool(p, "dos", false);
      const inv = bool(p, "invertir", false);
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      const c1 = hexToRgb(col(c, 1));
      const c2 = hexToRgb(col(c, 2));
      for (let y = s / 2, row = 0; y < cv.heightMm + s; y += s * 0.866, row++) {
        for (let x = (row % 2 ? s / 2 : 0) + s / 2; x < cv.widthMm + s; x += s) {
          let t = ((x - f.cx) * d.x + (y - cy) * d.y) / (2 * half) + 0.5;
          t = Math.min(1, Math.max(0, t));
          if (inv) t = 1 - t;
          const r = rmax * t;
          if (r < 0.4) continue;
          const color = two ? rgbToHex(mix(c1, c2, (x / cv.widthMm) * 1)) : col(c, 1);
          out.push({ kind: "poly", pts: circle({ x, y }, r, r > 3 ? 14 : 8), color });
        }
      }
      return out;
    },
  },
  {
    id: "triangulos",
    name: "Triángulos (low poly)",
    category: "Geométricos",
    slots: 4,
    defaultColors: [C.azul, "#173F7D", C.celeste, "#0A1E40"],
    params: [
      { key: "tam", label: "Tamaño", type: "range", min: 30, max: 300, step: 5, default: 110, unit: "mm" },
      { key: "desorden", label: "Desorden", type: "range", min: 0, max: 45, step: 1, default: 25, unit: "%" },
      { key: "semilla", label: "Variante", type: "range", min: 1, max: 99, step: 1, default: 7 },
    ],
    render: (p, c, cv) => {
      const size = num(p, "tam", 110);
      const jit = (num(p, "desorden", 25) / 100) * size;
      const r = rng(num(p, "semilla", 7));
      const cols = Math.ceil(cv.widthMm / size) + 2;
      const rows = Math.ceil(cv.heightMm / size) + 2;
      const grid: Pt[][] = [];
      for (let j = 0; j <= rows; j++) {
        grid.push([]);
        for (let i = 0; i <= cols; i++) grid[j].push({ x: (i - 1) * size + (r() - 0.5) * 2 * jit, y: (j - 1) * size + (r() - 0.5) * 2 * jit });
      }
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      const palette = c.length ? c : [C.azul];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const a = grid[j][i], b = grid[j][i + 1], d = grid[j + 1][i], e = grid[j + 1][i + 1];
          const flip = r() > 0.5;
          const t1 = flip ? [a, b, e] : [a, b, d];
          const t2 = flip ? [a, e, d] : [b, e, d];
          out.push({ kind: "poly", pts: t1, color: palette[Math.floor(r() * palette.length)] });
          out.push({ kind: "poly", pts: t2, color: palette[Math.floor(r() * palette.length)] });
        }
      return out;
    },
  },
  {
    id: "rombos",
    name: "Rombos (argyle)",
    category: "Geométricos",
    slots: 3,
    defaultColors: [C.blanco, C.celeste, C.azul],
    params: [
      { key: "ancho", label: "Ancho del rombo", type: "range", min: 30, max: 400, step: 5, default: 120, unit: "mm" },
      { key: "alto", label: "Alto del rombo", type: "range", min: 30, max: 500, step: 5, default: 170, unit: "mm" },
      { key: "lineas", label: "Líneas (Color 3)", type: "range", min: 0, max: 15, step: 0.5, default: 2, unit: "mm" },
    ],
    render: (p, c, cv) => {
      const w = num(p, "ancho", 120);
      const h = num(p, "alto", 170);
      const lw = num(p, "lineas", 2);
      const f = front(cv);
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      // Teselado de rombos: filas cada h/2, corridas w/2. Las filas pares van
      // en Color 2 y las impares quedan del fondo: eso es el argyle.
      const rows = Math.ceil(cv.heightMm / (h / 2)) + 2;
      const nx = Math.ceil(cv.widthMm / w) + 3;
      const x0 = f.cx - Math.ceil(f.cx / w + 1) * w;
      for (let j = -2; j < rows; j += 2)
        for (let i = 0; i < nx; i++) {
          const cx = x0 + i * w;
          const cy = j * (h / 2);
          out.push({ kind: "poly", pts: [{ x: cx, y: cy - h / 2 }, { x: cx + w / 2, y: cy }, { x: cx, y: cy + h / 2 }, { x: cx - w / 2, y: cy }], color: col(c, 1) });
        }
      if (lw > 0) {
        // Líneas finas por los lados de los rombos, en las dos direcciones.
        const L = Math.hypot(cv.widthMm, cv.heightMm) * 3;
        const n = Math.hypot(w, h);
        const count = Math.ceil(L / w);
        for (const sx of [1, -1]) {
          const u = { x: (sx * w) / n, y: h / n };
          const v = { x: -u.y, y: u.x };
          for (let k = -count; k <= count; k++) {
            const P = { x: f.cx + k * w, y: -h / 2 };
            out.push({
              kind: "poly",
              pts: [
                { x: P.x - u.x * L - (v.x * lw) / 2, y: P.y - u.y * L - (v.y * lw) / 2 },
                { x: P.x + u.x * L - (v.x * lw) / 2, y: P.y + u.y * L - (v.y * lw) / 2 },
                { x: P.x + u.x * L + (v.x * lw) / 2, y: P.y + u.y * L + (v.y * lw) / 2 },
                { x: P.x - u.x * L + (v.x * lw) / 2, y: P.y - u.y * L + (v.y * lw) / 2 },
              ],
              color: col(c, 2),
            });
          }
        }
      }
      return out;
    },
  },
  {
    id: "hexagonos",
    name: "Hexágonos",
    category: "Geométricos",
    slots: 3,
    defaultColors: [C.negro, "#2B2B2B", C.verde],
    params: [
      { key: "tam", label: "Tamaño", type: "range", min: 10, max: 200, step: 1, default: 45, unit: "mm" },
      { key: "borde", label: "Separación (fondo)", type: "range", min: 0, max: 20, step: 0.5, default: 3, unit: "mm" },
      { key: "acentos", label: "Hexágonos en Color 3", type: "range", min: 0, max: 60, step: 1, default: 12, unit: "%" },
      { key: "semilla", label: "Variante", type: "range", min: 1, max: 99, step: 1, default: 3 },
    ],
    render: (p, c, cv) => {
      const R = num(p, "tam", 45) / 2;
      const gap = num(p, "borde", 3);
      const acc = num(p, "acentos", 12) / 100;
      const r = rng(num(p, "semilla", 3));
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      const w = Math.sqrt(3) * R;
      const rr = Math.max(0.5, R - gap / Math.sqrt(3));
      for (let j = 0, y = 0; y < cv.heightMm + R * 2; j++, y += 1.5 * R)
        for (let x = j % 2 ? w / 2 : 0; x < cv.widthMm + w; x += w) {
          const hex: Poly = [];
          for (let k = 0; k < 6; k++) {
            const a = rad(60 * k - 30);
            hex.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
          }
          out.push({ kind: "poly", pts: hex, color: r() < acc ? col(c, 2) : col(c, 1) });
        }
      return out;
    },
  },
  {
    id: "manchas",
    name: "Manchas (camuflado)",
    category: "Manchas",
    slots: 4,
    defaultColors: ["#3B4A2F", "#6B7F4A", "#A89F6B", "#1E2418"],
    params: [
      { key: "tam", label: "Tamaño de mancha", type: "range", min: 20, max: 300, step: 5, default: 110, unit: "mm" },
      { key: "densidad", label: "Cantidad", type: "range", min: 10, max: 100, step: 5, default: 60, unit: "%" },
      { key: "semilla", label: "Variante", type: "range", min: 1, max: 99, step: 1, default: 11 },
    ],
    render: (p, c, cv) => {
      const size = num(p, "tam", 110);
      const dens = num(p, "densidad", 60) / 100;
      const r = rng(num(p, "semilla", 11));
      const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
      const layers = Math.max(1, Math.min(3, c.length - 1));
      const area = cv.widthMm * cv.heightMm;
      for (let l = 1; l <= layers; l++) {
        const sz = size * (1 - (l - 1) * 0.22);
        const count = Math.round(((area / (sz * sz)) * dens) / layers * 1.6);
        for (let k = 0; k < count; k++) {
          const cx = r() * cv.widthMm;
          const cy = r() * cv.heightMm;
          const base = sz * (0.35 + r() * 0.45);
          const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
          const amp = [0.25 + r() * 0.2, 0.12 + r() * 0.1, 0.08];
          const stretch = 0.6 + r() * 0.9;
          const pts: Poly = [];
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const rr = base * (1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]));
            pts.push({ x: cx + Math.cos(a) * rr * stretch, y: cy + Math.sin(a) * rr });
          }
          out.push({ kind: "poly", pts, color: col(c, l) });
        }
      }
      return out;
    },
  },
];

export function templateDefaults(def: TemplateDef): ParamValues {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

// ─────────────────────────────────────────────────── plantillas subidas

const MARKERS: [number, number, number][] = [
  [255, 0, 0], // rojo → Color 1
  [0, 255, 0], // verde → Color 2
  [0, 0, 255], // azul → Color 3
  [255, 255, 0], // amarillo → Color 4
];

export const CUSTOM_PARAMS: ParamDef[] = [
  {
    key: "ajuste",
    label: "Ajuste",
    type: "select",
    default: "cubrir",
    options: [
      { value: "cubrir", label: "Cubrir toda la prenda (sin deformar)" },
      { value: "estirar", label: "Estirar al tamaño de la prenda" },
      { value: "frente", label: "Del ancho del frente, centrado" },
    ],
  },
  { key: "zoom", label: "Zoom", type: "range", min: 30, max: 300, step: 5, default: 100, unit: "%" },
  { key: "subir", label: "Subir / bajar", type: "range", min: -500, max: 500, step: 5, default: 0, unit: "mm" },
];

/** Marcador → lugar de color (0 = Color 1). null = color literal. */
export function markerSlot(hex: string): number | null {
  const c = hexToRgb(hex);
  for (let i = 0; i < MARKERS.length; i++) {
    const m = MARKERS[i];
    if (Math.abs(c.r - m[0]) + Math.abs(c.g - m[1]) + Math.abs(c.b - m[2]) <= 40) return i;
  }
  return null;
}

/**
 * Convierte formas rellenas de un SVG/PDF (ya leídas) en plantilla: normaliza
 * a 0–1 y mapea los colores marcadores (rojo, verde, azul, amarillo puros) a
 * Color 1–4. Los demás colores quedan fijos.
 */
export function customFromFilled(name: string, filled: { pts: Poly; fill: string }[]): Omit<CustomTemplate, "id"> {
  const all = filled.flatMap((f) => f.pts);
  if (!all.length) throw new Error("El archivo no tiene formas con relleno.");
  const b = bbox(all);
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  let slots = 1;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const shapes = filled
    .filter((f) => f.pts.length >= 3)
    .map((f) => {
      const slot = markerSlot(f.fill);
      if (slot !== null) slots = Math.max(slots, slot + 1);
      const pts = f.pts.map((p) => [r4((p.x - b.minX) / w), r4((p.y - b.minY) / h)] as [number, number]);
      return slot !== null ? { pts, slot } : { pts, color: f.fill };
    });
  return { name, category: "Mis plantillas", aspect: h / w, slots, shapes };
}

function renderCustom(t: CustomTemplate, p: ParamValues, c: string[], cv: CanvasInfo): Shape[] {
  const fit = str(p, "ajuste", "cubrir");
  const zoom = num(p, "zoom", 100) / 100;
  const shiftY = num(p, "subir", 0);
  const f = front(cv);
  let w: number, h: number;
  if (fit === "estirar") {
    w = cv.widthMm;
    h = cv.heightMm;
  } else if (fit === "frente") {
    w = f.width;
    h = f.width * t.aspect;
  } else {
    const s = Math.max(cv.widthMm, cv.heightMm / t.aspect);
    w = s;
    h = s * t.aspect;
  }
  w *= zoom;
  h *= zoom;
  const x0 = (fit === "frente" ? f.cx : cv.widthMm / 2) - w / 2;
  const y0 = (fit === "frente" ? f.top : cv.heightMm / 2 - h / 2) - shiftY;
  const out: Shape[] = [{ kind: "poly", pts: fullCanvas(cv), color: col(c, 0) }];
  for (const s of t.shapes) {
    out.push({
      kind: "poly",
      pts: s.pts.map(([x, y]) => ({ x: x0 + x * w, y: y0 + y * h })),
      color: s.slot !== undefined ? col(c, s.slot) : (s.color ?? "#000000"),
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────── render general

export function findTemplate(id: string, custom: CustomTemplate[] = []): { def?: TemplateDef; custom?: CustomTemplate } {
  if (id.startsWith("custom:")) return { custom: custom.find((t) => `custom:${t.id}` === id) };
  return { def: BUILTIN_TEMPLATES.find((t) => t.id === id) };
}

export function renderTemplate(spec: TemplateSpec, canvas: CanvasInfo, custom: CustomTemplate[] = []): Shape[] {
  const { def, custom: ct } = findTemplate(spec.id, custom);
  if (def) return def.render(spec.params, spec.colors, canvas);
  if (ct) return renderCustom(ct, spec.params, spec.colors, canvas);
  return [{ kind: "poly", pts: fullCanvas(canvas), color: spec.colors[0] ?? "#FFFFFF" }];
}

/**
 * Lienzo para el talle base: la prenda armada con margen. El borde inferior,
 * al centro, es el centro del frente sobre la línea de base (como espera
 * backgroundTransform).
 */
export function canvasForPieces(basePieces: PatternPiece[], assembly: AssemblyRule[], marginMm = 30): CanvasInfo {
  if (!basePieces.length) return { widthMm: 2000, heightMm: 900, anchors: {} };
  const t = assemblyTransforms(basePieces, assembly, 1);
  const placed = basePieces.map((p) => {
    const m = t.get(p.id) ?? { e: 0, f: 0 };
    const b = bbox(p.outline);
    return { kind: p.kind, minX: b.minX + m.e, maxX: b.maxX + m.e, minY: b.minY + m.f, maxY: b.maxY + m.f };
  });
  const minX = Math.min(...placed.map((p) => p.minX));
  const maxX = Math.max(...placed.map((p) => p.maxX));
  const minY = Math.min(...placed.map((p) => p.minY));
  const W = 2 * Math.max(Math.abs(minX), Math.abs(maxX)) + 2 * marginMm;
  const H = Math.max(10, -minY) + marginMm;
  const anchors: CanvasInfo["anchors"] = {};
  for (const p of placed) {
    if (anchors[p.kind]) continue;
    anchors[p.kind] = { cx: (p.minX + p.maxX) / 2 + W / 2, top: p.minY + H, bottom: p.maxY + H, width: p.maxX - p.minX };
  }
  return { widthMm: Math.round(W * 10) / 10, heightMm: Math.round(H * 10) / 10, anchors };
}

// ───────────────────────────────────────────────────────── colores

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHex(c: { r: number; g: number; b: number }) {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}
function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  const k = Math.min(1, Math.max(0, t));
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}
