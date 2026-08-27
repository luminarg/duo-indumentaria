import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PedidoForm } from "./PedidoForm";
import { OrderTrackingView } from "./OrderTrackingView";

// Link privado de un pedido puntual — no tiene que aparecer en buscadores
// ni compartir su URL con nadie que no sea el cliente dueño del link.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Página pública SIN LOGIN. El cliente llega acá con el link que le mandó
// el hermano por WhatsApp: /pedido/<token>. Buscamos el pedido por token
// usando el cliente admin (service role) — no se expone la tabla completa.
export default async function PedidoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, team_or_group_name, contact_name, contact_phone, contact_email, general_notes, estimated_delivery_date"
    )
    .eq("public_token", token)
    .single();

  if (error || !order) {
    notFound();
  }

  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, logo_url, primary_color")
    .eq("id", 1)
    .single();

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const logoUrl = settings?.logo_url ?? null;
  const primaryColor = settings?.primary_color ?? "#0a0a0a";

  if (order.status !== "borrador" && order.status !== "cargado_por_cliente") {
    return (
      <OrderTrackingView
        orderNumber={order.order_number}
        status={order.status}
        estimatedDeliveryDate={order.estimated_delivery_date ?? null}
        businessName={businessName}
        logoUrl={logoUrl}
        primaryColor={primaryColor}
      />
    );
  }

  // Recursos ya subidos (logo a estampar, mockups, referencias) — están en
  // un bucket privado, generamos URLs firmadas solo para esta vista.
  const { data: resources } = await supabase
    .from("order_resources")
    .select("*")
    .eq("order_id", order.id)
    .order("uploaded_at", { ascending: false });

  const resourcesWithUrls = await Promise.all(
    (resources ?? []).map(async (r) => {
      const { data: signed } = await supabase.storage.from("order-resources").createSignedUrl(r.file_url, 60 * 60);
      return { ...r, signedUrl: signed?.signedUrl ?? null };
    })
  );

  // Qué debe completar el cliente por cada artículo (definido por el admin
  // al generar el pedido) + la guía de talles de cada tipo de artículo, y lo
  // que el cliente ya haya cargado antes (por si vuelve a editar).
  const [{ data: requirementsRaw }, { data: existingItems }] = await Promise.all([
    supabase
      .from("order_article_requirements")
      .select("*, article_types(id, name, article_type_sizes(id, label, measurements, sort_order))")
      .eq("order_id", order.id)
      .order("sort_order", { ascending: true }),
    supabase.from("order_items").select("*").eq("order_id", order.id),
  ]);

  // El % de seña y el mockup viven en el presupuesto que originó este pedido.
  const { data: sourceQuote } = await supabase
    .from("quotes")
    .select("deposit_percent, mockup_url")
    .eq("order_id", order.id)
    .maybeSingle();
  const depositPercent = sourceQuote ? Number(sourceQuote.deposit_percent) : null;
  const mockupUrl = sourceQuote?.mockup_url ?? null;

  const requirements = (requirementsRaw ?? []).map((r) => {
    const articleType = r.article_types as unknown as {
      id: string;
      name: string;
      article_type_sizes: { id: string; label: string; measurements: string | null; sort_order: number }[];
    } | null;
    return {
      id: r.id,
      description: r.description,
      requiresNumber: r.requires_number,
      requiresName: r.requires_name,
      quantityQuoted: r.quantity_quoted,
      unitPrice: Number(r.unit_price),
      sizes: (articleType?.article_type_sizes ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ label: s.label, measurements: s.measurements })),
      existingItems: (existingItems ?? [])
        .filter((it) => it.requirement_id === r.id)
        .map((it) => ({
          size: it.size_label ?? "",
          individualName: it.individual_name ?? "",
          individualNumber: it.individual_number ?? "",
          quantity: it.quantity,
        })),
    };
  });

  // Prendas cargadas sin pasar por un artículo del presupuesto (pedidos
  // viejos, de antes de esta función) — se muestran igual, en modo libre.
  const legacyItems = (existingItems ?? [])
    .filter((it) => !it.requirement_id)
    .map((it) => ({
      size: it.size_label ?? "",
      individualName: it.individual_name ?? "",
      individualNumber: it.individual_number ?? "",
      quantity: it.quantity,
    }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      {logoUrl && (
        <div className="mb-6 inline-flex rounded-lg bg-black px-5 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={businessName} className="h-10 w-auto object-contain" />
        </div>
      )}
      <h1 className="text-2xl font-semibold text-zinc-900">
        Pedido {order.order_number}
      </h1>
      <p className="mt-2 text-zinc-600">
        Completá los datos de tu pedido. Podés volver a este link para revisar
        o corregir mientras no esté confirmado.
      </p>

      {mockupUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mockupUrl}
          alt="Mockup del diseño"
          className="mt-4 max-h-64 w-full rounded-lg border border-zinc-200 object-contain"
        />
      )}

      <PedidoForm
        orderId={order.id}
        token={token}
        defaultValues={order}
        resources={resourcesWithUrls}
        requirements={requirements}
        legacyItems={legacyItems}
        depositPercent={depositPercent}
      />
    </div>
  );
}
