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

export type PieceKind = "frente" | "espalda" | "manga_izq" | "manga_der" | "otra";

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
  /** Familia registrada en el módulo; por ahora "Helvetica-Bold" o una fuente subida. */
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

export type SizeTagRule = {
  enabled: boolean;
  pieceKinds: PieceKind[];
  /** Distancia del borde de la etiqueta al costado DERECHO del dibujo. */
  fromRightMm: number;
  /** Distancia del borde inferior de la etiqueta a la línea de base. */
  fromBaseMm: number;
  /** Alto del texto del talle. */
  heightMm: number;
  /** Recuadro (el "cubito"): cuadrado con el talle adentro. null = solo el texto. */
  box?: { sizeMm: number; strokeMm: number } | null;
  /** Color de texto y recuadro: "auto" = blanco sobre fondos oscuros, negro sobre claros. */
  color?: string;
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
};

export type DesignConfig = {
  baseSizeLabel: string;
  background: BackgroundRule;
  elements: AnchoredElement[];
  number: NumberRule;
  name: NameRule;
  sizeTag: SizeTagRule;
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
};

/** Elemento anclado ya ubicado. */
export type PlacedElement = {
  elementId: string;
  label: string;
  center: Pt;
  widthMm: number;
  heightMm: number;
  filePath?: string | null;
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
  elements: PlacedElement[];
  texts: PlacedText[];
  /** Recuadros (etiqueta de talle). */
  boxes: { center: Pt; sizeMm: number; strokeMm: number; color: string }[];
  warnings: Warning[];
};

/** Pieza acomodada en el rollo. */
export type PlacedPiece = {
  print: PrintPiece;
  rotation: 0 | 180;
  /** Traslación aplicada después de rotar (coordenadas del rollo). */
  dx: number;
  dy: number;
  /** Contorno exterior (línea + contorno láser), ya en coordenadas del rollo. */
  outer: Poly;
};

/** Tramo del rollo = una página del PDF. */
export type Segment = { startMm: number; endMm: number; pieceIndexes: number[] };

export type RollLayout = {
  settings: ProductionSettings;
  placed: PlacedPiece[];
  segments: Segment[];
  lengthMm: number;
};
