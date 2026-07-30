"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Todas las acciones acá chequean sesión con el cliente "normal" (respeta
// RLS) antes de usar el cliente admin para lo que RLS todavía no cubre
// (subir archivos a Storage, porque no hay políticas creadas ahí).
async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado");
  }
  return user;
}

async function uploadImage(admin: ReturnType<typeof createAdminClient>, file: File, folder: string) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("site-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("No se pudo subir la imagen: " + error.message);

  const { data } = admin.storage.from("site-assets").getPublicUrl(path);
  return data.publicUrl;
}

export async function updateBusinessSettings(formData: FormData) {
  await requireTeamMember();
  const admin = createAdminClient();

  const logoFile = formData.get("logo") as File | null;
  let logoUrl: string | undefined;
  if (logoFile && logoFile.size > 0) {
    logoUrl = await uploadImage(admin, logoFile, "logo");
  }

  const payload: Record<string, unknown> = {
    business_name: String(formData.get("business_name") || "Duo Indumentaria"),
    whatsapp_number: String(formData.get("whatsapp_number") || "") || null,
    contact_email: String(formData.get("contact_email") || "") || null,
    address: String(formData.get("address") || "") || null,
    social_instagram: String(formData.get("social_instagram") || "") || null,
    social_facebook: String(formData.get("social_facebook") || "") || null,
    primary_color: String(formData.get("primary_color") || "#0a0a0a"),
    secondary_color: String(formData.get("secondary_color") || "#dc2626"),
    show_prices: formData.get("show_prices") === "on",
    hero_title: String(formData.get("hero_title") || "") || null,
    hero_subtitle: String(formData.get("hero_subtitle") || "") || null,
    quote_header_text: String(formData.get("quote_header_text") || "") || null,
    quote_footer_text: String(formData.get("quote_footer_text") || "") || null,
    quote_validity_days: Number(formData.get("quote_validity_days") || 7),
    updated_at: new Date().toISOString(),
  };
  if (logoUrl) payload.logo_url = logoUrl;

  const { error } = await admin.from("business_settings").update(payload).eq("id", 1);
  if (error) throw new Error("No se pudo guardar: " + error.message);

  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

export async function createSlider(formData: FormData) {
  await requireTeamMember();
  const admin = createAdminClient();

  const imageFile = formData.get("image") as File | null;
  if (!imageFile || imageFile.size === 0) {
    throw new Error("Falta la imagen del slider");
  }
  const imageUrl = await uploadImage(admin, imageFile, "sliders");

  const { error } = await admin.from("site_sliders").insert({
    image_url: imageUrl,
    title: String(formData.get("title") || "") || null,
    subtitle: String(formData.get("subtitle") || "") || null,
    link_url: String(formData.get("link_url") || "") || null,
    sort_order: Number(formData.get("sort_order") || 0),
    active: true,
  });
  if (error) throw new Error("No se pudo crear el slider: " + error.message);

  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

export async function toggleSlider(id: string, active: boolean) {
  await requireTeamMember();
  const admin = createAdminClient();
  const { error } = await admin.from("site_sliders").update({ active }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el slider: " + error.message);
  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

export async function deleteSlider(id: string) {
  await requireTeamMember();
  const admin = createAdminClient();
  const { error } = await admin.from("site_sliders").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar el slider: " + error.message);
  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}
