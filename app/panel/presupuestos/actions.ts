"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

// Guarda un cliente nuevo en la base al toque, desde el modal de "Nuevo
// presupuesto" — a diferencia de `createCustomer` (en clientes/actions.ts)
// esta NO redirige a ningún lado, para no sacar al usuario del modal. Se
// llama directo (no como form action) y devuelve el cliente creado para
// que el modal lo pueda seleccionar automáticamente.
export async function createClientInline(input: {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}) {
  await requireTeamMember();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) throw new Error("Falta el nombre del cliente");

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      contact_name: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
    })
    .select("id, name")
    .single();

  if (error || !data) throw new Error("No se pudo guardar el cliente: " + (error?.message ?? ""));

  revalidatePath("/panel/clientes");
  return data;
}

// Crea el presupuesto y sus artículos en un solo paso, desde el modal de
// "Nuevo presupuesto" — el cliente puede ser uno ya cargado o uno nuevo
// (se crea acá mismo, sin salir del modal). `items` viaja como primer
// argumento "bindeado" al form action (así el modal puede armar la lista
// en el cliente sin depender de inputs ocultos serializados a mano).
export async function createQuoteWithItems(
  items: {
    description: string;
    unitPrice: number;
    quantity: number;
    articleTypeId: string | null;
    requiresNumber: boolean;
    requiresName: boolean;
  }[],
  formData: FormData
) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  let clientId = String(formData.get("client_id") || "");
  const newClientName = String(formData.get("new_client_name") || "").trim();

  if (!clientId && newClientName) {
    const { data: newClientRow, error: clientError } = await supabase
      .from("clients")
      .insert({
        name: newClientName,
        contact_name: String(formData.get("new_client_contact") || "").trim() || null,
        phone: String(formData.get("new_client_phone") || "").trim() || null,
        email: String(formData.get("new_client_email") || "").trim() || null,
      })
      .select("id")
      .single();
    if (clientError || !newClientRow) {
      throw new Error("No se pudo crear el cliente: " + (clientError?.message ?? ""));
    }
    clientId = newClientRow.id;
  }

  if (!clientId) throw new Error("Elegí un cliente o cargá uno nuevo");

  const depositPercent = Number(formData.get("deposit_percent") || 50);
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const accentColor = String(formData.get("accent_color") || "").trim() || null;

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      client_id: clientId,
      items_description: String(formData.get("items_description") || "").trim() || null,
      fabric: String(formData.get("fabric") || "").trim() || null,
      color_scheme: String(formData.get("color_scheme") || "").trim() || null,
      accent_color: accentColor,
      subtotal: total,
      total,
      deposit_percent: depositPercent,
      deposit_amount: (total * depositPercent) / 100,
      valid_until: String(formData.get("valid_until") || "") || null,
      notes: String(formData.get("notes") || "").trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (quoteError || !quote) throw new Error("No se pudo crear el presupuesto: " + (quoteError?.message ?? ""));

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("quote_items").insert(
      items.map((item, i) => ({
        quote_id: quote.id,
        description: item.description,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        article_type_id: item.articleTypeId,
        requires_number: item.requiresNumber,
        requires_name: item.requiresName,
        sort_order: i,
      }))
    );
    if (itemsError) {
      throw new Error("El presupuesto se creó pero hubo un error al cargar los artículos: " + itemsError.message);
    }
  }

  revalidatePath("/panel/presupuestos");
  redirect(`/panel/presupuestos/${quote.id}`);
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
      accent_color: String(formData.get("accent_color") || "").trim() || null,
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
// Exportada porque también la usa el link público (app/presupuesto/[token])
// cuando el cliente confirma sus cantidades.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalcQuoteTotals(quoteId: string, supabaseClient?: SupabaseClient<any, any, any>) {
  const supabase = supabaseClient ?? (await createClient());

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
  const articleTypeId = String(formData.get("article_type_id") || "") || null;

  const { data: existing } = await supabase.from("quote_items").select("id").eq("quote_id", quoteId);

  const { error } = await supabase.from("quote_items").insert({
    quote_id: quoteId,
    description,
    unit_price: unitPrice,
    quantity,
    article_type_id: articleTypeId,
    requires_number: formData.get("requires_number") === "on",
    requires_name: formData.get("requires_name") === "on",
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
  const articleTypeId = String(formData.get("article_type_id") || "") || null;

  const { error } = await supabase
    .from("quote_items")
    .update({
      description,
      unit_price: unitPrice,
      quantity,
      article_type_id: articleTypeId,
      requires_number: formData.get("requires_number") === "on",
      requires_name: formData.get("requires_name") === "on",
    })
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

// Borra el presupuesto y sus artículos (cascada por FK). Si ya generó un
// pedido, el pedido NO se borra — solo pierde el vínculo al presupuesto.
export async function deleteQuote(quoteId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
  if (error) throw new Error("No se pudo borrar el presupuesto: " + error.message);
  revalidatePath("/panel/presupuestos");
}

// El punto de inflexión del flujo: acá se genera el pedido a partir de un
// presupuesto ya acordado con el cliente. Copia tela/color/moldería al
// pedido para no tener que volver a cargarlas, y "congela" por cada
// artículo si el cliente va a tener que cargar nombre/número (una fila por
// persona) o solo cantidad por talle — lo que el admin confirmó en el
// modal justo antes de generar el link.
export async function generateOrderFromQuote(
  requirements: {
    description: string;
    articleTypeId: string | null;
    requiresNumber: boolean;
    requiresName: boolean;
    quantityQuoted: number;
    unitPrice: number;
  }[],
  quoteId: string
) {
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

  if (requirements.length > 0) {
    const { error: reqError } = await supabase.from("order_article_requirements").insert(
      requirements.map((r, i) => ({
        order_id: order.id,
        description: r.description,
        article_type_id: r.articleTypeId,
        requires_number: r.requiresNumber,
        requires_name: r.requiresName,
        quantity_quoted: r.quantityQuoted,
        unit_price: r.unitPrice,
        sort_order: i,
      }))
    );
    if (reqError) {
      throw new Error("El pedido se creó pero hubo un error al preparar los artículos: " + reqError.message);
    }
  }

  await supabase
    .from("quotes")
    .update({ order_id: order.id, status: "aprobado", approved_at: new Date().toISOString() })
    .eq("id", quoteId);

  revalidatePath(`/panel/presupuestos/${quoteId}`);
  revalidatePath("/panel/pedidos");
  redirect(`/panel/pedidos/${order.id}`);
}

// Mockup opcional (PNG) que se embebe en el PDF del presupuesto — no es
// obligatorio, sirve para mandarle al cliente una vista previa del diseño
// junto con los precios.
export async function uploadQuoteMockup(quoteId: string, formData: FormData) {
  await requireTeamMember();
  const admin = createAdminClient();

  const file = formData.get("mockup") as File | null;
  if (!file || file.size === 0) throw new Error("Falta la imagen");
  if (file.size > 8 * 1024 * 1024) throw new Error("La imagen no puede pesar más de 8 MB");

  const path = `quote-mockups/${quoteId}/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await admin.storage
    .from("site-assets")
    .upload(path, file, { contentType: file.type || "image/png", upsert: false });
  if (uploadError) throw new Error("No se pudo subir la imagen: " + uploadError.message);

  const { data } = admin.storage.from("site-assets").getPublicUrl(path);

  const { error } = await admin.from("quotes").update({ mockup_url: data.publicUrl }).eq("id", quoteId);
  if (error) throw new Error("No se pudo guardar el mockup: " + error.message);

  revalidatePath(`/panel/presupuestos/${quoteId}`);
}

export async function removeQuoteMockup(quoteId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").update({ mockup_url: null }).eq("id", quoteId);
  if (error) throw new Error("No se pudo quitar el mockup: " + error.message);
  revalidatePath(`/panel/presupuestos/${quoteId}`);
}

// Nota interna: solo el equipo la ve, nunca se muestra al cliente (ni en el
// PDF ni en el link público). Es de solo alta — no hay update/delete acá a
// propósito, para mantener la trazabilidad completa del presupuesto.
export async function createQuoteNote(quoteId: string, body: string) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  const text = body.trim();
  if (!text) throw new Error("Escribí algo antes de guardar");

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

  const { error } = await supabase.from("internal_notes").insert({
    quote_id: quoteId,
    author_id: user.id,
    author_name: profile?.full_name ?? user.email ?? "Equipo",
    body: text,
  });
  if (error) throw new Error("No se pudo guardar la nota: " + error.message);

  revalidatePath(`/panel/presupuestos/${quoteId}`);
}
