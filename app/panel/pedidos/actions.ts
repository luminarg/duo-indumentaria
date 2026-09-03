"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Los pedidos ya no se crean sueltos acá: nacen desde un presupuesto
// aprobado (ver app/panel/presupuestos/actions.ts -> generateOrderFromQuote).
// Esta página solo lista y permite editar/gestionar los que ya existen.

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

export async function updateOrderDetails(orderId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const teamName = String(formData.get("team_or_group_name") || "").trim();
  const fabric = String(formData.get("fabric") || "").trim();
  const colorScheme = String(formData.get("color_scheme") || "").trim();
  const patternNotes = String(formData.get("pattern_notes") || "").trim();
  const printNotes = String(formData.get("print_notes") || "").trim();

  const { error: orderError } = await supabase
    .from("orders")
    .update({ team_or_group_name: teamName || null, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (orderError) throw new Error("No se pudo guardar: " + orderError.message);

  const { error: detailsError } = await supabase.from("order_technical_details").upsert({
    order_id: orderId,
    fabric: fabric || null,
    color_scheme: colorScheme || null,
    pattern_notes: patternNotes || null,
    print_notes: printNotes || null,
  });
  if (detailsError) throw new Error("No se pudo guardar: " + detailsError.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}

export async function updateOrderStatus(orderId: string, status: string) {
  await requireTeamMember();
  const supabase = await createClient();

  // Además del estado, dejamos registrado CUÁNDO pasó cada hito importante
  // (seña, arranque de producción, entrega) — sirve para las métricas de
  // cobranza mensual y para saber si un pedido se entregó en fecha. Solo se
  // completa la primera vez (si ya tenía la fecha, no la pisamos).
  const { data: current } = await supabase
    .from("orders")
    .select("deposit_paid_at, production_started_at, delivered_at")
    .eq("id", orderId)
    .single();

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status, updated_at: now };

  if (status === "senado" && !current?.deposit_paid_at) patch.deposit_paid_at = now;
  if (status === "cortando" && !current?.production_started_at) patch.production_started_at = now;
  if (status === "entregado" && !current?.delivered_at) patch.delivered_at = now;

  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw new Error("No se pudo cambiar el estado: " + error.message);
  revalidatePath(`/panel/pedidos/${orderId}`);
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel");
}

export async function updateEstimatedDeliveryDate(orderId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const date = String(formData.get("estimated_delivery_date") || "").trim() || null;

  const { error } = await supabase
    .from("orders")
    .update({ estimated_delivery_date: date, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw new Error("No se pudo guardar la fecha de entrega: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel");
}

// Los recursos (mockups, logos, paleta) van a un bucket PRIVADO — no son
// públicos como el logo del sitio, así que usamos el cliente admin para
// subir (sin políticas de Storage creadas) y servimos con URLs firmadas.
export async function uploadOrderResource(orderId: string, formData: FormData) {
  await requireTeamMember();
  const admin = createAdminClient();

  const file = formData.get("file") as File | null;
  const resourceType = String(formData.get("resource_type") || "otro");
  if (!file || file.size === 0) throw new Error("Falta el archivo");

  const ext = file.name.split(".").pop() || "bin";
  const path = `${orderId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("order-resources")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) throw new Error("No se pudo subir el archivo: " + uploadError.message);

  const { error: insertError } = await admin.from("order_resources").insert({
    order_id: orderId,
    resource_type: resourceType,
    file_url: path,
    file_name: file.name,
  });
  if (insertError) throw new Error("No se pudo registrar el archivo: " + insertError.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}

// Borra el pedido y todo lo que cuelga de él por FK (items, recursos,
// detalles técnicos) via "on delete cascade". Las tareas y compras
// asociadas NO se borran, solo pierden el vínculo al pedido ("on delete
// set null") — quedan sueltas en vez de desaparecer.
export async function deleteOrder(orderId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw new Error("No se pudo borrar el pedido: " + error.message);
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel");
}

export async function deleteOrderResource(resourceId: string, orderId: string, filePath: string) {
  await requireTeamMember();
  const admin = createAdminClient();

  await admin.storage.from("order-resources").remove([filePath]);
  const { error } = await admin.from("order_resources").delete().eq("id", resourceId);
  if (error) throw new Error("No se pudo borrar: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}

// Nota interna: solo el equipo la ve, nunca se muestra al cliente. Es de
// solo alta (no hay update/delete acá a propósito) para mantener la
// trazabilidad completa del pedido.
export async function createOrderNote(orderId: string, body: string) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  const text = body.trim();
  if (!text) throw new Error("Escribí algo antes de guardar");

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

  const { error } = await supabase.from("internal_notes").insert({
    order_id: orderId,
    author_id: user.id,
    author_name: profile?.full_name ?? user.email ?? "Equipo",
    body: text,
  });
  if (error) throw new Error("No se pudo guardar la nota: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}

// Artículos del pedido (order_article_requirements) — a diferencia de los
// artículos del presupuesto, estos se pueden seguir agregando/editando/
// borrando DESPUÉS de generar el pedido, por si el cliente pide sumar algo
// una vez que ya tiene el link (caso típico: presupuesto abierto donde el
// cliente carga cantidades y después pide un artículo más).
export async function createOrderRequirement(orderId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const description = String(formData.get("description") || "").trim();
  if (!description) throw new Error("Falta la descripción del artículo");
  const unitPrice = Number(formData.get("unit_price") || 0);
  const quantityQuotedRaw = String(formData.get("quantity_quoted") || "").trim();
  const articleTypeId = String(formData.get("article_type_id") || "") || null;

  const { data: existing } = await supabase
    .from("order_article_requirements")
    .select("id")
    .eq("order_id", orderId);

  const { error } = await supabase.from("order_article_requirements").insert({
    order_id: orderId,
    description,
    unit_price: unitPrice,
    quantity_quoted: quantityQuotedRaw ? Number(quantityQuotedRaw) : null,
    article_type_id: articleTypeId,
    requires_number: formData.get("requires_number") === "on",
    requires_name: formData.get("requires_name") === "on",
    sort_order: existing?.length ?? 0,
  });
  if (error) throw new Error("No se pudo agregar el artículo: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
  revalidatePath(`/pedido/${orderId}`);
}

export async function updateOrderRequirement(requirementId: string, orderId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const description = String(formData.get("description") || "").trim();
  if (!description) throw new Error("Falta la descripción del artículo");
  const unitPrice = Number(formData.get("unit_price") || 0);
  const quantityQuotedRaw = String(formData.get("quantity_quoted") || "").trim();
  const articleTypeId = String(formData.get("article_type_id") || "") || null;

  const { error } = await supabase
    .from("order_article_requirements")
    .update({
      description,
      unit_price: unitPrice,
      quantity_quoted: quantityQuotedRaw ? Number(quantityQuotedRaw) : null,
      article_type_id: articleTypeId,
      requires_number: formData.get("requires_number") === "on",
      requires_name: formData.get("requires_name") === "on",
    })
    .eq("id", requirementId);
  if (error) throw new Error("No se pudo guardar el artículo: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}

export async function deleteOrderRequirement(requirementId: string, orderId: string) {
  await requireTeamMember();
  const supabase = await createClient();

  const { error } = await supabase.from("order_article_requirements").delete().eq("id", requirementId);
  if (error) throw new Error("No se pudo borrar el artículo: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}
