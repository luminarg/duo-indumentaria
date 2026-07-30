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

export async function deleteOrderResource(resourceId: string, orderId: string, filePath: string) {
  await requireTeamMember();
  const admin = createAdminClient();

  await admin.storage.from("order-resources").remove([filePath]);
  const { error } = await admin.from("order_resources").delete().eq("id", resourceId);
  if (error) throw new Error("No se pudo borrar: " + error.message);

  revalidatePath(`/panel/pedidos/${orderId}`);
}
