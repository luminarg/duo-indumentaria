import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { PresupuestosTable } from "./PresupuestosTable";
import { NewQuoteButton } from "./NewQuoteButton";

export default async function PresupuestosPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: quotes }, { data: articleTypes }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase
      .from("quotes")
      .select("id, quote_number, status, total, order_id, accent_color, clients(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("article_types")
      .select("id, name, requires_number, requires_name")
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Presupuestos"
        description="Cargá acá lo que pidió el cliente. Cuando lo acuerden, generás el pedido desde el presupuesto."
        action={<NewQuoteButton clients={clients ?? []} articleTypes={articleTypes ?? []} />}
      />

      <PresupuestosTable
        quotes={(quotes ?? []).map((q) => ({
          id: q.id,
          quote_number: q.quote_number,
          status: q.status,
          total: q.total,
          order_id: q.order_id,
          accentColor: q.accent_color,
          clientName: (q.clients as unknown as { name: string } | null)?.name ?? null,
        }))}
      />
    </div>
  );
}
