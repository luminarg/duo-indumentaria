"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

export async function createQuote(formData: FormData) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  const clientId = String(formData.get("client_id") || "");
  if (!clientId) throw new Error("Elegí un cliente");

  const itemsDescription = String(formData.get("items_description") || "").trim() || null;
  const fabric = String(formData.get("fabric") || "").trim() || null;
  const colorScheme = String(formData.get("color_scheme") || "").trim() || null;
  const patternNotes = String(formData.get("pattern_notes") || "").trim() || null;
  const total = Number(formData.get("total") || 0);
  const depositPercent = Number(formData.get("deposit_percent") || 50);
  const validUntil = String(formData.get("valid_until") || "") || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      client_id: clientId,
      items_description: itemsDescription,
      fabric,
      color_scheme: colorScheme,
      pattern_notes: patternNotes,
      subtotal: total,
      total,
      deposit_percent: depositPercent,
      deposit_amount: (total * depositPercent) / 100,
      valid_until: validUntil,
      notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("No se pudo crear el presupuesto: " + (error?.message ?? ""));

  revalidatePath("/panel/presupuestos");
  redirect(`/panel/presupuestos/${data.id}`);
}

export async function updateQuote(quoteId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const total = Number(formData.get("total") || 0);
  const depositPercent = Number(formData.get("deposit_percent") || 50);

  const { error } = await supabase
    .from("quotes")
    .update({
      items_description: String(formData.get("items_description") || "").trim() || null,
      fabric: String(formData.get("fabric") || "").trim() || null,
      color_scheme: String(formData.get("color_scheme") || "").trim() || null,
      pattern_notes: String(formData.get("pattern_notes") || "").trim() || null,
      total,
      subtotal: total,
      deposit_percent: depositPercent,
      deposit_amount: (total * depositPercent) / 100,
      valid_until: String(formData.get("valid_until") || "") || null,
      notes: String(formData.get("notes") || "").trim() || null,
      status: String(formData.get("status") || "borrador"),
    })
    .eq("id", quoteId);

  if (error) throw new Error("No se pudo guardar: " + error.message);
  revalidatePath(`/panel/presupuestos/${quoteId}`);
}

// El punto de inflexión del flujo: acá se genera el pedido a partir de un
// presupuesto ya acordado con el cliente. Copia tela/color/moldería al
// pedido para no tener que volver a cargarlas.
export async function generateOrderFromQuote(quoteId: string) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, client_id, fabric, color_scheme, pattern_notes, order_id, clients(name)")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) throw new Error("No se encontró el presupuesto");
  if (quote.order_id) redirect(`/panel/pedidos/${quote.order_id}`);

  const clientName = (quote.clients as unknown as { name: string } | null)?.name ?? null;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      client_id: quote.client_id,
      team_or_group_name: clientName,
      created_by: user.id,
      status: "borrador",
    })
    .select("id")
    .single();

  if (orderError || !order) throw new Error("No se pudo crear el pedido: " + (orderError?.message ?? ""));

  await supabase.from("order_technical_details").insert({
    order_id: order.id,
    fabric: quote.fabric,
    color_scheme: quote.color_scheme,
    pattern_notes: quote.pattern_notes,
  });

  await supabase
    .from("quotes")
    .update({ order_id: order.id, status: "aprobado", approved_at: new Date().toISOString() })
    .eq("id", quoteId);

  revalidatePath(`/panel/presupuestos/${quoteId}`);
  revalidatePath("/panel/pedidos");
  redirect(`/panel/pedidos/${order.id}`);
}
