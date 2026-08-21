import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PresupuestoForm } from "./PresupuestoForm";
import { QuoteClosedView } from "./QuoteClosedView";

// Link privado de un presupuesto puntual — no tiene que aparecer en
// buscadores ni compartir su URL con nadie que no sea el cliente dueño.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const OPEN_STATUSES = new Set(["borrador", "enviado"]);

export default async function PresupuestoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, quote_number, status, total, deposit_amount, deposit_percent, order_id")
    .eq("public_token", token)
    .single();

  if (error || !quote) {
    notFound();
  }

  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, logo_url")
    .eq("id", 1)
    .single();

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const logoUrl = settings?.logo_url ?? null;

  if (!OPEN_STATUSES.has(quote.status)) {
    let orderToken: string | null = null;
    if (quote.order_id) {
      const { data: order } = await supabase
        .from("orders")
        .select("public_token")
        .eq("id", quote.order_id)
        .single();
      orderToken = order?.public_token ?? null;
    }

    return (
      <QuoteClosedView
        quoteNumber={quote.quote_number}
        status={quote.status}
        total={Number(quote.total)}
        depositAmount={Number(quote.deposit_amount)}
        depositPercent={Number(quote.deposit_percent)}
        businessName={businessName}
        logoUrl={logoUrl}
        orderToken={orderToken}
      />
    );
  }

  const { data: items } = await supabase
    .from("quote_items")
    .select("id, description, unit_price, quantity")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      {logoUrl && (
        <div className="mb-6 inline-flex rounded-lg bg-black px-5 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={businessName} className="h-10 w-auto object-contain" />
        </div>
      )}
      <h1 className="text-2xl font-semibold text-zinc-900">Presupuesto {quote.quote_number}</h1>
      <p className="mt-2 text-zinc-600">
        Revisá y ajustá las cantidades que necesitás de cada artículo. Podés volver a este link
        para corregir mientras no confirmemos tu pedido.
      </p>

      {(items ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-zinc-400">Todavía no cargamos los artículos de este presupuesto.</p>
      ) : (
        <PresupuestoForm
          token={token}
          items={(items ?? []).map((i) => ({ id: i.id, description: i.description, unitPrice: Number(i.unit_price), quantity: i.quantity }))}
          depositPercent={Number(quote.deposit_percent)}
        />
      )}
    </div>
  );
}
