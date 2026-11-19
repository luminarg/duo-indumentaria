// "Prendas de un pedido": cada combinación artículo × prenda (del combo) ×
// variante (jugador/arquero) lleva su diseño y su rollo. El pedido pasa a
// sublimación cuando todas tienen rollo.

export type ReqRow = { id: string; description: string | null; article_type_id: string | null };
export type CompRow = { id: string; article_type_id: string; name: string; sort_order: number };
export type ItemLite = { requirement_id: string | null; variant: string | null };

export const ctxKey = (req: string | null | undefined, comp: string | null | undefined, variant: string) => `${req ?? ""}|${comp ?? ""}|${variant}`;

export function orderContexts(requirements: ReqRow[], items: ItemLite[], components: CompRow[]) {
  const out: { key: string; label: string; requirementId: string; componentId: string; variant: "jugador" | "arquero" }[] = [];
  const reqIds = requirements.length ? requirements.map((r) => r.id) : [""];
  for (const req of reqIds) {
    const its = req ? items.filter((i) => i.requirement_id === req) : items;
    const variants = [...new Set(its.map((i) => (i.variant === "arquero" ? "arquero" : "jugador")))] as ("jugador" | "arquero")[];
    const r = requirements.find((x) => x.id === req);
    const comps = components.filter((c) => r?.article_type_id && c.article_type_id === r.article_type_id).sort((a, b) => a.sort_order - b.sort_order);
    for (const v of variants)
      for (const c of comps.length ? comps : [null])
        out.push({
          key: ctxKey(req, c?.id ?? "", v),
          label: [r?.description ?? "Prendas", c?.name, v === "arquero" ? "arquero" : null].filter(Boolean).join(" · "),
          requirementId: req,
          componentId: c?.id ?? "",
          variant: v,
        });
  }
  return out;
}
