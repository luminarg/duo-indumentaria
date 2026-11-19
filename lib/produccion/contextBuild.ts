import { buildPrintPieces, type TextMeasurer } from "./build";
import { garmentsFromItems, type OrderItemRow } from "./db";
import { usedFonts } from "./fonts";
import { normalizeSize } from "./rules";
import { canvasForPieces, renderTemplate, type CanvasInfo, type CustomTemplate, type Shape } from "./templates";
import { templateToPdf } from "./templatePdf";
import type { AssemblyRule, DesignConfig, GarmentRequest, PatternPiece, PrintPiece } from "./types";

// Arma las piezas de una "prenda de un pedido" (pedido × artículo × prenda ×
// variante) a partir de su diseño guardado. Lo usa el rollo con varios
// pedidos; el banco de trabajo de un pedido hace lo mismo en vivo.

export type ComponentFlags = { copy_number: boolean; copy_name: boolean } | null;

/** Diseño efectivo: con plantilla, el fondo pasa a ser un lienzo generado. */
export function effectiveDesign(
  config: DesignConfig,
  pieces: PatternPiece[],
  assembly: AssemblyRule[],
  modelBaseSize: string | null | undefined,
  custom: CustomTemplate[],
  templateKey: string
): { design: DesignConfig; canvas: CanvasInfo | null; shapes: Shape[] | null; baseLabel: string } {
  const has = (l?: string | null) => !!l && pieces.some((p) => normalizeSize(p.sizeLabel) === normalizeSize(l));
  const baseLabel = has(config.baseSizeLabel) ? config.baseSizeLabel : has(modelBaseSize) ? modelBaseSize! : (pieces[0]?.sizeLabel ?? config.baseSizeLabel);
  const tpl = config.background.template;
  if (!tpl) return { design: config, canvas: null, shapes: null, baseLabel };
  const canvas = canvasForPieces(pieces.filter((p) => normalizeSize(p.sizeLabel) === normalizeSize(baseLabel)), assembly);
  const shapes = renderTemplate(tpl, canvas, custom);
  return {
    design: {
      ...config,
      baseSizeLabel: baseLabel,
      background: {
        ...config.background,
        mode: "lienzo",
        pieces: undefined,
        filePath: templateKey,
        widthMm: canvas.widthMm,
        heightMm: canvas.heightMm,
        color: tpl.colors[0] ?? config.background.color,
      },
    },
    canvas,
    shapes,
    baseLabel,
  };
}

/** Prendas a fabricar de una variante, con los datos que lleva la prenda del combo. */
export function contextGarments(items: OrderItemRow[], sizeLabels: Record<string, string>, variant: "jugador" | "arquero", comp: ComponentFlags, keyPrefix: string): GarmentRequest[] {
  return garmentsFromItems(items, sizeLabels)
    .filter((g) => g.variant === variant)
    .map((g) => ({
      ...g,
      orderItemId: `${keyPrefix}:${g.orderItemId}`,
      name: comp && !comp.copy_name ? null : g.name,
      number: comp && !comp.copy_number ? null : g.number,
    }));
}

/** Archivos que necesita el diseño (fondo, elementos, indicador, arte de cuellos). */
export function designFiles(config: DesignConfig): { background: string | null; elements: string[]; fonts: string[] } {
  return {
    background: config.background.template ? null : (config.background.filePath ?? null),
    elements: [...config.elements.map((e) => e.filePath), config.sizeIndicator.artPath, config.collars.artPath].filter((p): p is string => !!p),
    fonts: usedFonts(config),
  };
}

export type ContextBuild = {
  prints: PrintPiece[];
  design: DesignConfig;
  garments: GarmentRequest[];
  warnings: string[];
  /** Fondo generado por plantilla (bytes del PDF), si corresponde. */
  templatePdf: Promise<Uint8Array> | null;
  templateKey: string;
};

export function buildContext(input: {
  config: DesignConfig;
  pieces: PatternPiece[];
  assembly: AssemblyRule[];
  modelBaseSize?: string | null;
  custom: CustomTemplate[];
  garments: GarmentRequest[];
  measure: TextMeasurer;
  templateKey: string;
}): ContextBuild {
  const eff = effectiveDesign(input.config, input.pieces, input.assembly, input.modelBaseSize, input.custom, input.templateKey);
  const { prints, warnings } = buildPrintPieces({ pieces: input.pieces, assembly: input.assembly, design: eff.design, garments: input.garments, measure: input.measure });
  return {
    prints,
    design: eff.design,
    garments: input.garments,
    warnings: warnings.map((w) => w.message),
    templatePdf: eff.shapes && eff.canvas ? templateToPdf(eff.shapes, eff.canvas.widthMm, eff.canvas.heightMm) : null,
    templateKey: input.templateKey,
  };
}
