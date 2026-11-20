import { bbox, compose, scaleAbout, translate } from "./geometry";
import { baselineY, gridUnit, shoulderTop } from "./rules";
import type { Affine, AssemblyRule, BackgroundRule, PatternPiece, PieceKind, Pt } from "./types";

// Armado de la prenda sobre el lienzo del fondo (como el PowerClip de Corel).
//
// "Espacio armado": las piezas de un talle ubicadas como si la prenda
// estuviera cosida. Origen = centro del frente sobre la línea de base.
// - Frente: centrado sobre la línea de base.
// - Espalda: al lado del frente, tocando su costado derecho (que en el frente
//   visto desde afuera es el costado izquierdo de quien usa), en la misma
//   línea de base. Con rayas horizontales da igual; con un fondo diagonal o
//   una imagen, así coincide esa costura como cuando se arma en Corel.
// - Mangas: el punto más alto de la manga coincide con la punta del hombro
//   de la pieza de cuerpo indicada (align_to_kind), del lado que corresponde.
// Los offsets están en mm del talle base y escalan con el talle.
//
// El fondo se dibuja en un lienzo de W×H mm cuyo borde inferior, al centro,
// cae en el origen. En cada talle el lienzo se escala en proporción (o no,
// si es "fijo") desde ese origen, y cada pieza se recorta de ahí: por eso las
// rayas coinciden en las costuras en todos los talles.

export const DEFAULT_ASSEMBLY: AssemblyRule[] = [
  { kind: "frente", alignMode: "baseline", offsetX: 0, offsetY: 0 },
  { kind: "espalda", alignMode: "beside", alignToKind: "frente", offsetX: 0, offsetY: 0 },
  { kind: "manga_izq", alignMode: "shoulder", alignToKind: "frente", offsetX: 0, offsetY: 0 },
  { kind: "manga_der", alignMode: "shoulder", alignToKind: "frente", offsetX: 0, offsetY: 0 },
  // Short: las dos piernas una al lado de la otra sobre la línea de base, como
  // se dibujan en Corel (la derecha de quien usa a la izquierda del dibujo).
  { kind: "pierna_der", alignMode: "baseline", offsetX: 0, offsetY: 0 },
  { kind: "pierna_izq", alignMode: "beside", alignToKind: "pierna_der", offsetX: 0, offsetY: 0 },
];

/** Reglas del modelo + las de fábrica para los tipos que el modelo no define (los modelos viejos solo tienen las de remera). */
function withDefaults(rules: AssemblyRule[]): AssemblyRule[] {
  return [...rules, ...DEFAULT_ASSEMBLY.filter((d) => !rules.some((r) => r.kind === d.kind))];
}

/**
 * Punta del hombro (donde termina la costura de hombro, arriba de la sisa) del
 * lado del dibujo pedido: el punto más hacia afuera dentro del 15% superior.
 */
export function shoulderTip(piece: PatternPiece, drawingSide: "min" | "max"): Pt {
  const b = bbox(piece.outline);
  const limit = shoulderTop(piece).y + (b.maxY - b.minY) * 0.15;
  const candidates = piece.outline.filter((p) => p.y <= limit);
  const pool = candidates.length ? candidates : piece.outline;
  return pool.reduce((best, p) => (drawingSide === "min" ? (p.x < best.x ? p : best) : p.x > best.x ? p : best));
}

/** Lado del dibujo del FRENTE donde va cada manga (vista desde afuera). */
function sleeveSideOnFront(kind: PieceKind): "min" | "max" {
  // Manga izquierda de quien usa → derecha del dibujo del frente.
  return kind === "manga_izq" ? "max" : "min";
}

/** Escala del talle respecto del talle base, por el ancho del frente. */
export function sizeScale(piecesOfSize: PatternPiece[], basePieces: PatternPiece[]): number {
  // Siempre la misma pieza de referencia en todos los talles.
  const ORDER: PieceKind[] = ["frente", "espalda", "pierna_der", "pierna_izq", "manga_izq", "manga_der", "otra"];
  const ref = (list: PatternPiece[]) => [...list].sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind))[0];
  const a = ref(piecesOfSize);
  const b = ref(basePieces);
  if (!a || !b) return 1;
  return gridUnit(a) / gridUnit(b);
}

/** Transformación pieza → espacio armado, para cada pieza de un talle. */
export function assemblyTransforms(pieces: PatternPiece[], modelRules: AssemblyRule[], scale: number): Map<string, Affine> {
  const rules = withDefaults(modelRules);
  const byKind = new Map(pieces.map((p) => [p.kind, p]));
  const out = new Map<string, Affine>();
  const front = byKind.get("frente");
  const frontCenterX = front ? (bbox(front.outline).minX + bbox(front.outline).maxX) / 2 : 0;

  // Primero las piezas de cuerpo (las mangas dependen de ellas).
  for (const piece of pieces) {
    const rule = rules.find((r) => r.kind === piece.kind);
    if (!rule || rule.alignMode !== "baseline") continue;
    const b = bbox(piece.outline);
    const cx = (b.minX + b.maxX) / 2;
    out.set(piece.id, translate(-cx + rule.offsetX * scale, -baselineY(piece) + rule.offsetY * scale));
  }

  for (const piece of pieces) {
    const rule = rules.find((r) => r.kind === piece.kind);
    if (!rule || rule.alignMode !== "beside") continue;
    const target = byKind.get(rule.alignToKind ?? "frente");
    const targetT = target ? out.get(target.id) : undefined;
    const b = bbox(piece.outline);
    const by = -baselineY(piece) + rule.offsetY * scale;
    if (!target || !targetT) {
      out.set(piece.id, translate(-(b.minX + b.maxX) / 2, by));
      continue;
    }
    const targetRight = bbox(target.outline).maxX + targetT.e;
    out.set(piece.id, translate(targetRight - b.minX + rule.offsetX * scale, by));
  }

  for (const piece of pieces) {
    const rule = rules.find((r) => r.kind === piece.kind);
    if (!rule || rule.alignMode !== "shoulder") continue;
    const target = byKind.get(rule.alignToKind ?? "frente");
    const targetT = target ? out.get(target.id) : undefined;
    if (!target || !targetT) {
      // Sin pieza de referencia: se ubica como si fuera de cuerpo.
      out.set(piece.id, translate(-frontCenterX, -baselineY(piece)));
      continue;
    }
    const tip = shoulderTip(target, sleeveSideOnFront(piece.kind));
    const tipArmado = { x: tip.x + targetT.e, y: tip.y + targetT.f };
    const top = shoulderTop(piece);
    out.set(
      piece.id,
      translate(tipArmado.x - top.x + rule.offsetX * scale, tipArmado.y - top.y + rule.offsetY * scale)
    );
  }
  return out;
}

/** Lienzo del fondo → coordenadas de la pieza. */
export function backgroundTransform(bg: BackgroundRule, pieceToArmado: Affine, scale: number): Affine {
  const s = bg.scaling === "proporcional" ? scale : 1;
  const canvasToArmadoBase = translate(-bg.widthMm / 2, -bg.heightMm);
  const canvasToArmado = compose(canvasToArmadoBase, scaleAbout(s, { x: 0, y: 0 }));
  // Inversa de pieza → armado (es solo traslación).
  const armadoToPiece = translate(-pieceToArmado.e, -pieceToArmado.f);
  return compose(canvasToArmado, armadoToPiece);
}
