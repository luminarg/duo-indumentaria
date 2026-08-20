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

  const faviconFile = formData.get("favicon") as File | null;
  let faviconUrl: string | undefined;
  if (faviconFile && faviconFile.size > 0) {
    faviconUrl = await uploadImage(admin, faviconFile, "favicon");
  }

  const ogImageFile = formData.get("seo_og_image") as File | null;
  let ogImageUrl: string | undefined;
  if (ogImageFile && ogImageFile.size > 0) {
    ogImageUrl = await uploadImage(admin, ogImageFile, "seo");
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
    seo_title: String(formData.get("seo_title") || "").trim() || null,
    seo_description: String(formData.get("seo_description") || "").trim() || null,
    seo_keywords: String(formData.get("seo_keywords") || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (logoUrl) payload.logo_url = logoUrl;
  if (faviconUrl) payload.favicon_url = faviconUrl;
  if (ogImageUrl) payload.seo_og_image_url = ogImageUrl;

  const { error } = await admin.from("business_settings").update(payload).eq("id", 1);
  if (error) throw new Error("No se pudo guardar: " + error.message);

  revalidatePath("/panel/configuracion");
  revalidatePath("/", "layout");
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

export async function createFeature(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!title || !description) throw new Error("Falta título o descripción");

  const { error } = await supabase.from("site_features").insert({
    icon: String(formData.get("icon") || "shirt"),
    title,
    description,
    sort_order: Number(formData.get("sort_order") || 0),
    active: true,
  });
  if (error) throw new Error("No se pudo crear la tarjeta: " + error.message);

  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

export async function updateFeature(id: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!title || !description) throw new Error("Falta título o descripción");

  const { error } = await supabase
    .from("site_features")
    .update({
      icon: String(formData.get("icon") || "shirt"),
      title,
      description,
      sort_order: Number(formData.get("sort_order") || 0),
    })
    .eq("id", id);
  if (error) throw new Error("No se pudo guardar la tarjeta: " + error.message);

  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

export async function toggleFeature(id: string, active: boolean) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("site_features").update({ active }).eq("id", id);
  if (error) throw new Error("No se pudo actualizar la tarjeta: " + error.message);
  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

export async function deleteFeature(id: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("site_features").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar la tarjeta: " + error.message);
  revalidatePath("/panel/configuracion");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Tipos de artículo (remera, pantalón, buzo...) + su guía de talles — se usan
// al cargar artículos en un presupuesto (para saber si llevan número/nombre
// por defecto) y al armar el formulario público del pedido (para mostrar
// talles con medidas en vez de un campo de texto libre).
// ---------------------------------------------------------------------------

export async function createArticleType(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Falta el nombre del tipo de artículo");

  const { error } = await supabase.from("article_types").insert({
    name,
    requires_number: formData.get("requires_number") === "on",
    requires_name: formData.get("requires_name") === "on",
    sort_order: Number(formData.get("sort_order") || 0),
  });
  if (error) throw new Error("No se pudo crear el tipo de artículo: " + error.message);

  revalidatePath("/panel/configuracion");
}

export async function updateArticleType(id: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Falta el nombre del tipo de artículo");

  const { error } = await supabase
    .from("article_types")
    .update({
      name,
      requires_number: formData.get("requires_number") === "on",
      requires_name: formData.get("requires_name") === "on",
    })
    .eq("id", id);
  if (error) throw new Error("No se pudo guardar el tipo de artículo: " + error.message);

  revalidatePath("/panel/configuracion");
}

export async function deleteArticleType(id: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("article_types").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar el tipo de artículo: " + error.message);
  revalidatePath("/panel/configuracion");
}

export async function createArticleTypeSize(articleTypeId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const label = String(formData.get("label") || "").trim();
  if (!label) throw new Error("Falta el talle");

  const { data: existing } = await supabase
    .from("article_type_sizes")
    .select("id")
    .eq("article_type_id", articleTypeId);

  const { error } = await supabase.from("article_type_sizes").insert({
    article_type_id: articleTypeId,
    label,
    measurements: String(formData.get("measurements") || "").trim() || null,
    sort_order: existing?.length ?? 0,
  });
  if (error) throw new Error("No se pudo agregar el talle: " + error.message);

  revalidatePath("/panel/configuracion");
}

export async function deleteArticleTypeSize(id: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("article_type_sizes").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar el talle: " + error.message);
  revalidatePath("/panel/configuracion");
}
