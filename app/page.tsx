import { createClient } from "@/lib/supabase/server";
import { getReadableForeground, getMutedForeground } from "@/lib/color";
import { SiteHeader } from "./components/SiteHeader";
import { Hero } from "./components/Hero";
import { FeatureCards } from "./components/FeatureCards";
import { DesignsGallery } from "./components/DesignsGallery";
import { ContactSection } from "./components/ContactSection";
import { SiteFooter } from "./components/SiteFooter";

export default async function Home() {
  const supabase = await createClient();

  const [{ data: settings }, { data: sliders }, { data: images }] = await Promise.all([
    supabase.from("business_settings").select("*").eq("id", 1).single(),
    supabase
      .from("site_sliders")
      .select("image_url")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("designs")
      .select("id, image_url")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(8),
  ]);

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const primaryColor = settings?.primary_color ?? "#0a0a0a";
  const accentColor = settings?.secondary_color ?? "#16a34a";

  // Variables CSS calculadas a partir de los colores que eligió el dueño
  // desde el panel — con contraste legible garantizado, elija el color que
  // elija. Solo se aplican acá (cascadean a los hijos), así el panel de
  // administración no se ve afectado por estos colores.
  const themeStyle = {
    "--background": primaryColor,
    "--foreground": getReadableForeground(primaryColor),
    "--muted": getMutedForeground(primaryColor),
    "--accent": accentColor,
    "--accent-foreground": getReadableForeground(accentColor),
  } as React.CSSProperties;

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground" style={themeStyle}>
      <SiteHeader
        businessName={businessName}
        logoUrl={settings?.logo_url ?? null}
        whatsappNumber={settings?.whatsapp_number ?? null}
        hasHeroImage={(sliders ?? []).length > 0}
      />

      <Hero
        images={(sliders ?? []).map((s) => s.image_url)}
        title={settings?.hero_title ?? "Vive tu Juego."}
        subtitle={
          settings?.hero_subtitle ??
          "Indumentaria deportiva personalizada para clubes, colegios y gimnasios."
        }
      />

      <FeatureCards
        features={[
          { title: settings?.feature1_title ?? "", description: settings?.feature1_text ?? "" },
          { title: settings?.feature2_title ?? "", description: settings?.feature2_text ?? "" },
          { title: settings?.feature3_title ?? "", description: settings?.feature3_text ?? "" },
        ]}
      />

      <DesignsGallery
        images={(images ?? []).map((img) => ({ id: img.id, url: img.image_url, alt: businessName }))}
      />

      <ContactSection
        whatsappNumber={settings?.whatsapp_number ?? null}
        address={settings?.address ?? null}
        instagram={settings?.social_instagram ?? null}
        facebook={settings?.social_facebook ?? null}
      />

      <SiteFooter businessName={businessName} />
    </div>
  );
}
