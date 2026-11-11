"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, isReservedSlug } from "@/lib/sitePages";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

function revalidateSite(slugs: string[]) {
  revalidatePath("/panel/paginas");
  revalidatePath("/", "layout");
  for (const slug of slugs) revalidatePath(`/${slug}`);
  revalidatePath("/sitemap.xml");
}

// Crea una página en borrador y lleva directo al editor. Se usa como
// form action (por eso puede hacer redirect).
export async function createPage() {
  await requireTeamMember();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("site_pages").select("id");
  const { data, error } = await supabase
    .from("site_pages")
    .insert({
      title: "Nueva página",
      slug: `nueva-pagina-${crypto.randomUUID().slice(0, 6)}`,
      content: "",
      published: false,
      sort_order: existing?.length ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("No se pudo crear la página: " + (error?.message ?? ""));

  revalidatePath("/panel/paginas");
  redirect(`/panel/paginas/${data.id}`);
}

// Guarda todos los campos de la página. Devuelve el error (en vez de
// tirarlo) para que el mensaje real se vea en pantalla en producción.
export async function updatePage(pageId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const title = String(formData.get("title") || "").trim();
  if (!title) return { ok: false as const, error: "Falta el título de la página" };

  const slug = slugify(String(formData.get("slug") || "") || title);
  if (!slug) return { ok: false as const, error: "La dirección de la página no es válida" };
  if (isReservedSlug(slug)) {
    return { ok: false as const, error: `La dirección "/${slug}" ya la usa el sistema — elegí otra.` };
  }

  const { data: clash } = await supabase.from("site_pages").select("id").eq("slug", slug).neq("id", pageId);
  if (clash && clash.length > 0) {
    return { ok: false as const, error: `Ya hay otra página con la dirección "/${slug}".` };
  }

  const { data: before } = await supabase.from("site_pages").select("slug").eq("id", pageId).single();

  const { error } = await supabase
    .from("site_pages")
    .update({
      title,
      slug,
      content: String(formData.get("content") || ""),
      published: formData.get("published") === "on",
      show_in_menu: formData.get("show_in_menu") === "on",
      sort_order: Number(formData.get("sort_order") || 0),
      seo_title: String(formData.get("seo_title") || "").trim() || null,
      seo_description: String(formData.get("seo_description") || "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId);
  if (error) return { ok: false as const, error: "No se pudo guardar la página: " + error.message };

  revalidateSite([slug, ...(before?.slug && before.slug !== slug ? [before.slug] : [])]);
  revalidatePath(`/panel/paginas/${pageId}`);
  return { ok: true as const, slug };
}

export async function deletePage(pageId: string) {
  await requireTeamMember();
  const supabase = await createClient();

  const { data: before } = await supabase.from("site_pages").select("slug").eq("id", pageId).single();
  const { error } = await supabase.from("site_pages").delete().eq("id", pageId);
  if (error) return { ok: false as const, error: "No se pudo borrar la página: " + error.message };

  revalidateSite(before?.slug ? [before.slug] : []);
  return { ok: true as const };
}

// Sube una imagen para insertar dentro del contenido de una página.
export async function uploadPageImage(formData: FormData) {
  await requireTeamMember();
  const admin = createAdminClient();

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { ok: false as const, error: "Falta la imagen" };
  if (file.size > 8 * 1024 * 1024) return { ok: false as const, error: "La imagen no puede pesar más de 8 MB" };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `pages/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("site-assets")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) return { ok: false as const, error: "No se pudo subir la imagen: " + error.message };

  const { data } = admin.storage.from("site-assets").getPublicUrl(path);
  return { ok: true as const, url: data.publicUrl };
}
