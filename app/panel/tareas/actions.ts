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

function str(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalStr(formData: FormData, key: string) {
  return str(formData, key) || null;
}

export async function createTask(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const title = str(formData, "title");
  if (!title) throw new Error("Falta el título de la tarea");

  const { error } = await supabase.from("tasks").insert({
    title,
    description: optionalStr(formData, "description"),
    priority: str(formData, "priority") || "media",
    due_date: optionalStr(formData, "due_date"),
    order_id: optionalStr(formData, "order_id"),
    assigned_to: optionalStr(formData, "assigned_to"),
  });
  if (error) throw new Error("No se pudo crear la tarea: " + error.message);

  revalidatePath("/panel/tareas");
  revalidatePath("/panel");
}

export async function updateTaskStatus(taskId: string, status: "pendiente" | "en_curso" | "hecha") {
  await requireTeamMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "hecha" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  if (error) throw new Error("No se pudo actualizar la tarea: " + error.message);

  revalidatePath("/panel/tareas");
  revalidatePath("/panel");
}

// Edita título, detalle, prioridad y vencimiento de una tarea existente.
// Devuelve el error (en vez de tirarlo) para que el mensaje real se vea en
// pantalla también en producción.
export async function updateTask(taskId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const title = str(formData, "title");
  if (!title) return { ok: false as const, error: "Falta el título de la tarea" };

  const priority = str(formData, "priority");
  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      description: optionalStr(formData, "description"),
      priority: ["alta", "media", "baja"].includes(priority) ? priority : "media",
      due_date: optionalStr(formData, "due_date"),
    })
    .eq("id", taskId);
  if (error) return { ok: false as const, error: "No se pudo guardar la tarea: " + error.message };

  revalidatePath("/panel/tareas");
  revalidatePath("/panel");
  return { ok: true as const };
}

export async function deleteTask(taskId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw new Error("No se pudo borrar la tarea: " + error.message);
  revalidatePath("/panel/tareas");
  revalidatePath("/panel");
}
