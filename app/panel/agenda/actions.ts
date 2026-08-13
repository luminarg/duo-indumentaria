"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

export async function createEvent(formData: FormData) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  const title = String(formData.get("title") || "").trim();
  const eventType = String(formData.get("event_type") || "otro");
  const eventDate = String(formData.get("event_date") || "");
  const eventTime = String(formData.get("event_time") || "09:00");
  const clientId = String(formData.get("client_id") || "") || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!title) throw new Error("Falta el título");
  if (!eventDate) throw new Error("Falta la fecha");

  const eventAt = new Date(`${eventDate}T${eventTime}:00`).toISOString();

  const { error } = await supabase.from("agenda_events").insert({
    title,
    event_type: eventType,
    event_at: eventAt,
    client_id: clientId,
    notes,
    created_by: user.id,
  });

  if (error) throw new Error("No se pudo crear el evento: " + error.message);

  revalidatePath("/panel/agenda");
  revalidatePath("/panel");
}

export async function deleteEvent(eventId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("agenda_events").delete().eq("id", eventId);
  if (error) throw new Error("No se pudo borrar: " + error.message);
  revalidatePath("/panel/agenda");
  revalidatePath("/panel");
}

// ---------------------------------------------------------------------------
// Contactos frecuentes (comisionistas, proveedores de tela/insumos, etc.) —
// gente con la que se habla seguido pero que no es ni cliente ni proveedor
// "formal" cargado en Compras.
// ---------------------------------------------------------------------------

export async function createFrequentContact(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Falta el nombre del contacto");

  const { error } = await supabase.from("frequent_contacts").insert({
    name,
    category: String(formData.get("category") || "otro"),
    phone: String(formData.get("phone") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  if (error) throw new Error("No se pudo guardar el contacto: " + error.message);
  revalidatePath("/panel/agenda");
}

export async function deleteFrequentContact(contactId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("frequent_contacts").delete().eq("id", contactId);
  if (error) throw new Error("No se pudo borrar el contacto: " + error.message);
  revalidatePath("/panel/agenda");
}
