import { assemblyTransforms, backgroundTransform, sizeScale } from "./assembly";
import { bbox, compose, offset, spanAtY, translate } from "./geometry";
import { baselineY, normalizeSize, placeElement, safeZoneOverflow, shoulderTop, sizeGroupOf, xFromWearerSide, yFromShoulderTop } from "./rules";
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
  TextStyle,
  Warning,
} from "./types";

/** Ancho en mm de un texto con alto de mayúsculas `capHeightMm`. */
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
 * Modo "piezas": lienzo del diseño → pieza de otro talle.
 * Primero se lleva el arte a la pieza del talle base (deshaciendo su lugar y
 * su giro en el archivo), después se escala en proporción al ancho desde el
 * centro y el punto más alto del hombro. Así todo lo que está en el arte
 * (escudo, logos) cae en las mismas unidades de la grilla en cada talle.
 */
export function designToPiece(ref: NonNullable<DesignConfig["background"]["pieces"]>[PieceKind], base: PatternPiece, target: PatternPiece): Affine {
  const b = ref!.box;
  const canvasToRefLocal: Affine =
    ref!.rotation === 180 ? { a: -1, b: 0, c: 0, d: -1, e: b.maxX, f: b.maxY } : translate(-b.minX, -b.minY);
  const bb = bbox(base.outline);
  const toBase = compose(canvasToRefLocal, translate(bb.minX, bb.minY));
  const tb = bbox(target.outline);
  const s = (tb.maxX - tb.minX) / (bb.maxX - bb.minX);
  const refL = { x: (bb.minX + bb.maxX) / 2, y: shoulderTop(base).y };
  const refS = { x: (tb.minX + tb.maxX) / 2, y: shoulderTop(target).y };
  const scale: Affine = { a: s, b: 0, c: 0, d: s, e: refS.x - s * refL.x, f: refS.y - s * refL.y };
  return compose(toBase, scale);
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

      // Etiqueta de talle: abajo a la derecha del dibujo, medida a su borde.
      const tag = design.sizeTag;
      if (tag.enabled && tag.pieceKinds.includes(piece.kind)) {
        const style: TextStyle = { font: "Helvetica-Bold", fill: "#141414" };
        const w = measure(piece.sizeLabel, style.font, tag.heightMm);
        const cx = b.maxX - tag.fromRightMm - w / 2;
        const cy = baselineY(piece) - tag.fromBaseMm - tag.heightMm / 2;
        texts.push({ kind: "talle", text: piece.sizeLabel, center: { x: cx, y: cy }, heightMm: tag.heightMm, widthMm: w, style });
      }

      const t = c.t.get(piece.id);
      let bgT: Affine = t ? backgroundTransform(design.background, t, c.scale) : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      let bgClip: PrintPiece["backgroundClip"] = null;
      if (design.background.mode === "piezas") {
        const ref = design.background.pieces?.[piece.kind];
        const basePiece = base.find((p) => p.kind === piece.kind);
        if (ref && basePiece) {
          bgT = designToPiece(ref, basePiece, piece);
          // 1,5 mm hacia adentro: deja afuera la línea de la pieza dibujada en el
          // diseño (si no, aparece como un filete oscuro al escalar). Ese borde
          // cae en la costura y queda cubierto por el color de fondo.
          bgClip = offset(ref.outline, -DESIGN_CLIP_INSET_MM) ?? ref.outline;
        } else {
          bgClip = []; // sin arte para esta pieza: solo color de fondo
        }
      }
      prints.push({
        key: `${g.orderItemId}:${piece.id}`,
        piece,
        garment: g,
        sizeGroup: group,
        backgroundTransform: bgT,
        backgroundClip: bgClip,
        elements,
        texts,
        warnings: pieceWarnings,
      });
      warnings.push(...pieceWarnings);
    }
  }
  return { prints, warnings, missingSizes: [...missing] };
}
