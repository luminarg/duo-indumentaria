import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Manifest del panel (PWA) — separado del sitio público a propósito: el
// scope/start_url apuntan solo a /panel, así que "instalar la app" desde
// acá no afecta ni aparece relacionado con la home pública.
function guessMimeType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, favicon_url, logo_url, primary_color")
    .eq("id", 1)
    .single();

  const name = settings?.business_name ?? "Duo Indumentaria";
  // El ícono del panel usa el favicon si está cargado; si no, el logo.
  const icon = settings?.favicon_url || settings?.logo_url || null;

  const manifest = {
    name: `${name} — Panel`,
    short_name: "Panel",
    description: "Panel de gestión de pedidos, presupuestos y producción.",
    start_url: "/panel",
    scope: "/panel/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: settings?.primary_color || "#0a0a0a",
    icons: icon ? [{ src: icon, sizes: "any", type: guessMimeType(icon) }] : [],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
