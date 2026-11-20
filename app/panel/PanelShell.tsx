"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { PanelNav, type NavCounts } from "./PanelNav";
import { PanelTopbar } from "./PanelTopbar";
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
  counts,
  userName,
  children,
}: {
  businessName: string;
  logoUrl: string | null;
  logout: () => Promise<void>;
  showWhatsNew: boolean;
  counts?: NavCounts;
  userName?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer automáticamente al navegar a otra pantalla.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div className="flex min-h-screen">
      <WhatsNewModal initialOpen={showWhatsNew} />
      {/* Fondo abstracto — fixed para que quede fijo detrás de todas las
          pantallas del panel sin importar cuánto scrollee el contenido. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[#F3F5F9]" />

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
          "md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-8 w-auto max-w-[9rem] object-contain" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00AEEF] text-xs font-extrabold text-[#04263A]">DUO</span>
            )}
            <div className="leading-tight">
              <div className="text-sm font-bold text-white">{businessName}</div>
              <div className="text-xs text-[#8FA3C4]">Panel de gestión</div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <PanelNav counts={counts} />
        <form action={logout} className="mt-3 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E6F7FD] text-sm font-bold text-[#102C5B]">
            {(userName || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{userName || "Mi cuenta"}</span>
          <button aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-md p-1.5 text-[#C9D5EA] transition-colors hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <PanelTopbar />
        <main
          className="panel-main-safe-pt flex-1 overflow-y-auto p-8"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
