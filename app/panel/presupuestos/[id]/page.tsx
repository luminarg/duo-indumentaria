import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { ShareQuoteLink } from "../../../components/ui/ShareQuoteLink";
import { QuoteDetail } from "./QuoteDetail";
import { QuoteItemsManager } from "./QuoteItemsManager";
import { DeleteQuoteButton } from "./DeleteQuoteButton";
import { GenerateOrderButton } from "./GenerateOrderButton";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quote }, { data: items }, { data: articleTypes }] = await Promise.all([
    supabase.from("quotes").select("*, clients(name, phone)").eq("id", id).single(),
    supabase.from("quote_items").select("*").eq("quote_id", id).order("sort_order", { ascending: true }),
    supabase
      .from("article_types")
      .select("id, name, requires_number, requires_name")
      .order("sort_order", { ascending: true }),
  ]);

  if (!quote) notFound();

  const client = quote.clients as unknown as { name: string; phone: string | null } | null;
  const clientName = client?.name ?? "—";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const quoteLink = `${siteUrl}/presupuesto/${quote.public_token}`;

  return (
    <div>
      <PageHeader
        title={`Presupuesto ${quote.quote_number}`}
        description={`Cliente: ${clientName}`}
        action={
          <div className="flex items-center gap-2">
            <ShareQuoteLink link={quoteLink} quoteNumber={quote.quote_number} contactPhone={client?.phone} />
            <a href={`/api/presupuestos/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary">
                Descargar PDF
              </Button>
            </a>
            <DeleteQuoteButton quoteId={quote.id} quoteNumber={quote.quote_number} />
          </div>
        }
      />

      <div className="flex max-w-2xl flex-col gap-6">
        <QuoteDetail quote={quote} />

        <QuoteItemsManager quoteId={quote.id} items={items ?? []} articleTypes={articleTypes ?? []} />

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
              <GenerateOrderButton quoteId={quote.id} items={items ?? []} articleTypes={articleTypes ?? []} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
