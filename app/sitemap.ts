import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

// Sitemap generado: la home + cada página publicada desde Panel → Páginas.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const supabase = createAdminClient();
    const { data: pages } = await supabase
      .from("site_pages")
      .select("slug, updated_at")
      .eq("published", true);
    for (const p of pages ?? []) {
      entries.push({
        url: `${siteUrl}/${p.slug}`,
        lastModified: new Date(p.updated_at),
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    // Si la base no responde, al menos devolvemos la home.
  }

  return entries;
}
