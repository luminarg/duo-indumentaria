"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { PanelNav } from "./PanelNav";
import { WhatsNewModal } from "./WhatsNewModal";

// Envoltorio del panel: fondo abstracto + sidebar. En desktop el sidebar
// queda fijo en la columna izquierda como siempre. En mobile se esconde
// y se convierte en un drawer que se abre con el botón de menú de la
// barra superior — si no, el sidebar angosto rompía el resto del layout
// en pantallas chicas.
export function PanelShell({
  businessName,
  logoUrl,
  logout,
  showWhatsNew,
  children,
}: {
  businessName: string;
  logoUrl: string | null;
  logout: () => Promise<void>;
  showWhatsNew: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer automáticamente al navegar a otra pantalla.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <WhatsNewModal initialOpen={showWhatsNew} />
      {/* Fondo abstracto — fixed para que quede fijo detrás de todas las
          pantallas del panel sin importar cuánto scrollee el contenido. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-indigo-50 via-white to-emerald-50" />
      <div className="pointer-events-none fixed -top-24 -left-20 -z-10 h-96 w-96 rounded-full bg-indigo-300/40 blur-3xl" />
      <div className="pointer-events-none fixed top-10 right-0 -z-10 h-[26rem] w-[26rem] rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 left-1/3 -z-10 h-72 w-72 rounded-full bg-fuchsia-300/20 blur-3xl" />

      {/* Barra superior — solo mobile. padding-top con env(safe-area-inset-top)
          para no quedar debajo del notch cuando está instalada como PWA
          (iPhone 11 y similares). */}
      <div
        className="glass-topbar fixed inset-x-0 top-0 z-30 flex items-center gap-3 px-4 pb-3 md:hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={businessName} className="h-6 w-auto max-w-[7rem] object-contain" />
        ) : (
          <span className="text-sm font-bold uppercase tracking-wide text-white">{businessName}</span>
        )}
      </div>

      {/* Fondo oscuro detrás del drawer — solo mobile, solo cuando está abierto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}

      <aside
        className={cn(
          "glass-sidebar fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col px-4 transition-transform duration-200 ease-out",
          "md:static md:z-auto md:w-60 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
        }}
      >
        <div className="mb-8 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-8 w-auto max-w-[9rem] object-contain" />
            ) : (
              <span className="text-sm font-bold uppercase tracking-wide text-white">{businessName}</span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <PanelNav />
        <form action={logout}>
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </aside>

      <main
        className="panel-main-safe-pt flex-1 overflow-y-auto p-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
      >
        {children}
      </main>
    </div>
  );
}
