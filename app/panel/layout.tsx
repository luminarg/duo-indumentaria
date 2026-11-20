import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./login/actions";
import { PanelShell } from "./PanelShell";

// Fecha de la última tanda de novedades — si un usuario tiene
// whats_new_seen_at anterior a esto (o nunca vio nada), le mostramos el
// aviso de "Qué hay de nuevo" una vez. Para la próxima tanda, alcanza con
// mover esta fecha hacia adelante.
const WHATS_NEW_RELEASE_AT = "2026-11-20T14:30:00Z";

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
  return {
    width: "device-width",
    initialScale: 1,
    // "cover" para que el contenido pueda extenderse detrás del notch/home
    // indicator del iPhone — junto con el padding de env(safe-area-inset-*)
    // en PanelShell, así se ve bien como app instalada (PWA) en iPhone 11.
    viewportFit: "cover",
    // Azul Duo (el del menú) para la barra del celular.
    themeColor: "#102C5B",
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

  const [{ data: settings }, { data: profile }, quotes, orders, produce, tasks] = await Promise.all([
    supabase.from("business_settings").select("business_name, logo_url").eq("id", 1).single(),
    supabase.from("profiles").select("whats_new_seen_at, full_name").eq("id", user.id).single(),
    // Contadores del menú: presupuestos sin pedido, pedidos en curso,
    // pedidos para producir y tareas sin hacer.
    supabase.from("quotes").select("id", { count: "exact", head: true }).is("order_id", null),
    supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "entregado"),
    supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["cerrado", "cortando", "diseno_molderia"]),
    supabase.from("tasks").select("id", { count: "exact", head: true }).neq("status", "hecha"),
  ]);
  const counts = { quotes: quotes.count ?? 0, orders: orders.count ?? 0, produce: produce.count ?? 0, tasks: tasks.count ?? 0 };

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const logoUrl = settings?.logo_url ?? null;
  const seenAt = profile?.whats_new_seen_at;
  const showWhatsNew = !seenAt || new Date(seenAt) < new Date(WHATS_NEW_RELEASE_AT);

  return (
    <PanelShell businessName={businessName} logoUrl={logoUrl} logout={logout} showWhatsNew={showWhatsNew} counts={counts} userName={profile?.full_name ?? user.email ?? null}>
      {children}
    </PanelShell>
  );
}
