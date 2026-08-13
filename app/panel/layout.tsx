import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./login/actions";
import { PanelShell } from "./PanelShell";

// Fecha de la última tanda de novedades — si un usuario tiene
// whats_new_seen_at anterior a esto (o nunca vio nada), le mostramos el
// aviso de "Qué hay de nuevo" una vez. Para la próxima tanda, alcanza con
// mover esta fecha hacia adelante.
const WHATS_NEW_RELEASE_AT = "2026-08-13T00:00:00Z";

// Metadata específica de /panel (PWA) — al vivir en este layout anidado en
// vez del layout raíz, solo se aplica dentro de /panel/* y no afecta al
// sitio público (home, catálogo, /pedido/[token]).
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, favicon_url, logo_url")
    .eq("id", 1)
    .single();

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const icon = settings?.favicon_url || settings?.logo_url || undefined;

  return {
    title: `${businessName} — Panel`,
    manifest: "/panel-manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: businessName,
      statusBarStyle: "black-translucent",
    },
    icons: icon ? { apple: icon } : undefined,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("primary_color")
    .eq("id", 1)
    .single();

  return {
    width: "device-width",
    initialScale: 1,
    // "cover" para que el contenido pueda extenderse detrás del notch/home
    // indicator del iPhone — junto con el padding de env(safe-area-inset-*)
    // en PanelShell, así se ve bien como app instalada (PWA) en iPhone 11.
    viewportFit: "cover",
    themeColor: settings?.primary_color || "#0a0a0a",
  };
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /panel/login no pasa por este layout con sesión, pero por las dudas
  // no mostramos la nav si todavía no hay usuario.
  if (!user) {
    return <div className="min-h-screen bg-zinc-50">{children}</div>;
  }

  const [{ data: settings }, { data: profile }] = await Promise.all([
    supabase.from("business_settings").select("business_name, logo_url").eq("id", 1).single(),
    supabase.from("profiles").select("whats_new_seen_at").eq("id", user.id).single(),
  ]);

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const logoUrl = settings?.logo_url ?? null;
  const seenAt = profile?.whats_new_seen_at;
  const showWhatsNew = !seenAt || new Date(seenAt) < new Date(WHATS_NEW_RELEASE_AT);

  return (
    <PanelShell businessName={businessName} logoUrl={logoUrl} logout={logout} showWhatsNew={showWhatsNew}>
      {children}
    </PanelShell>
  );
}
