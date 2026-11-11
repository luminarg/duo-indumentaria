import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReadableForeground, getMutedForeground } from "@/lib/color";
import { isReservedSlug } from "@/lib/sitePages";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { PageContent } from "../components/PageContent";

// Páginas de contenido creadas desde el panel (Panel → Páginas). Solo se
// muestran las publicadas — RLS ya filtra el resto para el público.

async function getPage(slug: string) {
  if (isReservedSlug(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_pages")
    .select("title, content, seo_title, seo_description")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  const title = page.seo_title || page.title;
  return {
    title,
    description: page.seo_description || undefined,
    openGraph: { title, description: page.seo_description || undefined },
  };
}

export default async function SitePagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  const supabase = await createClient();
  const [{ data: settings }, { data: menuPages }] = await Promise.all([
    supabase.from("business_settings").select("*").eq("id", 1).single(),
    supabase
      .from("site_pages")
      .select("title, slug")
      .eq("published", true)
      .eq("show_in_menu", true)
      .order("sort_order", { ascending: true }),
  ]);

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const primaryColor = settings?.primary_color ?? "#0a0a0a";
  const accentColor = settings?.secondary_color ?? "#16a34a";

  // Mismos colores que la home (los que elige el dueño en Configuración).
  const themeStyle = {
    "--background": primaryColor,
    "--foreground": getReadableForeground(primaryColor),
    "--muted": getMutedForeground(primaryColor),
    "--accent": accentColor,
    "--accent-foreground": getReadableForeground(accentColor),
  } as React.CSSProperties;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background text-foreground" style={themeStyle}>
      <SiteHeader
        businessName={businessName}
        logoUrl={settings?.logo_url ?? null}
        whatsappNumber={settings?.whatsapp_number ?? null}
        hasHeroImage={false}
        menuPages={menuPages ?? []}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-32 sm:px-10">
        <h1 className="mb-6 text-4xl font-black tracking-tight sm:text-5xl">{page.title}</h1>
        <PageContent content={page.content} />
      </main>

      <SiteFooter businessName={businessName} menuPages={menuPages ?? []} />
    </div>
  );
}
