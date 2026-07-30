"use server";

import { revalidatePath } from "next/cache";
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

export async function createDesign(formData: FormData) {
  await requireTeamMember();
  const admin = createAdminClient();

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) throw new Error("Falta la imagen");

  const title = String(formData.get("title") || "").trim() || null;
  const sortOrder = Number(formData.get("sort_order") || 0);

  const ext = file.name.split(".").pop() || "jpg";
  const path = `designs/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("site-assets")
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw new Error("No se pudo subir la imagen: " + uploadError.message);

  const { data: publicUrl } = admin.storage.from("site-assets").getPublicUrl(path);

  const { error } = await admin.from("designs").insert({
    image_url: publicUrl.publicUrl,
    title,
    sort_order: sortOrder,
    active: true,
  });
  if (error) throw new Error("No se pudo guardar: " + error.message);

  revalidatePath("/panel/disenos");
  revalidatePath("/");
}

export async function toggleDesign(id: string, active: boolean) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("designs").update({ active }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar: " + error.message);
  revalidatePath("/panel/disenos");
  revalidatePath("/");
}

export async function deleteDesign(id: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("designs").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar: " + error.message);
  revalidatePath("/panel/disenos");
  revalidatePath("/");
}
