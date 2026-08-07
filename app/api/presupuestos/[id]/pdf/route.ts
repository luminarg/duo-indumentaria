import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotePdfDocument } from "@/lib/pdf/QuotePdfDocument";

export const runtime = "nodejs";

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

  const client = quote.clients as unknown as {
    name: string;
    contact_name: string | null;
    contact_role: string | null;
    phone: string | null;
    email: string | null;
  } | null;

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
        primaryColor: settings?.primary_color ?? "#0a0a0a",
        secondaryColor: settings?.secondary_color ?? "#dc2626",
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
      client: {
        name: client?.name ?? "—",
        contactName: client?.contact_name ?? null,
        contactRole: client?.contact_role ?? null,
        phone: client?.phone ?? null,
        email: client?.email ?? null,
      },
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quote_number}.pdf"`,
    },
  });
}
