import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { ComprasManager } from "./ComprasManager";

export default async function ComprasPage() {
  const supabase = await createClient();

  const [{ data: purchasesRaw }, { data: suppliers }, { data: orders }] = await Promise.all([
    supabase
      .from("purchases")
      .select("id, description, category, budgeted_cost, real_cost, purchase_date, suppliers(name), orders(order_number)")
      .order("purchase_date", { ascending: false }),
    supabase.from("suppliers").select("id, name, contact_name, phone").order("name", { ascending: true }),
    supabase.from("orders").select("id, order_number").order("created_at", { ascending: false }),
  ]);

  const purchases = (purchasesRaw ?? []).map((p) => ({
    id: p.id,
    description: p.description,
    category: p.category,
    budgeted_cost: Number(p.budgeted_cost ?? 0),
    real_cost: Number(p.real_cost ?? 0),
    purchase_date: p.purchase_date,
    supplierName: (p.suppliers as unknown as { name: string } | null)?.name ?? null,
    orderNumber: (p.orders as unknown as { order_number: string } | null)?.order_number ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Compras y gastos"
        description="Costo real vs. presupuestado, con o sin proveedor y pedido asociado."
      />
      <ComprasManager purchases={purchases} suppliers={suppliers ?? []} orders={orders ?? []} />
    </div>
  );
}
