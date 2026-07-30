import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateOrderFromQuote } from "../actions";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { QuoteDetail } from "./QuoteDetail";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, clients(name)")
    .eq("id", id)
    .single();

  if (!quote) notFound();

  const clientName = (quote.clients as unknown as { name: string } | null)?.name ?? "—";

  return (
    <div>
      <PageHeader
        title={`Presupuesto ${quote.quote_number}`}
        description={`Cliente: ${clientName}`}
        action={
          <a href={`/api/presupuestos/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="secondary">
              Descargar PDF
            </Button>
          </a>
        }
      />

      <div className="flex max-w-2xl flex-col gap-6">
        <QuoteDetail quote={quote} />

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">Generar pedido</h2>
          {quote.order_id ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">Ya se generó el pedido para este presupuesto.</p>
              <Link href={`/panel/pedidos/${quote.order_id}`}>
                <Button type="button" variant="secondary">
                  Ver pedido
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-500">
                Cuando el cliente acepte este presupuesto, generá el pedido: se crea con la
                tela/color/moldería ya cargados y te lleva directo a su link.
              </p>
              <form action={generateOrderFromQuote.bind(null, quote.id)}>
                <Button type="submit">Generar pedido</Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
