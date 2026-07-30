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

function customerPayload(formData: FormData) {
  return {
    name: String(formData.get("name") || "").trim(),
    type: String(formData.get("type") || "particular"),
    contact_name: String(formData.get("contact_name") || "").trim() || null,
    contact_role: String(formData.get("contact_role") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    origin: String(formData.get("origin") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  };
}

export async function createCustomer(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const payload = customerPayload(formData);
  if (!payload.name) throw new Error("Falta el nombre del cliente");

  const { data, error } = await supabase.from("clients").insert(payload).select("id").single();
  if (error || !data) throw new Error("No se pudo crear el cliente: " + (error?.message ?? ""));

  revalidatePath("/panel/clientes");
  redirect(`/panel/clientes/${data.id}`);
}

export async function updateCustomer(clientId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const payload = customerPayload(formData);
  if (!payload.name) throw new Error("Falta el nombre del cliente");

  const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
  if (error) throw new Error("No se pudo guardar: " + error.message);

  revalidatePath(`/panel/clientes/${clientId}`);
  revalidatePath("/panel/clientes");
}

export async function deleteCustomer(clientId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) throw new Error("No se pudo borrar: " + error.message);
  revalidatePath("/panel/clientes");
  redirect("/panel/clientes");
}
