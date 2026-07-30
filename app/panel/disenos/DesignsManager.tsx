"use client";

import { useMemo, useState, useTransition } from "react";
import { createDesign, deleteDesign, toggleDesign } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";
import { cn } from "@/lib/cn";

type Design = {
  id: string;
  image_url: string;
  title: string | null;
  active: boolean;
  sort_order: number;
};

export function DesignsManager({ designs }: { designs: Design[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredDesigns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return designs;
    return designs.filter((d) => (d.title ?? "").toLowerCase().includes(q));
  }, [designs, query]);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createDesign(formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir el diseño");
      }
    });
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Subir diseño</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-zinc-500">
            Imagen
            <input type="file" name="image" accept="image/*" required className="mt-1 block w-full text-sm" />
          </label>
          <Input name="title" placeholder="Título (opcional)" />
          <Input type="number" name="sort_order" placeholder="Orden (0, 1, 2...)" defaultValue={0} className="w-32" />
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Subiendo..." : "Agregar diseño"}
          </Button>
        </form>
      </Card>

      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por título..." className="mb-4" />

      {filteredDesigns.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {filteredDesigns.map((design) => (
            <Card key={design.id} className="flex flex-col gap-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={design.image_url} alt={design.title ?? ""} className="aspect-square w-full rounded object-cover" />
              <span className="truncate text-xs text-zinc-600">{design.title || "Sin título"}</span>
              <div className="flex items-center justify-between">
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await toggleDesign(design.id, !design.active);
                    })
                  }
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    design.active ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {design.active ? "Activo" : "Inactivo"}
                </button>
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteDesign(design.id);
                    })
                  }
                  className="text-xs text-red-600"
                >
                  Borrar
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-400">
          {query ? "No hay diseños que coincidan con la búsqueda." : "Todavía no subiste ningún diseño."}
        </p>
      )}
    </div>
  );
}
