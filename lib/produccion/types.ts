// Tipos del módulo de producción.
//
// Convenciones de geometría (valen para todo lib/produccion):
// - Unidades en milímetros reales.
// - Eje Y hacia abajo (como Corel/SVG). La exportación a PDF lo invierte.
// - Las piezas se describen vistas desde AFUERA, como se ve la prenda puesta
//   mirándola de frente. Para el frente, la izquierda de quien la usa queda a
//   la DERECHA del dibujo; para la espalda, queda a la IZQUIERDA.

export type Pt = { x: number; y: number };
export type Poly = Pt[]; // polígono cerrado (el último punto no repite el primero)
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

import type { TemplateSpec } from "./templates";

export type PieceKind = "frente" | "espalda" | "manga_izq" | "manga_der" | "pierna_izq" | "pierna_der" | "otra";

/**
 * Short: cada pierna es una sola pieza (delantero y trasero juntos, el costado
 * al medio). Vista desde afuera, el delantero de la pierna izquierda de quien
 * la usa queda a la IZQUIERDA del dibujo y el de la derecha, a la DERECHA; el
 * tiro trasero (la cintura más alta) queda del otro lado.
 */
export const LEG_KINDS = ["pierna_izq", "pierna_der"] as const;
export const isLeg = (k: PieceKind) => k === "pierna_izq" || k === "pierna_der";
/** Lado del dibujo donde está el delantero de cada pierna. */
export const legFrontSide = (k: PieceKind): "min" | "max" => (k === "pierna_izq" ? "min" : "max");

export const PIECE_LABELS: Record<PieceKind, string> = {
  frente: "Frente",
  espalda: "Espalda",
  manga_izq: "Manga izquierda",
  manga_der: "Manga derecha",
  pierna_izq: "Pierna izquierda",
  pierna_der: "Pierna derecha",
  otra: "Otra",
};

export type PatternPiece = {
  id: string;
  modelId: string;
  sizeLabel: string;
  kind: PieceKind;
  name?: string | null;
  outline: Poly;
  /** Punto más alto del hombro. Si falta, se calcula del contorno. */
  shoulderPoint?: Pt | null;
  /** Y de la línea de base (ruedo). Si falta, es el maxY del contorno. */
  baselineY?: number | null;
};

export type AssemblyRule = {
  kind: PieceKind;
  /**
   * baseline: centrada y apoyada en la línea de base (el frente).
   * beside: al lado de align_to_kind, tocando su costado derecho y en la misma
   *   línea de base (la espalda junto al frente: así la costura del costado
   *   izquierdo de quien usa coincide aunque el fondo sea diagonal).
   * shoulder: el punto más alto coincide con la punta del hombro de align_to_kind.
   */
  alignMode: "baseline" | "beside" | "shoulder";
  alignToKind?: PieceKind | null;
  offsetX: number;
  offsetY: number;
};

/** Lado de referencia, siempre desde el punto de vista de quien USA la prenda. */
export type WearerSide = "izquierda" | "derecha" | "centro";

/** Grupo de talle: cambia tamaños de escudo, número, etc. */
export type SizeGroup = "adulto" | "nino";

/**
 * Elemento anclado (escudo, sponsor, marca). La posición se expresa en la
 * grilla de 10 unidades de la pieza: 1 unidad = ancho máximo de la pieza / 10.
 */
export type AnchoredElement = {
  id: string;
  label: string; // "Escudo", "Sponsor pecho"...
  pieceKind: PieceKind;
  side: WearerSide;
  /** Distancia del centro del elemento al costado de referencia, en unidades. Ignorada si side = centro. */
  fromSideUnits: number;
  /** Distancia del centro del elemento al punto más alto del hombro, en unidades. */
  fromShoulderTopUnits: number;
  /** Ancho del elemento en mm, por grupo de talle (el alto sale de la proporción del archivo). */
  widthMm: Record<SizeGroup, number>;
  /** Proporción alto / ancho del arte. */
  aspect: number;
  /** Archivo del arte (PDF exportado de Corel) en Storage. */
  filePath?: string | null;
};

export type TextStyle = {
  /** "Helvetica-Bold" o la ruta en Storage de una fuente subida (fuentes/…ttf|otf). */
  font: string;
  fill: string; // hex
  stroke?: string | null; // borde, hex
  strokeMm?: number;
};

export type NumberRule = {
  enabled: boolean;
  pieceKinds: PieceKind[]; // espalda y, a veces, frente
  /** Alto del número (altura de las mayúsculas/cifras) por grupo de talle. */
  heightMm: Record<SizeGroup, number>;
  /** Alto para el número del frente, si va. */
  frontHeightMm?: Record<SizeGroup, number>;
  /** Centro vertical del número, en unidades desde el punto más alto del hombro. */
  fromShoulderTopUnits: number;
  frontFromShoulderTopUnits?: number;
  frontSide?: WearerSide;
  frontFromSideUnits?: number;
  /** Número en el short (si pieceKinds incluye una pierna): va en el delantero de la pierna. */
  shortHeightMm?: Record<SizeGroup, number>;
  /** Centro del número del short, en unidades desde la cintura (punto más alto). */
  shortFromTopUnits?: number;
  style: TextStyle;
};

export type NameRule = {
  enabled: boolean;
  /** Alto normal del nombre. Si no entra a lo ancho, se achica en proporción. */
  heightMm: number;
  /** Centro vertical del nombre, en unidades desde el punto más alto del hombro. */
  fromShoulderTopUnits: number;
  /** Ancho máximo como fracción del ancho de la pieza en esa altura (ej. 0.8). */
  maxWidthFraction: number;
  style: TextStyle;
};

/**
 * Talle en la esquina: la letra chiquita del talle en una esquina de la base
 * de cada pieza, contra el borde pero adentro de la línea (queda dentro del
 * ruedo y no pisa el contorno). Sirve para identificar las piezas al coser.
 */
export type SizeTagRule = {
  enabled: boolean;
  pieceKinds: PieceKind[];
  /** Esquina de la base (lado del dibujo, visto desde afuera). */
  corner: "derecha" | "izquierda" | "centro";
  /** Separación entre el texto y la línea de la pieza. */
  marginMm: number;
  /** Alto del texto del talle. */
  heightMm: number;
  /** "auto" = blanco sobre fondos oscuros, negro sobre claros. */
  color?: string;
  /** Fuente (ruta de una fuente subida); vacío = Helvetica Bold. */
  font?: string;
};

/**
 * Indicador de talle "tipo escudo": un arte que se sube (como el escudo),
 * ubicado con la grilla de 10 unidades, con la letra del talle encima.
 * Opcional: en algunas prendas va y en otras no.
 */
export type SizeIndicatorRule = {
  enabled: boolean;
  pieceKind: PieceKind;
  /** Lado de quien usa la prenda. */
  side: WearerSide;
  /** Centro del indicador, en unidades desde el costado. */
  fromSideUnits: number;
  /** Centro del indicador, en unidades desde la base (ruedo). */
  fromBaseUnits: number;
  /** Ancho del arte (el alto sale de su proporción). */
  widthMm: number;
  /** PDF del arte, SIN la letra del talle. */
  artPath?: string | null;
  artAspect: number;
  /** Dónde va la letra dentro del arte (0–1 de izquierda a derecha y de arriba abajo). */
  textX: number;
  textY: number;
  textHeightMm: number;
  /** Giro de la letra (para indicadores verticales). */
  textRotation?: TextRotation;
  /** Alineación de la letra respecto de textX/textY, en el sentido de lectura. */
  textAlign?: TextAlign;
  /** Largo máximo de la letra (mm): si el talle es más largo (2XL), se achica. 0 = sin límite. */
  textMaxWidthMm?: number;
  textColor: string;
  /** Fuente de la letra del talle (ruta de una fuente subida); vacío = Helvetica Bold. */
  font?: string;
  /**
   * Short: también (o solo, si el molde es de short) en una pierna. Va en la
   * esquina alta de la cintura (el tiro trasero), girado siguiendo la línea de
   * la cintura, con el mismo arte y la misma letra.
   */
  shortKind?: "pierna_izq" | "pierna_der" | null;
  /** Desde la esquina alta de la cintura (tiro trasero), a lo largo de la cintura. */
  shortAlongWaistUnits?: number;
  /** Desde la línea de la cintura hacia abajo. */
  shortBelowWaistUnits?: number;
};

/** Dónde está una pieza dentro del PDF de diseño (ver designDetect.ts). */
export type DesignPieceRef = {
  /** Contorno de la pieza en el archivo de diseño (mm, Y abajo). */
  outline: Poly;
  box: BBox;
  rotation: 0 | 180;
  /** Coincidencia con la moldería (0–1). */
  match: number;
};

export type BackgroundRule = {
  /**
   * piezas: el PDF es el diseño hecho en Corel sobre las piezas de un talle
   *   (cada pieza ya pintada). Cada pieza de otro talle toma el arte de su
   *   pieza equivalente, escalado en proporción desde el centro y el punto más
   *   alto del hombro (así se respeta la grilla de 10 unidades).
   * lienzo: el PDF es un fondo continuo (rayas, trama) del que se recortan
   *   todas las piezas armadas, como el PowerClip.
   */
  mode: "piezas" | "lienzo";
  /** Piezas detectadas en el PDF de diseño (modo "piezas"). */
  pieces?: Partial<Record<PieceKind, DesignPieceRef>>;
  /** PDF del fondo/diseño en Storage. */
  filePath?: string | null;
  /** Tamaño del lienzo del fondo en mm (talle base). */
  widthMm: number;
  heightMm: number;
  /** "proporcional": el fondo se escala con el talle. "fijo": se mantiene y se extiende. */
  scaling: "proporcional" | "fijo";
  /** Color liso si no hay archivo. */
  color?: string | null;
  /** Plantilla de fondo hecha en el sistema (el PDF del lienzo se genera al exportar). */
  template?: TemplateSpec | null;
  /** Mangas de un color liso (sin el fondo). */
  sleeveColor?: string | null;
  /**
   * Modo "piezas": cómo se lleva el arte a otro talle.
   * ajustar: al ancho Y al largo de cada pieza (el arte cubre la pieza entera;
   *   lo que esté dentro del diseño se deforma un poco: escudo y sponsors
   *   conviene cargarlos aparte, que los ubica la grilla sin deformar).
   * ancho: en proporción por el ancho (no deforma, pero puede faltar o
   *   sobrar arte abajo, porque los talles no crecen igual a lo largo).
   */
  fit?: "ajustar" | "ancho";
};

/**
 * Panel de cuellos: tiras sublimadas a lo ancho del rollo, una abajo de otra,
 * separadas por una línea fina que contrasta. Sin marcas de largo: la
 * costurera corta a demanda.
 */
export type CollarRule = {
  enabled: boolean;
  /** Alto de cada tira. */
  stripHeightMm: number;
  /** Cuántos cuellos salen de una tira (30 remeras y 3 por tira = 10 tiras). */
  necksPerStrip: number;
  /** Tiras de más, por si hay que rehacer alguno. */
  extraStrips: number;
  /** Color liso de la tira; vacío = el color de fondo del diseño. */
  color?: string | null;
  /** PDF opcional (rayas, textura) que se repite a lo largo de la tira, a su alto. */
  artPath?: string | null;
  artAspect: number;
  /** Línea divisoria entre tiras, para cortar a mano. */
  separatorMm: number;
  /** "auto" = contrasta con el color de la tira. */
  separatorColor: string;
};

/** Panel de cuellos ya ubicado en el rollo. */
export type CollarPanel = {
  startMm: number;
  endMm: number;
  strips: number;
  stripHeightMm: number;
  rule: CollarRule;
  /** Color efectivo de la tira y de la línea. */
  color: string;
  separatorColor: string;
};

export type DesignConfig = {
  baseSizeLabel: string;
  background: BackgroundRule;
  elements: AnchoredElement[];
  number: NumberRule;
  name: NameRule;
  sizeTag: SizeTagRule;
  sizeIndicator: SizeIndicatorRule;
  collars: CollarRule;
  /** Ningún elemento importante a menos de esto del contorno. */
  safeMarginMm: number;
};

export type ProductionSettings = {
  rollWidthMm: number; // 1550
  /** Espesor del contorno negro para el láser, por FUERA de la línea de la pieza. */
  contourMm: number; // 3
  /** Separación entre contornos (blanco). Entre líneas de vector = gap + 2 * contorno. */
  gapMm: number; // 6
  /** Rotaciones permitidas, en grados. */
  rotations: (0 | 180)[];
  /**
   * Mangas: también probar girarlas 90° (cambia el hilo de la tela; en
   * poliéster sublimado no se nota). Lo decide el motor si ahorra rollo.
   */
  sleeveQuarterTurns?: boolean;
  /** Largo máximo de cada tramo del PDF. */
  maxSegmentLengthMm: number;
  /** Margen a los costados del rollo. */
  edgeMarginMm: number;
};

/** Una prenda del pedido ya resuelta: qué talle, qué jugador. */
export type GarmentRequest = {
  orderItemId: string;
  sizeLabel: string;
  name?: string | null;
  number?: string | null;
  variant: "jugador" | "arquero";
};

/** Texto ya ubicado sobre una pieza. */
export type PlacedText = {
  kind: "nombre" | "numero" | "talle";
  text: string;
  center: Pt;
  heightMm: number; // alto de mayúsculas
  widthMm: number;
  style: TextStyle;
  /**
   * Giro en grados, sentido horario como se ve la pieza. 180 = dado vuelta
   * (pieza dibujada al revés); 90/270 = vertical (indicador de talle).
   */
  /** Giro en grados (horario). Normalmente 0/90/180/270; en el short sigue la cintura. */
  rotation?: number;
  /** Qué punto del texto cae en `center`: su centro (por defecto), el inicio o el fin. */
  align?: TextAlign;
};

export type TextRotation = 0 | 90 | 180 | 270;
export type TextAlign = "centro" | "inicio" | "fin";

/** Elemento anclado ya ubicado. */
export type PlacedElement = {
  elementId: string;
  label: string;
  center: Pt;
  widthMm: number;
  heightMm: number;
  filePath?: string | null;
  /** Giro en grados (horario) alrededor del centro. */
  rotation?: number;
};

export type Warning = { pieceId: string; message: string };

/** Transformación del lienzo del fondo hacia las coordenadas de la pieza. */
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Una pieza lista para imprimir (en coordenadas propias de la pieza). */
export type PrintPiece = {
  key: string; // único dentro de la tizada
  piece: PatternPiece;
  garment: GarmentRequest;
  sizeGroup: SizeGroup;
  /** Lienzo del fondo → coordenadas de la pieza. */
  backgroundTransform: Affine;
  /** Recorte extra del arte, en coordenadas del lienzo (modo "piezas": la pieza del diseño). */
  backgroundClip?: Poly | null;
  /** Archivo y color del fondo de ESTA pieza (en un rollo combinado cada prenda trae su diseño). */
  bgFile?: string | null;
  bgColor?: string | null;
  /** Sin la copia agrandada de abajo (sangrado): piezas sueltas con medida exacta. */
  noBleed?: boolean;
  elements: PlacedElement[];
  texts: PlacedText[];
  /** Indicador de talle: arte subido o cuadrado con borde. */
  boxes: { center: Pt; widthMm: number; heightMm: number; strokeMm: number; color: string; artPath?: string | null }[];
  warnings: Warning[];
};

/** Pieza acomodada en el rollo. */
export type Rotation = 0 | 90 | 180 | 270;

export type PlacedPiece = {
  print: PrintPiece;
  /** Giro alrededor del centro de la pieza (90 = horario en el rollo). */
  rotation: Rotation;
  /** Traslación aplicada después de rotar (coordenadas del rollo). */
  dx: number;
  dy: number;
  /** Contorno exterior (línea + contorno láser), ya en coordenadas del rollo. */
  outer: Poly;
};

/** Tramo del rollo = una página del PDF. */
export type Segment = { startMm: number; endMm: number; pieceIndexes: number[]; collars?: CollarPanel };

export type RollLayout = {
  settings: ProductionSettings;
  placed: PlacedPiece[];
  segments: Segment[];
  lengthMm: number;
};

