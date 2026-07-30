import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { PedidosTable } from "./PedidosTable";

export default async function PedidosPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, public_token, status, contact_name, team_or_group_name, estimated_delivery_date, created_at")
    .order("created_at", { ascending: false });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description="Los pedidos nacen desde un presupuesto aprobado. Andá a Presupuestos para generar uno nuevo."
      />
      <PedidosTable orders={orders ?? []} siteUrl={siteUrl} />
    </div>
  );
}
