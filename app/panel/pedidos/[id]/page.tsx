import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { ShareOrderLink } from "../../../components/ui/ShareOrderLink";
import { OrderDetail } from "./OrderDetail";
import { DeleteOrderButton } from "./DeleteOrderButton";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: order }, { data: details }, { data: items }, { data: resources }, { data: requirements }, { data: notes }] =
    await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      supabase.from("order_technical_details").select("*").eq("order_id", id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id),
      supabase.from("order_resources").select("*").eq("order_id", id).order("uploaded_at", { ascending: false }),
      supabase.from("order_article_requirements").select("id, description, unit_price").eq("order_id", id),
      supabase.from("internal_notes").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    ]);

  if (!order) notFound();

  // El % de seña vive en el presupuesto que originó este pedido, no en el
  // pedido en sí — lo buscamos por la relación inversa quotes.order_id.
  const { data: sourceQuote } = await supabase
    .from("quotes")
    .select("deposit_percent")
    .eq("order_id", id)
    .maybeSingle();
  const depositPercent = sourceQuote ? Number(sourceQuote.deposit_percent) : null;

  // Mapa id de requisito → descripción + precio unitario del artículo, para
  // mostrar qué artículo del presupuesto corresponde a cada prenda cargada
  // y poder calcular subtotales/total.
  const requirementInfo = Object.fromEntries(
    (requirements ?? []).map((r) => [r.id, { description: r.description, unitPrice: Number(r.unit_price) }])
  );

  // Los recursos están en un bucket privado — generamos URLs firmadas
  // (1 hora) solo para esta vista, en vez de exponerlos públicamente.
  const admin = createAdminClient();
  const resourcesWithUrls = await Promise.all(
    (resources ?? []).map(async (r) => {
      const { data: signed } = await admin.storage
        .from("order-resources")
        .createSignedUrl(r.file_url, 60 * 60);
      return { ...r, signedUrl: signed?.signedUrl ?? null };
    })
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const orderLink = `${siteUrl}/pedido/${order.public_token}`;

  return (
    <div>
      <PageHeader
        title={`Pedido ${order.order_number}`}
        description={`Link para el cliente: ${orderLink}`}
        action={
          <div className="flex items-center gap-2">
            <ShareOrderLink
              link={orderLink}
              orderNumber={order.order_number}
              contactPhone={order.contact_phone}
            />
            <a href={`/api/pedidos/${order.id}/informe`} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary">
                Descargar informe
              </Button>
            </a>
            <DeleteOrderButton orderId={order.id} orderNumber={order.order_number} />
          </div>
        }
      />
      <OrderDetail
        order={order}
        details={details}
        items={items ?? []}
        resources={resourcesWithUrls}
        requirementInfo={requirementInfo}
        depositPercent={depositPercent}
        notes={notes ?? []}
      />
    </div>
  );
}
