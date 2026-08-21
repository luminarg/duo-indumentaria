"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const rowSchema = z.object({
  size: z.string().min(1, "Falta el talle"),
  individualName: z.string().optional(),
  individualNumber: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
});

// Un "requirement" = un artículo del presupuesto (ej. "Remera") con sus
// filas cargadas por el cliente. `requirementId` es null para prendas
// sueltas de pedidos viejos, de antes de que existiera esta función —
// se guardan igual, sin vincular a ningún artículo.
const requirementSchema = z.object({
  requirementId: z.string().nullable(),
  rows: z.array(rowSchema),
});

const submitSchema = z
  .object({
    token: z.string().min(1),
    teamOrGroupName: z.string().optional(),
    contactName: z.string().min(1, "Falta el nombre de contacto"),
    contactPhone: z.string().min(1, "Falta un teléfono de contacto"),
    contactEmail: z.string().email().optional().or(z.literal("")),
    generalNotes: z.string().optional(),
    requirements: z.array(requirementSchema),
  })
  .refine((data) => data.requirements.some((r) => r.rows.length > 0), {
    message: "Cargá al menos una prenda",
  });

export type SubmitPedidoInput = z.infer<typeof submitSchema>;

// Nota: el diseño (tela, color, moldería) lo carga el dueño al crear el
// pedido, desde el panel — este formulario público NO lo toca, para no
// pisar esas decisiones. Acá el cliente solo confirma datos de contacto y,
// por cada artículo del presupuesto, talle+nombre+número (si lleva) o
// cantidad por talle (si no lleva).
export async function submitPedido(input: SubmitPedidoInput) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const supabase = createAdminClient();

  const { data: order, error: findError } = await supabase
    .from("orders")
    .select("id")
    .eq("public_token", data.token)
    .single();

  if (findError || !order) {
    return { ok: false as const, error: "No se encontró el pedido para este link" };
  }

  const updatePayload: Record<string, unknown> = {
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
    contact_email: data.contactEmail || null,
    general_notes: data.generalNotes || null,
    status: "cargado_por_cliente",
    loaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Solo pisa el nombre de equipo si el cliente escribió algo — si lo dejó
  // vacío, respeta lo que ya haya cargado el dueño.
  if (data.teamOrGroupName) {
    updatePayload.team_or_group_name = data.teamOrGroupName;
  }

  const { error: updateError } = await supabase.from("orders").update(updatePayload).eq("id", order.id);

  if (updateError) {
    return { ok: false as const, error: "No se pudo guardar el pedido, probá de nuevo" };
  }

  // Reemplaza los items cargados (simple: borra e inserta de nuevo).
  await supabase.from("order_items").delete().eq("order_id", order.id);

  const itemsToInsert = data.requirements.flatMap((req) =>
    req.rows.map((row) => ({
      order_id: order.id,
      requirement_id: req.requirementId,
      individual_name: row.individualName || null,
      individual_number: row.individualNumber || null,
      quantity: row.quantity,
      size_label: row.size,
    }))
  );

  if (itemsToInsert.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);
    if (itemsError) {
      return { ok: false as const, error: "Se guardaron tus datos pero hubo un problema con las prendas" };
    }
  }

  // Calculamos el total real a partir de lo que el cliente acaba de cargar
  // (puede diferir de lo cotizado si cambió la composición de talles), para
  // mostrarle un resumen con total y seña.
  const [{ data: requirementsData }, { data: sourceQuote }] = await Promise.all([
    supabase.from("order_article_requirements").select("id, unit_price").eq("order_id", order.id),
    supabase.from("quotes").select("deposit_percent").eq("order_id", order.id).maybeSingle(),
  ]);
  const priceByRequirement = Object.fromEntries((requirementsData ?? []).map((r) => [r.id, Number(r.unit_price)]));
  const total = itemsToInsert.reduce(
    (sum, item) => sum + (item.requirement_id ? priceByRequirement[item.requirement_id] ?? 0 : 0) * item.quantity,
    0
  );
  const depositPercent = sourceQuote ? Number(sourceQuote.deposit_percent) : null;
  const depositAmount = depositPercent !== null ? (total * depositPercent) / 100 : null;

  revalidatePath(`/pedido/${data.token}`);
  return { ok: true as const, total, depositPercent, depositAmount };
}

// ---------------------------------------------------------------------------
// Archivos (logo a estampar, mockups, referencias) — el cliente los sube acá
// mismo, sin login. La "autenticación" es el token del link: primero
// buscamos el pedido por token y recién ahí operamos sobre sus archivos, así
// que sin el link no hay forma de tocar los recursos de otro pedido.
// ---------------------------------------------------------------------------

const ALLOWED_RESOURCE_TYPES = ["logo", "mockup", "paleta", "otro"] as const;

async function findOrderByToken(token: string) {
  const supabase = createAdminClient();
  const { data: order, error } = await supabase.from("orders").select("id").eq("public_token", token).single();
  if (error || !order) return null;
  return order;
}

export async function uploadPedidoResource(token: string, formData: FormData) {
  const order = await findOrderByToken(token);
  if (!order) return { ok: false as const, error: "No se encontró el pedido para este link" };

  const file = formData.get("file") as File | null;
  const resourceTypeRaw = String(formData.get("resource_type") || "otro");
  const resourceType = (ALLOWED_RESOURCE_TYPES as readonly string[]).includes(resourceTypeRaw)
    ? resourceTypeRaw
    : "otro";

  if (!file || file.size === 0) return { ok: false as const, error: "Falta el archivo" };
  if (file.size > 15 * 1024 * 1024) return { ok: false as const, error: "El archivo no puede pesar más de 15 MB" };

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${order.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("order-resources")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return { ok: false as const, error: "No se pudo subir el archivo: " + uploadError.message };

  const { error: insertError } = await admin.from("order_resources").insert({
    order_id: order.id,
    resource_type: resourceType,
    file_url: path,
    file_name: file.name,
  });
  if (insertError) return { ok: false as const, error: "No se pudo registrar el archivo: " + insertError.message };

  revalidatePath(`/pedido/${token}`);
  return { ok: true as const };
}

export async function deletePedidoResource(token: string, resourceId: string, filePath: string) {
  const order = await findOrderByToken(token);
  if (!order) return { ok: false as const, error: "No se encontró el pedido para este link" };

  const admin = createAdminClient();

  // Chequeo extra: el recurso tiene que pertenecer a ESTE pedido, no a
  // cualquiera cuyo id se pase.
  const { data: resource } = await admin
    .from("order_resources")
    .select("id, order_id")
    .eq("id", resourceId)
    .single();
  if (!resource || resource.order_id !== order.id) {
    return { ok: false as const, error: "No se pudo borrar el archivo" };
  }

  await admin.storage.from("order-resources").remove([filePath]);
  const { error } = await admin.from("order_resources").delete().eq("id", resourceId);
  if (error) return { ok: false as const, error: "No se pudo borrar: " + error.message };

  revalidatePath(`/pedido/${token}`);
  return { ok: true as const };
}
