import { sizeGroupOf } from "./rules";
import type { SizeGroup } from "./types";

// "Prendas de un pedido": cada combinación artículo × prenda (del combo) ×
// variante (jugador/arquero) lleva su diseño y su rollo. Si en un artículo
// hay niños y adultos y se guardó un diseño por grupo de talles, cada grupo
// es una prenda aparte (su propio PDF base). El pedido pasa a sublimación
// cuando todas tienen rollo.

export type ReqRow = { id: string; description: string | null; article_type_id: string | null };
export type CompRow = { id: string; article_type_id: string; name: string; sort_order: number };
export type ItemLite = { requirement_id: string | null; variant: string | null; size_label?: string | null; size_id?: string | null };
/** "" = todos los talles juntos. */
export type GroupKey = "" | SizeGroup;
export type DesignLite = { requirement_id: string | null; component_id?: string | null; variant: string; size_group?: string | null };

export const ctxKey = (req: string | null | undefined, comp: string | null | undefined, variant: string, group?: string | null) =>
  `${req ?? ""}|${comp ?? ""}|${variant}` + (group ? `|${group}` : "");

export const GROUP_LABEL: Record<SizeGroup, string> = { nino: "niños", adulto: "adultos" };

/** Grupo de talles de un ítem del pedido. */
export function itemGroup(i: ItemLite, sizeLabels: Record<string, string> = {}): SizeGroup {
  const label = i.size_label || (i.size_id ? sizeLabels[i.size_id] : "") || "";
  return sizeGroupOf(label);
}

export function orderContexts(requirements: ReqRow[], items: ItemLite[], components: CompRow[], designs: DesignLite[] = [], sizeLabels: Record<string, string> = {}) {
  const out: { key: string; baseKey: string; label: string; requirementId: string; componentId: string; variant: "jugador" | "arquero"; group: GroupKey }[] = [];
  const reqIds = requirements.length ? requirements.map((r) => r.id) : [""];
  for (const req of reqIds) {
    const its = req ? items.filter((i) => i.requirement_id === req) : items;
    const variants = [...new Set(its.map((i) => (i.variant === "arquero" ? "arquero" : "jugador")))] as ("jugador" | "arquero")[];
    const r = requirements.find((x) => x.id === req);
    const comps = components.filter((c) => r?.article_type_id && c.article_type_id === r.article_type_id).sort((a, b) => a.sort_order - b.sort_order);
    for (const v of variants)
      for (const c of comps.length ? comps : [null]) {
        const base = { requirementId: req, componentId: c?.id ?? "", variant: v };
        const label = [r?.description ?? "Prendas", c?.name, v === "arquero" ? "arquero" : null].filter(Boolean).join(" · ");
        const vItems = its.filter((i) => (i.variant === "arquero" ? "arquero" : "jugador") === v);
        const present = [...new Set(vItems.map((i) => itemGroup(i, sizeLabels)))];
        // Se separa por grupo si hay un diseño guardado de un grupo y el artículo tiene los dos.
        const split =
          present.length > 1 &&
          designs.some((d) => (d.requirement_id ?? "") === req && (d.component_id ?? "") === base.componentId && d.variant === v && d.size_group);
        const groups: GroupKey[] = split ? (["nino", "adulto"] as const).filter((g) => present.includes(g)) : [""];
        for (const g of groups)
          out.push({ ...base, group: g, key: ctxKey(req, base.componentId, v, g), baseKey: ctxKey(req, base.componentId, v), label: g ? `${label} · ${GROUP_LABEL[g]}` : label });
      }
  }
  return out;
}

/** Diseño guardado más nuevo de una prenda y grupo de talles (los diseños vienen de la versión más nueva a la más vieja). */
export function findDesign<T extends DesignLite>(designs: T[], req: string, comp: string, variant: string, group: GroupKey): T | null {
  return designs.find((d) => (d.requirement_id ?? "") === req && (d.component_id ?? "") === comp && d.variant === variant && (d.size_group ?? "") === group) ?? null;
}
