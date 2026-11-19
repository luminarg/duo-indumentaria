import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import type { AssemblyRow, OrderItemRow, PatternPieceRow } from "@/lib/produccion/db";
import { CombinedRoll, type CombinedOrder } from "./CombinedRoll";

// Rollo con varios pedidos: junta prendas de distintos pedidos (con su diseño
// guardado) en un mismo rollo, para aprovechar la tela.
const STATUSES = ["diseno_molderia", "cerrado", "cortando"];

export default async function RolloCombinadoPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, team_or_group_name, contact_name")
    .in("status", STATUSES)
    .order("estimated_delivery_date", { ascending: true, nullsFirst: false })
    .limit(80);
  const ids = (orders ?? []).map((o) => o.id);

  const none = { data: [] as never[] };
  const [{ data: items }, { data: requirements }, { data: designs }, { data: layouts }, { data: layoutItems }, { data: sizes }, { data: models }] = await Promise.all([
    ids.length ? supabase.from("order_items").select("id, order_id, size_id, size_label, individual_name, individual_number, quantity, variant, requirement_id").in("order_id", ids) : none,
    ids.length ? supabase.from("order_article_requirements").select("id, order_id, description, article_type_id").in("order_id", ids).order("sort_order", { ascending: true }) : none,
    ids.length
      ? supabase.from("order_designs").select("id, order_id, requirement_id, component_id, model_id, variant, version, config").in("order_id", ids).order("version", { ascending: false })
      : none,
    ids.length ? supabase.from("production_layouts").select("order_id, requirement_id, component_id, variant").in("order_id", ids) : none,
    ids.length ? supabase.from("production_layout_items").select("order_id, requirement_id, component_id, variant").in("order_id", ids) : none,
    supabase.from("sizes").select("id, label"),
    supabase.from("pattern_models").select("id, name, base_size_label, article_type_id").eq("active", true),
  ]);

  const typeIds = [...new Set((requirements ?? []).map((r) => r.article_type_id).filter(Boolean))] as string[];
  const { data: components } = typeIds.length
    ? await supabase.from("article_type_components").select("id, article_type_id, name, model_id, copy_number, copy_name, sort_order").in("article_type_id", typeIds)
    : { data: [] };

  const modelIds = [...new Set((designs ?? []).map((d) => d.model_id).filter(Boolean))] as string[];
  const [{ data: pieces }, { data: assembly }] = modelIds.length
    ? await Promise.all([
        supabase.from("pattern_pieces").select("id, model_id, size_label, kind, name, outline, shoulder_point, baseline_y").in("model_id", modelIds),
        supabase.from("model_assembly").select("model_id, kind, align_mode, align_to_kind, offset_x, offset_y").in("model_id", modelIds),
      ])
    : [{ data: [] }, { data: [] }];

  const data: CombinedOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    number: o.order_number,
    status: o.status,
    name: o.team_or_group_name || o.contact_name || "",
    items: (items ?? []).filter((i) => i.order_id === o.id) as unknown as OrderItemRow[],
    requirements: (requirements ?? []).filter((r) => r.order_id === o.id),
    designs: (designs ?? []).filter((d) => d.order_id === o.id),
    covered: [...(layouts ?? []), ...(layoutItems ?? [])].filter((l) => l.order_id === o.id && l.variant),
  }));

  return (
    <div>
      <PageHeader
        title="Rollo con varios pedidos"
        description="Juntá prendas de distintos pedidos en un mismo rollo. Cada una lleva su diseño guardado; el rollo se arma, se retoca y se exporta igual que el de un pedido."
        action={
          <Link href="/panel/produccion" className="text-sm text-zinc-500 hover:underline">
            Volver a Producción
          </Link>
        }
      />
      <CombinedRoll
        orders={data}
        sizeLabels={Object.fromEntries((sizes ?? []).map((s) => [s.id, s.label]))}
        models={models ?? []}
        components={components ?? []}
        pieces={(pieces ?? []) as PatternPieceRow[]}
        assembly={(assembly ?? []) as (AssemblyRow & { model_id: string })[]}
      />
    </div>
  );
}
