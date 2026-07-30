import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { OrderDetail } from "./OrderDetail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: order }, { data: details }, { data: items }, { data: resources }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_technical_details").select("*").eq("order_id", id).maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", id),
    supabase.from("order_resources").select("*").eq("order_id", id).order("uploaded_at", { ascending: false }),
  ]);

  if (!order) notFound();

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

  return (
    <div>
      <PageHeader
        title={`Pedido ${order.order_number}`}
        description={`Link para el cliente: ${siteUrl}/pedido/${order.public_token}`}
        action={
          <a href={`/api/pedidos/${order.id}/informe`} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="secondary">
              Descargar informe
            </Button>
          </a>
        }
      />
      <OrderDetail order={order} details={details} items={items ?? []} resources={resourcesWithUrls} />
    </div>
  );
}
