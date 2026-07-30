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

// Dinámico (en vez de un `metadata` estático) porque el favicon se carga
// desde Configuración y vive en Supabase, no como archivo del proyecto.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, favicon_url")
    .eq("id", 1)
    .single();

  return {
    title: settings?.business_name ?? "Duo Indumentaria",
    description: "Indumentaria deportiva personalizada — pedidos, presupuestos y producción.",
    icons: settings?.favicon_url ? { icon: settings.favicon_url } : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
