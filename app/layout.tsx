import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Dinámico (en vez de un `metadata` estático) porque el favicon y los datos
// de SEO se cargan desde Configuración y viven en Supabase, no como
// archivos/constantes del proyecto — así el dueño del negocio los edita
// sin tocar código.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, favicon_url, logo_url, seo_title, seo_description, seo_keywords, seo_og_image_url")
    .eq("id", 1)
    .single();

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const title = settings?.seo_title || businessName;
  const description =
    settings?.seo_description || "Indumentaria deportiva personalizada — pedidos, presupuestos y producción.";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // Si no cargaste una imagen específica para compartir en redes, usamos el
  // logo del negocio — así nunca queda sin imagen (y no muestra el ícono
  // genérico de Vercel de fallback).
  const ogImage = settings?.seo_og_image_url || settings?.logo_url || undefined;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    keywords: settings?.seo_keywords || undefined,
    icons: settings?.favicon_url ? { icon: settings.favicon_url } : undefined,
    openGraph: {
      title,
      description,
      siteName: businessName,
      url: siteUrl,
      locale: "es_AR",
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // JSON-LD (datos estructurados) para que Google entienda que es un
  // negocio real — nombre, logo, teléfono y redes. Usa datos que ya se
  // cargan en Configuración, no agrega campos nuevos para esto.
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, logo_url, whatsapp_number, address, social_instagram, social_facebook")
    .eq("id", 1)
    .single();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const sameAs = [settings?.social_instagram, settings?.social_facebook].filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: settings?.business_name ?? "Duo Indumentaria",
    url: siteUrl,
    ...(settings?.logo_url ? { logo: settings.logo_url, image: settings.logo_url } : {}),
    ...(settings?.whatsapp_number ? { telephone: settings.whatsapp_number } : {}),
    ...(settings?.address ? { address: settings.address } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
