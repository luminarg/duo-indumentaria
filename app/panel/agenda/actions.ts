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
