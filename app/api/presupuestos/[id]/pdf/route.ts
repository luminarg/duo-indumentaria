import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotePdfDocument } from "@/lib/pdf/QuotePdfDocument";

export const runtime = "nodejs";

// Nombre de archivo pedido: "nombredecliente-presupuesto-dd-mm-aaaa" — sin
// acentos ni espacios, para que quede prolijo al descargarlo desde
// cualquier navegador/sistema operativo.
function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos (tras NFD quedan como marca de combinación aparte)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildQuoteFilename(clientName: string, createdAt: string) {
  const date = new Date(createdAt);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const clientSlug = slugify(clientName) || "cliente";
  return `${clientSlug}-presupuesto-${dd}-${mm}-${yyyy}.pdf`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [{ data: quote }, { data: settings }, { data: items }] = await Promise.all([
    supabase.from("quotes").select("*, clients(name, contact_name, contact_role, phone, email)").eq("id", id).single(),
    supabase.from("business_settings").select("*").eq("id", 1).single(),
    supabase.from("quote_items").select("*").eq("quote_id", id).order("sort_order", { ascending: true }),
  ]);

  if (!quote) {
    return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
  }

  // Guía de talles: un bloque por cada tipo de artículo distinto presente en
  // este presupuesto (si tiene talles configurados con medidas).
  const articleTypeIds = Array.from(
    new Set((items ?? []).map((i) => i.article_type_id).filter((v): v is string => !!v))
  );
  let sizeGuides: { name: string; sizes: { label: string; measurements: string | null }[] }[] = [];
  if (articleTypeIds.length > 0) {
    const { data: articleTypes } = await supabase
      .from("article_types")
      .select("id, name, article_type_sizes(id, label, measurements, sort_order)")
      .in("id", articleTypeIds);
    sizeGuides = (articleTypes ?? [])
      .map((at) => ({
        name: at.name,
        sizes: (at.article_type_sizes as unknown as { label: string; measurements: string | null; sort_order: number }[])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .filter((s) => s.measurements),
      }))
      .filter((g) => g.sizes.length > 0);
  }

  const client = quote.clients as unknown as {
    name: string;
    contact_name: string | null;
    contact_role: string | null;
    phone: string | null;
    email: string | null;
  } | null;

  // Si el presupuesto tiene su propio color (para que coincida con los
  // colores del club/equipo del cliente), pisa el primario y el secundario
  // del negocio para todo el documento — header y tabla de artículos.
  const customColor = quote.accent_color ?? null;

  const buffer = await renderToBuffer(
    QuotePdfDocument({
      business: {
        name: settings?.business_name ?? "Duo Indumentaria",
        logoUrl: settings?.logo_url ?? null,
        address: settings?.address ?? null,
        phone: settings?.whatsapp_number ?? null,
        email: settings?.contact_email ?? null,
        headerText: settings?.quote_header_text ?? null,
        footerText: settings?.quote_footer_text ?? null,
        primaryColor: customColor ?? settings?.primary_color ?? "#0a0a0a",
        secondaryColor: customColor ?? settings?.secondary_color ?? "#dc2626",
      },
      quote: {
        quoteNumber: quote.quote_number,
        createdAt: quote.created_at,
        validUntil: quote.valid_until,
        itemsDescription: quote.items_description,
        fabric: quote.fabric,
        colorScheme: quote.color_scheme,
        patternNotes: quote.pattern_notes,
        total: Number(quote.total),
        depositPercent: Number(quote.deposit_percent),
        depositAmount: Number(quote.deposit_amount),
        notes: quote.notes,
      },
      items: (items ?? []).map((item) => ({
        description: item.description,
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
      })),
      sizeGuides,
      client: {
        name: client?.name ?? "—",
        contactName: client?.contact_name ?? null,
        contactRole: client?.contact_role ?? null,
        phone: client?.phone ?? null,
        email: client?.email ?? null,
      },
    })
  );

  const filename = buildQuoteFilename(client?.name ?? "cliente", quote.created_at);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
