"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ShoppingBag,
  Users,
  FileText,
  CheckSquare,
  Calendar,
  Wallet,
  UserCog,
  Settings,
  Images,
  Files,
  Scissors,
  Rows3,
  Flag,
  Layers,
  Shirt,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type NavCounts = { quotes?: number; orders?: number; produce?: number; tasks?: number };

type Item = { href: string; label: string; icon: typeof Home; count?: keyof NavCounts };

// Menú agrupado por área de trabajo. El ítem activo es el de ruta más larga
// que coincide (así "Banderas" se marca en /panel/produccion/banderas y no
// "Para producir").
const GROUPS: { title: string | null; items: Item[] }[] = [
  { title: null, items: [{ href: "/panel", label: "Inicio", icon: Home }] },
  {
    title: "Ventas",
    items: [
      { href: "/panel/presupuestos", label: "Presupuestos", icon: FileText, count: "quotes" },
      { href: "/panel/pedidos", label: "Pedidos", icon: ShoppingBag, count: "orders" },
      { href: "/panel/clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    title: "Producción",
    items: [
      { href: "/panel/produccion", label: "Para producir", icon: Scissors, count: "produce" },
      { href: "/panel/produccion/rollo-combinado", label: "Rollo combinado", icon: Rows3 },
      { href: "/panel/produccion/banderas", label: "Banderas", icon: Flag },
      { href: "/panel/produccion/dtf", label: "DTF en papel", icon: Layers },
      { href: "/panel/produccion/trabajos", label: "Trabajos libres", icon: Shirt },
      { href: "/panel/produccion/moldes", label: "Moldería", icon: Ruler },
    ],
  },
  {
    title: "Gestión",
    items: [
      { href: "/panel/compras", label: "Caja", icon: Wallet },
      { href: "/panel/tareas", label: "Tareas", icon: CheckSquare, count: "tasks" },
      { href: "/panel/agenda", label: "Agenda", icon: Calendar },
    ],
  },
  {
    title: "Sitio web",
    items: [
      { href: "/panel/disenos", label: "Diseños", icon: Images },
      { href: "/panel/paginas", label: "Páginas", icon: Files },
    ],
  },
];

// Usuarios y Configuración van como íconos junto al usuario (abajo del menú),
// así el menú entra entero sin scrollear.
const ACCOUNT: Item[] = [
  { href: "/panel/usuarios", label: "Usuarios", icon: UserCog },
  { href: "/panel/configuracion", label: "Configuración", icon: Settings },
];

const ALL = [...GROUPS.flatMap((g) => g.items), ...ACCOUNT];

function activeHref(pathname: string) {
  if (pathname === "/panel") return "/panel";
  let best = "";
  for (const it of ALL) {
    if (it.href === "/panel") continue;
    if ((pathname === it.href || pathname.startsWith(it.href + "/")) && it.href.length > best.length) best = it.href;
  }
  return best;
}

export function PanelNav({ counts = {} }: { counts?: NavCounts }) {
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <nav aria-label="Menú principal" className="no-scrollbar -mx-1 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1">
      {GROUPS.map((g) => (
        <div key={g.title ?? "inicio"} className="flex flex-col gap-px">
          {g.title && <div className="px-3 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8FA3C4]">{g.title}</div>}
          {g.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === active;
            const n = item.count ? counts[item.count] : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-[5px] text-[13px] font-medium transition-colors",
                  isActive ? "bg-white text-[#102C5B] font-semibold" : "text-[#C9D5EA] hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {!!n && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-px text-[11px] font-bold",
                      isActive ? "bg-[#E6F7FD] text-[#0B6E99]" : "bg-[#00AEEF] text-[#04263A]"
                    )}
                  >
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Accesos de cuenta (Usuarios, Configuración) como íconos. */
export function AccountLinks() {
  const pathname = usePathname();
  const active = activeHref(pathname);
  return (
    <>
      {ACCOUNT.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-label={it.label}
            title={it.label}
            aria-current={it.href === active ? "page" : undefined}
            className={cn("rounded-md p-1.5 transition-colors", it.href === active ? "bg-white text-[#102C5B]" : "text-[#C9D5EA] hover:bg-white/10 hover:text-white")}
          >
            <Icon className="h-4 w-4" />
          </Link>
        );
      })}
    </>
  );
}
