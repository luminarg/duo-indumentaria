import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import { ClienteDetail } from "./ClienteDetail";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: quotes }, { data: orders }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("quotes")
      .select("id, quote_number, status, total, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, order_number, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!client) notFound();

  return (
    <div>
      <PageHeader title={client.name} description="Datos del cliente e historial." />
      <div className="flex max-w-3xl flex-col gap-6">
        <ClienteDetail client={client} />

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Presupuestos</h2>
          {quotes && quotes.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {quotes.map((q) => (
                <li key={q.id} className="flex justify-between border-b border-zinc-100 py-2 last:border-0">
                  <span>{q.quote_number}</span>
                  <span className="capitalize text-zinc-500">{q.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">Todavía no tiene presupuestos.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Pedidos</h2>
          {orders && orders.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex justify-between border-b border-zinc-100 py-2 last:border-0">
                  <span>{o.order_number}</span>
                  <span className="capitalize text-zinc-500">{o.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">Todavía no tiene pedidos.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
