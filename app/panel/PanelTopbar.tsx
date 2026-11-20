"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, FileText, Shirt, CheckSquare, Flag, Layers, Users, ShoppingBag, Loader2 } from "lucide-react";
import { globalSearch, type SearchHit } from "./actions";

const KIND_ICON = { pedido: ShoppingBag, cliente: Users, presupuesto: FileText, trabajo: Shirt } as const;

/** Buscador del panel (Ctrl K): pedidos, clientes, presupuestos y trabajos libres. */
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onChange = (v: string) => {
    setQ(v);
    setSel(0);
    if (v.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      const r = await globalSearch(v);
      setHits(r);
    });
  };

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(h.href);
  };

  return (
    <div className="relative w-full max-w-md">
      <label className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-zinc-500 focus-within:border-[#00AEEF] focus-within:bg-white">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        <input
          ref={ref}
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
            else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            else if (e.key === "Enter" && hits[sel]) go(hits[sel]);
            else if (e.key === "Escape") ref.current?.blur();
          }}
          aria-label="Buscar en el panel"
          placeholder="Buscar pedido, cliente o número…"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        <kbd className="hidden rounded border border-zinc-300 px-1.5 text-[11px] text-zinc-500 sm:inline">Ctrl K</kbd>
      </label>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">{pending ? "Buscando…" : "Sin resultados."}</p>
          ) : (
            <ul role="listbox" aria-label="Resultados">
              {hits.map((h, i) => {
                const Icon = KIND_ICON[h.kind];
                return (
                  <li key={h.kind + h.href} role="option" aria-selected={i === sel}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(h)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === sel ? "bg-[#E8EEF8]" : "hover:bg-zinc-50"}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#102C5B]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-900">{h.title}</span>
                        {h.subtitle && <span className="block truncate text-xs text-zinc-500">{h.subtitle}</span>}
                      </span>
                      <span className="text-[11px] capitalize text-zinc-400">{h.kind}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const NEW_ITEMS = [
  { href: "/panel/presupuestos?nuevo=1", label: "Presupuesto", icon: FileText },
  { href: "/panel/produccion/trabajos", label: "Trabajo libre", icon: Shirt },
  { href: "/panel/produccion/banderas", label: "Banderas", icon: Flag },
  { href: "/panel/produccion/dtf", label: "Hoja DTF", icon: Layers },
  { href: "/panel/tareas", label: "Tarea", icon: CheckSquare },
  { href: "/panel/clientes", label: "Cliente", icon: Users },
];

function NewMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#102C5B] px-4 text-sm font-semibold text-white hover:bg-[#0A1E40]"
      >
        <Plus className="h-4 w-4" /> Nuevo
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl">
          {NEW_ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-800 hover:bg-[#E8EEF8]">
                <Icon className="h-4 w-4 text-[#102C5B]" /> {it.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Barra superior de escritorio: buscador y botón "Nuevo". */
export function PanelTopbar() {
  return (
    <div className="sticky top-0 z-20 hidden items-center gap-3 border-b border-zinc-200 bg-white/95 px-8 py-3 backdrop-blur md:flex">
      <GlobalSearch />
      <div className="ml-auto">
        <NewMenu />
      </div>
    </div>
  );
}

export { GlobalSearch };
