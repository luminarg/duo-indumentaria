"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Solo el "dueno" puede gestionar usuarios del equipo. Chequeamos con el
// cliente normal (sesión real) y su fila en `profiles`, no confiamos en
// nada que venga del formulario.
async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "dueno") {
    throw new Error("Solo el dueño puede gestionar usuarios");
  }
  return user;
}

export async function createTeamUser(formData: FormData) {
  await requireOwner();
  const admin = createAdminClient();

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const role = String(formData.get("role") || "empleado");

  if (!email || !password || password.length < 6) {
    throw new Error("Email y contraseña (mínimo 6 caracteres) son obligatorios");
  }
  if (!["dueno", "hermano", "empleado"].includes(role)) {
    throw new Error("Rol inválido");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error("No se pudo crear el usuario: " + (createError?.message ?? "error desconocido"));
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName || email,
    role,
  });
  if (profileError) {
    // Si falla el perfil, no dejamos un usuario auth huérfano.
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error("No se pudo crear el perfil: " + profileError.message);
  }

  revalidatePath("/panel/usuarios");
}

export async function updateUserRole(userId: string, role: string) {
  const currentUser = await requireOwner();
  if (!["dueno", "hermano", "empleado"].includes(role)) {
    throw new Error("Rol inválido");
  }
  const admin = createAdminClient();

  if (userId === currentUser.id && role !== "dueno") {
    throw new Error("No podés quitarte a vos mismo el rol de dueño");
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error("No se pudo actualizar el rol: " + error.message);

  revalidatePath("/panel/usuarios");
}

export async function deleteTeamUser(userId: string) {
  const currentUser = await requireOwner();
  const admin = createAdminClient();

  if (userId === currentUser.id) {
    throw new Error("No podés eliminar tu propio usuario");
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error("No se pudo eliminar el usuario: " + error.message);
  // La fila de `profiles` se borra sola (FK ON DELETE CASCADE).

  revalidatePath("/panel/usuarios");
}
