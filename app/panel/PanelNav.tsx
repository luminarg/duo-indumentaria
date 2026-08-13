"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  FileText,
  CheckSquare,
  Calendar,
  Wallet,
  UserCog,
  Settings,
  Images,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/panel", label: "Dashboard", icon: LayoutDashboard },
  { href: "/panel/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/panel/clientes", label: "Clientes", icon: Users },
  { href: "/panel/presupuestos", label: "Presupuestos", icon: FileText },
  { href: "/panel/disenos", label: "Diseños", icon: Images },
  { href: "/panel/tareas", label: "Tareas", icon: CheckSquare },
  { href: "/panel/agenda", label: "Agenda", icon: Calendar },
  { href: "/panel/compras", label: "Caja", icon: Wallet },
  { href: "/panel/usuarios", label: "Usuarios", icon: UserCog },
  { href: "/panel/configuracion", label: "Configuración", icon: Settings },
];

export function PanelNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {NAV.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === "/panel" ? pathname === "/panel" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent text-white"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
