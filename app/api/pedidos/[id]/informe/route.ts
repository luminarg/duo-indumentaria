import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { OrderReportDocument } from "@/lib/pdf/OrderReportDocument";
import { fetchPrivateFileAsDataUri, guessImageMimeType } from "@/lib/pdf/fetchAsDataUri";

export const runtime = "nodejs";

const RESOURCE_LABELS: Record<string, string> = {
  mockup: "Mockup",
  logo: "Logo",
  paleta: "Paleta de colores",
  otro: "Otro",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [{ data: order }, { data: details }, { data: items }, { data: resources }, { data: settings }] =
    await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      supabase.from("order_technical_details").select("*").eq("order_id", id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id),
      supabase.from("order_resources").select("*").eq("order_id", id),
      supabase.from("business_settings").select("*").eq("id", 1).single(),
    ]);

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Las imágenes están en un bucket privado — las bajamos y convertimos a
  // data URI para poder incrustarlas directo en el PDF.
  const images: { dataUri: string; caption: string }[] = [];
  const nonImageFiles: { fileName: string; caption: string }[] = [];

  for (const resource of resources ?? []) {
    const mime = guessImageMimeType(resource.file_name);
    const caption = RESOURCE_LABELS[resource.resource_type] ?? resource.resource_type;
    if (mime) {
      const dataUri = await fetchPrivateFileAsDataUri("order-resources", resource.file_url, mime);
      if (dataUri) {
        images.push({ dataUri, caption });
        continue;
      }
    }
    nonImageFiles.push({ fileName: resource.file_name ?? resource.file_url, caption });
  }

  const buffer = await renderToBuffer(
    OrderReportDocument({
      business: {
        name: settings?.business_name ?? "Duo Indumentaria",
        logoUrl: settings?.logo_url ?? null,
        address: settings?.address ?? null,
        phone: settings?.whatsapp_number ?? null,
        email: settings?.contact_email ?? null,
      },
      order: {
        orderNumber: order.order_number,
        status: order.status,
        createdAt: order.created_at,
        teamOrGroupName: order.team_or_group_name,
        contactName: order.contact_name,
        contactPhone: order.contact_phone,
        contactEmail: order.contact_email,
        generalNotes: order.general_notes,
      },
      details: details
        ? {
            fabric: details.fabric,
            colorScheme: details.color_scheme,
            patternNotes: details.pattern_notes,
            printNotes: details.print_notes,
          }
        : null,
      items: (items ?? []).map((item) => ({
        sizeLabel: item.size_label,
        color: item.color,
        individualName: item.individual_name,
        individualNumber: item.individual_number,
        quantity: item.quantity,
      })),
      images,
      nonImageFiles,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="informe-${order.order_number}.pdf"`,
    },
  });
}
