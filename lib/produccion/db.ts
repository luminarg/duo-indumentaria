import { DEFAULT_ASSEMBLY } from "./assembly";
import { defaultDesignConfig } from "./defaults";
import type { AssemblyRule, DesignConfig, GarmentRequest, PatternPiece, PieceKind } from "./types";

// Conversión entre filas de Supabase y los tipos del motor.

export type PatternPieceRow = {
  id: string;
  model_id: string;
  size_label: string;
  kind: string;
  name: string | null;
  outline: [number, number][];
  shoulder_point: [number, number] | null;
  baseline_y: number | string | null;
};

export function pieceFromRow(r: PatternPieceRow): PatternPiece {
  return {
    id: r.id,
    modelId: r.model_id,
    sizeLabel: r.size_label,
    kind: r.kind as PieceKind,
    name: r.name,
    outline: r.outline.map(([x, y]) => ({ x, y })),
    shoulderPoint: r.shoulder_point ? { x: r.shoulder_point[0], y: r.shoulder_point[1] } : null,
    baselineY: r.baseline_y == null ? null : Number(r.baseline_y),
  };
}

export type AssemblyRow = { kind: string; align_mode: string; align_to_kind: string | null; offset_x: number | string; offset_y: number | string };

export function assemblyFromRows(rows: AssemblyRow[] | null | undefined): AssemblyRule[] {
  if (!rows?.length) return DEFAULT_ASSEMBLY;
  return rows.map((r) => ({
    kind: r.kind as PieceKind,
    alignMode: r.align_mode as AssemblyRule["alignMode"],
    alignToKind: (r.align_to_kind as PieceKind | null) ?? null,
    offsetX: Number(r.offset_x) || 0,
    offsetY: Number(r.offset_y) || 0,
  }));
}

/** Completa un config guardado con los valores por defecto (por si se agregan campos nuevos). */
export function normalizeConfig(raw: unknown, baseSizeLabel?: string): DesignConfig {
  const d = defaultDesignConfig();
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<DesignConfig>;
  return {
    ...d,
    ...c,
    baseSizeLabel: c.baseSizeLabel ?? baseSizeLabel ?? d.baseSizeLabel,
    background: { ...d.background, ...(c.background ?? {}) },
    number: { ...d.number, ...(c.number ?? {}) },
    name: { ...d.name, ...(c.name ?? {}) },
    sizeTag: {
      ...d.sizeTag,
      ...(c.sizeTag ?? {}),
      // Diseños guardados con la versión vieja (3 × 7 cm) pasan a la regla nueva.
      ...(c.sizeTag && !("corner" in c.sizeTag) ? { corner: d.sizeTag.corner, marginMm: d.sizeTag.marginMm, heightMm: d.sizeTag.heightMm } : {}),
    },
    sizeIndicator: { ...d.sizeIndicator, ...(c.sizeIndicator ?? {}) },
    elements: c.elements ?? d.elements,
  };
}

export type OrderItemRow = {
  id: string;
  size_id: string | null;
  size_label: string | null;
  individual_name: string | null;
  individual_number: string | null;
  quantity: number | null;
  variant: string | null;
  requirement_id: string | null;
};

/** Una fila de pedido con cantidad N se convierte en N prendas. */
export function garmentsFromItems(items: OrderItemRow[], sizeLabels: Record<string, string>): GarmentRequest[] {
  const out: GarmentRequest[] = [];
  for (const it of items) {
    const size = (it.size_label?.trim() || (it.size_id ? sizeLabels[it.size_id] : "") || "").trim();
    const qty = Math.max(1, it.quantity ?? 1);
    for (let i = 0; i < qty; i++) {
      out.push({
        orderItemId: qty > 1 ? `${it.id}#${i + 1}` : it.id,
        sizeLabel: size,
        name: it.individual_name,
        number: it.individual_number,
        variant: it.variant === "arquero" ? "arquero" : "jugador",
      });
    }
  }
  return out;
}
