import { assemblyTransforms, backgroundTransform, sizeScale } from "./assembly";
import { area, areaOutside, bbox, compose, intersectionArea, offset, rectPoly, spanAtY, translate } from "./geometry";
import { baselineY, gridUnit, normalizeSize, placeElement, safeZoneOverflow, shoulderTop, sizeGroupOf, xFromWearerSide, yFromShoulderTop } from "./rules";
import type {
  Affine,
  AssemblyRule,
  DesignConfig,
  GarmentRequest,
  PatternPiece,
  PlacedElement,
  PlacedText,
  PrintPiece,
  PieceKind,
  Poly,
  TextStyle,
  Warning,
} from "./types";

/** Ancho en mm de un texto con alto de mayúsculas `capHeightMm`. */
export const DEFAULT_FONT = "Helvetica-Bold";

export type TextMeasurer = (text: string, font: string, capHeightMm: number) => number;

/** Medidor aproximado (0,62 × alto por carácter) para pruebas y vista previa sin fuentes. */
export const approxMeasurer: TextMeasurer = (text, _font, h) => text.length * h * 0.62;

/** Ancho disponible para un texto centrado a la altura y, dentro de la zona segura. */
function availableWidth(piece: PatternPiece, y: number, centerX: number, marginMm: number): number {
  const inner = offset(piece.outline, -marginMm);
  const span = inner ? spanAtY(inner, y) : null;
  if (!span) return 0;
  // Centrado en centerX: el ancho lo limita el lado más cercano.
  return 2 * Math.max(0, Math.min(centerX - span[0], span[1] - centerX));
}

function fitText(
  text: string,
  style: TextStyle,
  heightMm: number,
  maxWidth: number,
  measure: TextMeasurer
): { heightMm: number; widthMm: number; shrunk: boolean } {
  const w = measure(text, style.font, heightMm);
  if (w <= maxWidth || w === 0) return { heightMm, widthMm: w, shrunk: false };
  const k = maxWidth / w;
  return { heightMm: heightMm * k, widthMm: maxWidth, shrunk: true };
}

export const DESIGN_CLIP_INSET_MM = 1.5;

/**
 * Centro de un rectángulo w × h apoyado en una esquina de la base de la
 * pieza, lo más abajo y hacia el costado posible, a `margin` mm adentro de la
 * línea. Devuelve null si no entra.
 */
export function cornerPlacement(outline: PatternPiece["outline"], w: number, h: number, margin: number, corner: "derecha" | "izquierda" | "centro") {
  const inner = offset(outline, -margin);
  if (!inner) return null;
  const ib = bbox(inner);
  for (let k = 0; k < 120; k++) {
    const yb = ib.maxY - 0.05 - k * 0.5;
    const yt = yb - h;
    if (yt < ib.minY) break;
    let left = -Infinity, right = Infinity, ok = true;
    for (const y of [yb, (yb + yt) / 2, yt]) {
      const sp = spanAtY(inner, y);
      if (!sp) { ok = false; break; }
      left = Math.max(left, sp[0]);
      right = Math.min(right, sp[1]);
    }
    if (!ok || right - left < w) continue;
    const cx = corner === "derecha" ? right - w / 2 - 0.05 : corner === "izquierda" ? left + w / 2 + 0.05 : (left + right) / 2;
    const center = { x: cx, y: (yb + yt) / 2 };
    if (areaOutside(rectPoly(center.x, center.y, w, h), inner) < 0.5) return center;
  }
  return null;
}

/** Blanco sobre fondos oscuros, casi negro sobre claros. */
export function contrastOn(bg?: string | null): string {
  if (!bg || !/^#?[0-9a-f]{6}$/i.test(bg.replace("#", "").padStart(6, "0"))) return "#141414";
  const n = parseInt(bg.replace("#", ""), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.5 ? "#FFFFFF" : "#141414";
}

/**
 * Modo "piezas": lienzo del diseño → pieza de otro talle.
 * Primero se lleva el arte a la pieza del talle base (deshaciendo su lugar y
 * su giro en el archivo), después se escala en proporción al ancho desde el
 * centro y el punto más alto del hombro. Así todo lo que está en el arte
 * (escudo, logos) cae en las mismas unidades de la grilla en cada talle.
 */
export function designToPiece(
  ref: NonNullable<DesignConfig["background"]["pieces"]>[PieceKind],
  base: PatternPiece,
  target: PatternPiece,
  opts: { fit?: "ajustar" | "ancho" } = {}
): Affine {
  const b = ref!.box;
  const canvasToRefLocal: Affine =
    ref!.rotation === 180 ? { a: -1, b: 0, c: 0, d: -1, e: b.maxX, f: b.maxY } : translate(-b.minX, -b.minY);
  const bb = bbox(base.outline);
  const toBase = compose(canvasToRefLocal, translate(bb.minX, bb.minY));
  // Si en la moldería esta pieza está dibujada girada 180° respecto del talle
  // base, el arte se lleva a la pieza "derecha" y después se gira con ella.
  const flipped = rotatedVsBase(base, target);
  const tb = bbox(target.outline);
  const center = { x: (tb.minX + tb.maxX) / 2, y: (tb.minY + tb.maxY) / 2 };
  const rot: Affine = { a: -1, b: 0, c: 0, d: -1, e: 2 * center.x, f: 2 * center.y };
  const upright = flipped ? { ...target, outline: target.outline.map((p) => ({ x: 2 * center.x - p.x, y: 2 * center.y - p.y })), shoulderPoint: undefined } : target;
  const sx = (tb.maxX - tb.minX) / (bb.maxX - bb.minX);
  const topB = shoulderTop(base).y;
  const topT = shoulderTop(upright).y;
  const sy = opts.fit === "ancho" ? sx : (tb.maxY - topT) / (bb.maxY - topB || 1);
  const refL = { x: (bb.minX + bb.maxX) / 2, y: topB };
  const refS = { x: (tb.minX + tb.maxX) / 2, y: topT };
  const scale: Affine = { a: sx, b: 0, c: 0, d: sy, e: refS.x - sx * refL.x, f: refS.y - sy * refL.y };
  const m = compose(toBase, scale);
  return flipped ? compose(m, rot) : m;
}

const flipCache = new WeakMap<PatternPiece, Map<PatternPiece, boolean>>();
/** ¿La pieza del talle está dibujada girada 180° respecto de la del talle base? (comparando formas normalizadas) */
export function rotatedVsBase(base: PatternPiece, target: PatternPiece): boolean {
  if (base === target) return false;
  let m = flipCache.get(base);
  if (!m) flipCache.set(base, (m = new Map()));
  const hit = m.get(target);
  if (hit !== undefined) return hit;
  const norm = (poly: Poly, r: boolean): Poly => {
    const q = bbox(poly);
    const w = q.maxX - q.minX || 1, h = q.maxY - q.minY || 1;
    return poly.map((p) => {
      let x = (p.x - q.minX) / w, y = (p.y - q.minY) / h;
      if (r) { x = 1 - x; y = 1 - y; }
      return { x: x * 1000, y: y * 1000 };
    });
  };
  const nb = norm(base.outline, false);
  const iou = (t: Poly) => {
    const i = intersectionArea(nb, t);
    return i / (area(nb) + area(t) - i || 1);
  };
  const res = iou(norm(target.outline, true)) > iou(norm(target.outline, false)) + 0.05;
  m.set(target, res);
  return res;
}

export type BuildInput = {
  /** Piezas del modelo, de todos los talles. */
  pieces: PatternPiece[];
  assembly: AssemblyRule[];
  design: DesignConfig;
  garments: GarmentRequest[];
  measure: TextMeasurer;
};

export type BuildResult = { prints: PrintPiece[]; warnings: Warning[]; missingSizes: string[] };

/** Arma todas las piezas a imprimir de un pedido (una variante: jugador o arquero). */
export function buildPrintPieces({ pieces, assembly, design, garments, measure }: BuildInput): BuildResult {
  const bySize = new Map<string, PatternPiece[]>();
  for (const p of pieces) {
    const k = normalizeSize(p.sizeLabel);
    const list = bySize.get(k) ?? [];
    list.push(p);
    bySize.set(k, list);
  }
  const base = bySize.get(normalizeSize(design.baseSizeLabel)) ?? [];
  const prints: PrintPiece[] = [];
  const warnings: Warning[] = [];
  const missing = new Set<string>();

  // Las transformaciones dependen solo del talle: se calculan una vez por talle.
  const cache = new Map<string, { scale: number; t: ReturnType<typeof assemblyTransforms> }>();

  for (const g of garments) {
    const sizePieces = bySize.get(normalizeSize(g.sizeLabel));
    if (!sizePieces?.length) {
      missing.add(g.sizeLabel);
      continue;
    }
    let c = cache.get(g.sizeLabel);
    if (!c) {
      const scale = base.length ? sizeScale(sizePieces, base) : 1;
      c = { scale, t: assemblyTransforms(sizePieces, assembly, scale) };
      cache.set(g.sizeLabel, c);
    }

    for (const piece of sizePieces) {
      const group = sizeGroupOf(piece.sizeLabel);
      const pieceWarnings: Warning[] = [];
      const elements: PlacedElement[] = [];
      const texts: PlacedText[] = [];
      const b = bbox(piece.outline);
      const centerX = (b.minX + b.maxX) / 2;

      for (const el of design.elements.filter((e) => e.pieceKind === piece.kind)) {
        const pl = placeElement(piece, el);
        elements.push({ elementId: el.id, label: el.label, filePath: el.filePath, ...pl });
        if (safeZoneOverflow(piece, pl.center, pl.widthMm, pl.heightMm, design.safeMarginMm) > 1) {
          pieceWarnings.push({
            pieceId: piece.id,
            message: `${el.label} queda a menos de ${design.safeMarginMm} mm del borde en ${piece.kind} talle ${piece.sizeLabel}`,
          });
        }
      }

      // Número
      const nr = design.number;
      if (nr.enabled && g.number && nr.pieceKinds.includes(piece.kind)) {
        const isFront = piece.kind === "frente";
        const h = (isFront ? nr.frontHeightMm : undefined)?.[group] ?? nr.heightMm[group];
        const y = yFromShoulderTop(piece, isFront ? (nr.frontFromShoulderTopUnits ?? nr.fromShoulderTopUnits) : nr.fromShoulderTopUnits);
        const x = isFront && nr.frontSide && nr.frontSide !== "centro"
          ? xFromWearerSide(piece, nr.frontSide, nr.frontFromSideUnits ?? 2.5)
          : centerX;
        const fit = fitText(g.number, nr.style, h, availableWidth(piece, y, x, design.safeMarginMm), measure);
        texts.push({ kind: "numero", text: g.number, center: { x, y }, heightMm: fit.heightMm, widthMm: fit.widthMm, style: nr.style });
        if (fit.shrunk) {
          pieceWarnings.push({ pieceId: piece.id, message: `El número ${g.number} se achicó a ${fit.heightMm.toFixed(0)} mm para entrar en talle ${piece.sizeLabel}` });
        }
      }

      // Nombre (arriba en la espalda)
      const nm = design.name;
      if (nm.enabled && g.name && piece.kind === "espalda") {
        const y = yFromShoulderTop(piece, nm.fromShoulderTopUnits);
        const max = availableWidth(piece, y, centerX, design.safeMarginMm) * nm.maxWidthFraction;
        const text = g.name.toUpperCase();
        const fit = fitText(text, nm.style, nm.heightMm, max, measure);
        texts.push({ kind: "nombre", text, center: { x: centerX, y }, heightMm: fit.heightMm, widthMm: fit.widthMm, style: nm.style });
      }

      // Talle en la esquina: contra el borde de la base, adentro de la línea
      // (queda dentro del ruedo y no pisa el contorno).
      const tag = design.sizeTag;
      const boxes: PrintPiece["boxes"] = [];
      if (tag.enabled && tag.pieceKinds.includes(piece.kind)) {
        const color = !tag.color || tag.color === "auto" ? contrastOn(design.background.color) : tag.color;
        const style: TextStyle = { font: tag.font || DEFAULT_FONT, fill: color };
        const w = measure(piece.sizeLabel, style.font, tag.heightMm);
        // El ruedo es la base de la pieza. Si esta pieza está dibujada al revés
        // respecto del talle base (puño o ruedo arriba), va arriba y dado vuelta.
        const basePiece = base.find((p) => p.kind === piece.kind);
        const flipped = !!basePiece && rotatedVsBase(basePiece, piece);
        const pb = bbox(piece.outline);
        const pc = { x: (pb.minX + pb.maxX) / 2, y: (pb.minY + pb.maxY) / 2 };
        const flip = (p: { x: number; y: number }) => ({ x: 2 * pc.x - p.x, y: 2 * pc.y - p.y });
        const placeOn = flipped ? piece.outline.map(flip) : piece.outline;
        const c0 = cornerPlacement(placeOn, w, tag.heightMm, tag.marginMm, tag.corner);
        const center = c0 && flipped ? flip(c0) : c0;
        if (center) texts.push({ kind: "talle", text: piece.sizeLabel, center, heightMm: tag.heightMm, widthMm: w, style, rotation: flipped ? 180 : 0 });
        else pieceWarnings.push({ pieceId: piece.id, message: `No entra el talle en la esquina de ${piece.kind} talle ${piece.sizeLabel}` });
      }

      // Indicador de talle tipo escudo (opcional): arte + letra del talle.
      const ind = design.sizeIndicator;
      if (ind?.enabled && ind.pieceKind === piece.kind) {
        const u = gridUnit(piece);
        const w = ind.widthMm;
        const h = w * (ind.artAspect || 1);
        const center = { x: xFromWearerSide(piece, ind.side, ind.fromSideUnits), y: baselineY(piece) - ind.fromBaseUnits * u };
        if (ind.artPath) elements.push({ elementId: "indicador-talle", label: "Indicador de talle", center, widthMm: w, heightMm: h, filePath: ind.artPath });
        else boxes.push({ center, widthMm: w, heightMm: h, strokeMm: 0.6, color: contrastOn(design.background.color) });
        const textCenter = { x: center.x - w / 2 + ind.textX * w, y: center.y - h / 2 + ind.textY * h };
        const style: TextStyle = { font: ind.font || DEFAULT_FONT, fill: ind.textColor || "#FFFFFF" };
        texts.push({ kind: "talle", text: piece.sizeLabel, center: textCenter, heightMm: ind.textHeightMm, widthMm: measure(piece.sizeLabel, style.font, ind.textHeightMm), style });
        if (safeZoneOverflow(piece, center, w, h, design.safeMarginMm) > 1) {
          pieceWarnings.push({ pieceId: piece.id, message: `El indicador de talle queda a menos de ${design.safeMarginMm} mm del borde en talle ${piece.sizeLabel}` });
        }
      }

      const t = c.t.get(piece.id);
      let bgT: Affine = t ? backgroundTransform(design.background, t, c.scale) : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      let bgClip: PrintPiece["backgroundClip"] = null;
      if (design.background.mode === "piezas") {
        const ref = design.background.pieces?.[piece.kind];
        const basePiece = base.find((p) => p.kind === piece.kind);
        if (ref && basePiece) {
          bgT = designToPiece(ref, basePiece, piece, { fit: design.background.fit ?? "ajustar" });
          // 1,5 mm hacia adentro: deja afuera la línea de la pieza dibujada en el
          // diseño (si no, aparece como un filete oscuro al escalar). Ese borde
          // cae en la costura y queda cubierto por el color de fondo.
          bgClip = offset(ref.outline, -DESIGN_CLIP_INSET_MM) ?? ref.outline;
        } else {
          bgClip = []; // sin arte para esta pieza: solo color de fondo
        }
      }
      // Mangas de color liso: sin el fondo, solo el color.
      const solidSleeve = !!design.background.sleeveColor && (piece.kind === "manga_izq" || piece.kind === "manga_der");
      if (solidSleeve) bgClip = [];
      prints.push({
        key: `${g.orderItemId}:${piece.id}`,
        piece,
        garment: g,
        sizeGroup: group,
        backgroundTransform: bgT,
        backgroundClip: bgClip,
        bgFile: solidSleeve ? null : (design.background.filePath ?? null),
        bgColor: solidSleeve ? design.background.sleeveColor! : (design.background.color ?? null),
        elements,
        texts,
        boxes,
        warnings: pieceWarnings,
      });
      warnings.push(...pieceWarnings);
    }
  }
  return { prints, warnings, missingSizes: [...missing] };
}
