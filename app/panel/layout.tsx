import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./login/actions";
import { PanelNav } from "./PanelNav";

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

  const { data: settings } = await supabase
    .from("business_settings")
    .select("business_name, logo_url")
    .eq("id", 1)
    .single();

  const businessName = settings?.business_name ?? "Duo Indumentaria";
  const logoUrl = settings?.logo_url ?? null;

  return (
    <div className="flex min-h-screen">
      {/* Fondo abstracto — fixed para que quede fijo detrás de todas las
          pantallas del panel sin importar cuánto scrollee el contenido. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-indigo-50 via-white to-emerald-50" />
      <div className="pointer-events-none fixed -top-24 -left-20 -z-10 h-96 w-96 rounded-full bg-indigo-300/40 blur-3xl" />
      <div className="pointer-events-none fixed top-10 right-0 -z-10 h-[26rem] w-[26rem] rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 left-1/3 -z-10 h-72 w-72 rounded-full bg-fuchsia-300/20 blur-3xl" />

      <aside className="glass-sidebar flex w-60 shrink-0 flex-col px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="h-8 w-auto max-w-[9rem] object-contain" />
          ) : (
            <span className="text-sm font-bold uppercase tracking-wide text-white">{businessName}</span>
          )}
        </div>
        <PanelNav />
        <form action={logout}>
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
