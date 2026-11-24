import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import type { AssemblyRow, OrderItemRow, PatternPieceRow } from "@/lib/produccion/db";
import type { JobItem } from "../actions";
import { CombinedRoll, type CombinedOrder } from "./CombinedRoll";

// Rollo con varios pedidos: junta prendas de distintos pedidos (con su diseño
// guardado) en un mismo rollo, para aprovechar la tela.
const STATUSES = ["diseno_molderia", "cerrado", "cortando"];

export default async function RolloCombinadoPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { pedido } = await searchParams;
  const supabase = await createClient();
  // Pedidos en producción y, además, cualquier pedido no entregado con un
  // diseño guardado (apenas se toca "Guardar diseño" ya se puede usar acá).
  const { data: withDesign } = await supabase.from("order_designs").select("order_id").order("created_at", { ascending: false }).limit(300);
  const designed = [...new Set([...(pedido ? [pedido] : []), ...(withDesign ?? []).map((d) => d.order_id as string)])].slice(0, 100);
  const cols = "id, order_number, status, team_or_group_name, contact_name, estimated_delivery_date";
  const [{ data: inProduction }, { data: withSaved }] = await Promise.all([
    supabase.from("orders").select(cols).in("status", STATUSES).order("estimated_delivery_date", { ascending: true, nullsFirst: false }).limit(80),
    designed.length ? supabase.from("orders").select(cols).in("id", designed).neq("status", "entregado") : { data: [] as never[] },
  ]);
  const orders = [...(inProduction ?? []), ...(withSaved ?? []).filter((o) => !(inProduction ?? []).some((x) => x.id === o.id))].sort((a, b) =>
    String(a.estimated_delivery_date ?? "9999").localeCompare(String(b.estimated_delivery_date ?? "9999"))
  );
  const ids = (orders ?? []).map((o) => o.id);
  // Trabajos libres (escalado para terceros) con diseño guardado.
  const { data: jobs } = await supabase
    .from("production_jobs")
    .select("id, client_name, model_id, items, design, created_at")
    .not("design", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);
  const jobIds = (jobs ?? []).map((j) => j.id);

  const none = { data: [] as never[] };
  const [{ data: items }, { data: requirements }, { data: designs }, { data: layouts }, { data: layoutItems }, { data: sizes }, { data: models }] = await Promise.all([
    ids.length ? supabase.from("order_items").select("id, order_id, size_id, size_label, individual_name, individual_number, quantity, variant, requirement_id").in("order_id", ids) : none,
    ids.length ? supabase.from("order_article_requirements").select("id, order_id, description, article_type_id").in("order_id", ids).order("sort_order", { ascending: true }) : none,
    ids.length
      ? supabase.from("order_designs").select("*").in("order_id", ids).order("version", { ascending: false })
      : none,
    ids.length ? supabase.from("production_layouts").select("*").in("order_id", ids) : none,
    ids.length || jobIds.length
      ? supabase
          .from("production_layout_items")
          .select("*")
          .or([ids.length ? `order_id.in.(${ids.join(",")})` : "", jobIds.length ? `job_id.in.(${jobIds.join(",")})` : ""].filter(Boolean).join(","))
      : none,
    supabase.from("sizes").select("id, label"),
    supabase.from("pattern_models").select("id, name, base_size_label, article_type_id").eq("active", true),
  ]);

  const typeIds = [...new Set((requirements ?? []).map((r) => r.article_type_id).filter(Boolean))] as string[];
  const { data: components } = typeIds.length
    ? await supabase.from("article_type_components").select("id, article_type_id, name, model_id, copy_number, copy_name, sort_order").in("article_type_id", typeIds)
    : { data: [] };

  const modelIds = [...new Set([...(designs ?? []).map((d) => d.model_id), ...(jobs ?? []).map((j) => j.model_id)].filter(Boolean))] as string[];
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
  for (const j of jobs ?? []) {
    const design = (j.design && typeof j.design === "object" ? j.design : {}) as Record<string, unknown>;
    const its = (Array.isArray(j.items) ? j.items : []) as JobItem[];
    data.push({
      id: j.id,
      isJob: true,
      number: "Trabajo libre",
      status: "trabajo",
      name: j.client_name,
      items: its
        .filter((i) => String(i.size ?? "").trim())
        .map((i, k) => ({
          id: `t${k}`,
          size_id: null,
          size_label: String(i.size).trim(),
          individual_name: i.name || null,
          individual_number: i.number || null,
          quantity: Math.max(1, Math.floor(Number(i.qty) || 1)),
          variant: i.variant ?? "jugador",
          requirement_id: null,
        })) as unknown as OrderItemRow[],
      requirements: [],
      designs: (["jugador", "arquero"] as const)
        .filter((v) => design[v])
        .map((v) => ({ id: `${j.id}:${v}`, order_id: j.id, requirement_id: null, component_id: null, model_id: j.model_id, variant: v, version: 1, config: design[v] })),
      covered: (layoutItems ?? []).filter((l) => (l as { job_id?: string | null }).job_id === j.id && l.variant).map((l) => ({ ...l, order_id: j.id })),
    });
  }

  return (
    <div>
      <PageHeader
        title="Rollo con varios pedidos"
        description="Juntá prendas de distintos pedidos y trabajos libres en un mismo rollo. Cada una lleva su diseño guardado; el rollo se arma, se retoca y se exporta igual que el de un pedido."
        action={
          <Link href="/panel/produccion" className="text-sm text-zinc-500 hover:underline">
            Volver a Producción
          </Link>
        }
      />
      <CombinedRoll
        preselectOrderId={pedido ?? null}
        orders={pedido ? [...data.filter((o) => o.id === pedido), ...data.filter((o) => o.id !== pedido)] : data}
        sizeLabels={Object.fromEntries((sizes ?? []).map((s) => [s.id, s.label]))}
        models={models ?? []}
        components={components ?? []}
        pieces={(pieces ?? []) as PatternPieceRow[]}
        assembly={(assembly ?? []) as (AssemblyRow & { model_id: string })[]}
      />
    </div>
  );
}
