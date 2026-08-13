import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { ComprasManager } from "./ComprasManager";

type QuoteAmounts = { total: number; deposit_amount: number } | null;

function firstQuote(q: unknown): QuoteAmounts {
  if (!q) return null;
  const quote = Array.isArray(q) ? q[0] : q;
  if (!quote) return null;
  return { total: Number(quote.total ?? 0), deposit_amount: Number(quote.deposit_amount ?? 0) };
}

export default async function ComprasPage() {
  const supabase = await createClient();

  const [{ data: purchasesRaw }, { data: suppliers }, { data: orders }, { data: depositOrders }, { data: deliveredOrders }] =
    await Promise.all([
      supabase
        .from("purchases")
        .select("id, description, category, budgeted_cost, real_cost, purchase_date, suppliers(name), orders(order_number)")
        .order("purchase_date", { ascending: false }),
      supabase.from("suppliers").select("id, name, contact_name, phone").order("name", { ascending: true }),
      supabase.from("orders").select("id, order_number").order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, order_number, team_or_group_name, deposit_paid_at, quotes(deposit_amount)")
        .not("deposit_paid_at", "is", null)
        .order("deposit_paid_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, order_number, team_or_group_name, delivered_at, quotes(total, deposit_amount)")
        .not("delivered_at", "is", null)
        .order("delivered_at", { ascending: false }),
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

  // Ingresos: se calculan solos a partir de los hitos del pedido — no se
  // cargan a mano. Seña cobrada cuando el pedido pasa a "señado", saldo
  // cobrado cuando se marca "entregado" — cruzando con el presupuesto que
  // lo generó.
  const depositIncome = (depositOrders ?? [])
    .map((o) => {
      const quote = firstQuote(o.quotes);
      if (!quote || quote.deposit_amount <= 0) return null;
      return {
        id: `${o.id}-sena`,
        date: o.deposit_paid_at as string,
        description: `Seña — Pedido ${o.order_number}`,
        clientName: o.team_or_group_name,
        amount: quote.deposit_amount,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const balanceIncome = (deliveredOrders ?? [])
    .map((o) => {
      const quote = firstQuote(o.quotes);
      if (!quote) return null;
      const saldo = quote.total - quote.deposit_amount;
      if (saldo <= 0) return null;
      return {
        id: `${o.id}-saldo`,
        date: o.delivered_at as string,
        description: `Saldo — Pedido ${o.order_number}`,
        clientName: o.team_or_group_name,
        amount: saldo,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const income = [...depositIncome, ...balanceIncome].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <PageHeader
        title="Caja"
        description="Ingresos por pedidos (automáticos) y gastos, todo en una pantalla."
      />
      <ComprasManager purchases={purchases} suppliers={suppliers ?? []} orders={orders ?? []} income={income} />
    </div>
  );
}
