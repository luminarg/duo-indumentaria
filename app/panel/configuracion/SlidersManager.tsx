"use client";

import { useState, useTransition } from "react";
import { createSlider, deleteSlider, toggleSlider } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { cn } from "@/lib/cn";

type Slider = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  active: boolean;
  sort_order: number;
};

export function SlidersManager({ sliders }: { sliders: Slider[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createSlider(formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear el slider");
      }
    });
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-sm font-semibold text-zinc-900">Sliders de la home</h2>
      <p className="mt-1 text-xs text-zinc-500">
        La primera imagen activa (por orden) se usa como fondo del hero en la home.
      </p>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {sliders.map((slider) => (
          <Card key={slider.id} className="flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slider.image_url} alt="" className="h-14 w-24 rounded object-cover" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-zinc-900">{slider.title || "Sin título"}</div>
              <div className="text-xs text-zinc-500">orden {slider.sort_order}</div>
            </div>
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await toggleSlider(slider.id, !slider.active);
                })
              }
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                slider.active ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-500"
              )}
            >
              {slider.active ? "Activo" : "Inactivo"}
            </button>
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await deleteSlider(slider.id);
                })
              }
              className="text-xs text-red-600"
            >
              Borrar
            </button>
          </Card>
        ))}
        {sliders.length === 0 && (
          <p className="text-sm text-zinc-400">Todavía no hay sliders cargados.</p>
        )}
      </div>

      <Card className="mt-6">
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-zinc-500">
            Imagen
            <input type="file" name="image" accept="image/*" required className="mt-1 block w-full text-sm" />
          </label>
          <Input name="title" placeholder="Título (opcional)" />
          <Input name="subtitle" placeholder="Subtítulo (opcional)" />
          <Input name="link_url" placeholder="Link al hacer clic (opcional)" />
          <Input type="number" name="sort_order" placeholder="Orden (0, 1, 2...)" defaultValue={0} className="w-32" />
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Subiendo..." : "Agregar slider"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
