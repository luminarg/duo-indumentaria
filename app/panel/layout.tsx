import { createClient } from "@/lib/supabase/server";
import { logout } from "./login/actions";
import { PanelShell } from "./PanelShell";

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
    <PanelShell businessName={businessName} logoUrl={logoUrl} logout={logout}>
      {children}
    </PanelShell>
  );
}
