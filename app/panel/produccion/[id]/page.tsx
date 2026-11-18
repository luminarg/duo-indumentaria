import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import type { AssemblyRow, OrderItemRow, PatternPieceRow } from "@/lib/produccion/db";
import { ProductionWorkbench } from "./ProductionWorkbench";

export default async function ProduccionPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: order }, { data: items }, { data: requirements }, { data: sizes }, { data: models }, { data: designs }, { data: layouts }] =
    await Promise.all([
      supabase.from("orders").select("id, order_number, status, team_or_group_name, contact_name").eq("id", id).single(),
      supabase
        .from("order_items")
        .select("id, size_id, size_label, individual_name, individual_number, quantity, variant, requirement_id")
        .eq("order_id", id),
      supabase
        .from("order_article_requirements")
        .select("id, description, article_type_id")
        .eq("order_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("sizes").select("id, label"),
      supabase.from("pattern_models").select("id, name, neck, base_size_label, article_type_id").eq("active", true).order("name"),
      supabase
        .from("order_designs")
        .select("id, requirement_id, model_id, variant, version, config, created_at")
        .eq("order_id", id)
        .order("version", { ascending: false }),
      supabase
        .from("production_layouts")
        .select("id, linear_meters, piece_count, pdf_path, created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!order) notFound();

  const modelIds = (models ?? []).map((m) => m.id);
  const [{ data: pieces }, { data: assembly }] = modelIds.length
    ? await Promise.all([
        supabase
          .from("pattern_pieces")
          .select("id, model_id, size_label, kind, name, outline, shoulder_point, baseline_y")
          .in("model_id", modelIds),
        supabase.from("model_assembly").select("model_id, kind, align_mode, align_to_kind, offset_x, offset_y").in("model_id", modelIds),
      ])
    : [{ data: [] }, { data: [] }];

  const sizeLabels = Object.fromEntries((sizes ?? []).map((s) => [s.id, s.label]));

  return (
    <div>
      <PageHeader
        title={`Producción · ${order.order_number}`}
        description={order.team_or_group_name || order.contact_name || undefined}
        action={
          <div className="flex items-center gap-3">
            <Badge status={order.status} />
            <Link href={`/panel/pedidos/${order.id}`} className="text-sm text-zinc-500 hover:underline">
              Ver pedido
            </Link>
          </div>
        }
      />
      <ProductionWorkbench
        orderId={order.id}
        orderStatus={order.status}
        items={(items ?? []) as OrderItemRow[]}
        sizeLabels={sizeLabels}
        requirements={requirements ?? []}
        models={models ?? []}
        pieces={(pieces ?? []) as PatternPieceRow[]}
        assembly={(assembly ?? []) as (AssemblyRow & { model_id: string })[]}
        designs={designs ?? []}
        layouts={layouts ?? []}
      />
    </div>
  );
}
