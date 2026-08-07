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
  const depositPercent = Number(formData.get("deposit_percent") || 50);
  const validUntil = String(formData.get("valid_until") || "") || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  // El total arranca en 0 — se carga agregando artículos (precio unitario x
  // cantidad) desde el detalle del presupuesto, no acá.
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      client_id: clientId,
      items_description: itemsDescription,
      fabric,
      color_scheme: colorScheme,
      pattern_notes: patternNotes,
      subtotal: 0,
      total: 0,
      deposit_percent: depositPercent,
      deposit_amount: 0,
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

  const depositPercent = Number(formData.get("deposit_percent") || 50);

  // El total ya no se carga a mano acá — sale de la suma de quote_items.
  // Solo recalculamos la seña por si cambió el %.
  const { data: current } = await supabase.from("quotes").select("total").eq("id", quoteId).single();
  const total = Number(current?.total ?? 0);

  const { error } = await supabase
    .from("quotes")
    .update({
      items_description: String(formData.get("items_description") || "").trim() || null,
      fabric: String(formData.get("fabric") || "").trim() || null,
      color_scheme: String(formData.get("color_scheme") || "").trim() || null,
      pattern_notes: String(formData.get("pattern_notes") || "").trim() || null,
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

// Recalcula total/subtotal/seña del presupuesto a partir de la suma de sus
// artículos — se llama después de cualquier alta/edición/borrado de ítem.
async function recalcQuoteTotals(quoteId: string) {
  const supabase = await createClient();

  const [{ data: items }, { data: quote }] = await Promise.all([
    supabase.from("quote_items").select("unit_price, quantity").eq("quote_id", quoteId),
    supabase.from("quotes").select("deposit_percent").eq("id", quoteId).single(),
  ]);

  const total = (items ?? []).reduce((sum, i) => sum + Number(i.unit_price) * Number(i.quantity), 0);
  const depositPercent = Number(quote?.deposit_percent ?? 50);

  await supabase
    .from("quotes")
    .update({ total, subtotal: total, deposit_amount: (total * depositPercent) / 100 })
    .eq("id", quoteId);
}

export async function createQuoteItem(quoteId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const description = String(formData.get("description") || "").trim();
  if (!description) throw new Error("Falta la descripción del artículo");
  const unitPrice = Number(formData.get("unit_price") || 0);
  const quantity = Number(formData.get("quantity") || 1);

  const { data: existing } = await supabase.from("quote_items").select("id").eq("quote_id", quoteId);

  const { error } = await supabase.from("quote_items").insert({
    quote_id: quoteId,
    description,
    unit_price: unitPrice,
    quantity,
    sort_order: existing?.length ?? 0,
  });
  if (error) throw new Error("No se pudo agregar el artículo: " + error.message);

  await recalcQuoteTotals(quoteId);
  revalidatePath(`/panel/presupuestos/${quoteId}`);
}

export async function updateQuoteItem(itemId: string, quoteId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const description = String(formData.get("description") || "").trim();
  if (!description) throw new Error("Falta la descripción del artículo");
  const unitPrice = Number(formData.get("unit_price") || 0);
  const quantity = Number(formData.get("quantity") || 1);

  const { error } = await supabase
    .from("quote_items")
    .update({ description, unit_price: unitPrice, quantity })
    .eq("id", itemId);
  if (error) throw new Error("No se pudo guardar el artículo: " + error.message);

  await recalcQuoteTotals(quoteId);
  revalidatePath(`/panel/presupuestos/${quoteId}`);
}

export async function deleteQuoteItem(itemId: string, quoteId: string) {
  await requireTeamMember();
  const supabase = await createClient();

  const { error } = await supabase.from("quote_items").delete().eq("id", itemId);
  if (error) throw new Error("No se pudo borrar el artículo: " + error.message);

  await recalcQuoteTotals(quoteId);
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
