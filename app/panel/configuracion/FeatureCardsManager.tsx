"use client";

import { useState, useTransition } from "react";
import { createFeature, updateFeature, toggleFeature, deleteFeature } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { FEATURE_ICON_OPTIONS, getFeatureIcon } from "@/lib/featureIcons";
import { cn } from "@/lib/cn";

type Feature = {
  id: string;
  icon: string;
  title: string;
  description: string;
  sort_order: number;
  active: boolean;
};

function FeatureRow({ feature }: { feature: Feature }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const Icon = getFeatureIcon(feature.icon);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateFeature(feature.id, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
            <Icon className="h-5 w-5" />
          </div>
          <Select name="icon" defaultValue={feature.icon} className="flex-1">
            {FEATURE_ICON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            name="sort_order"
            defaultValue={feature.sort_order}
            className="w-20"
            title="Orden"
          />
        </div>
        <Input label="Título" name="title" defaultValue={feature.title} />
        <Textarea label="Descripción" name="description" defaultValue={feature.description} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await toggleFeature(feature.id, !feature.active);
                })
              }
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                feature.active ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-500"
              )}
            >
              {feature.active ? "Activa" : "Inactiva"}
            </button>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await deleteFeature(feature.id);
              })
            }
            className="text-xs text-red-600"
          >
            Borrar
          </button>
        </div>
      </form>
    </Card>
  );
}

export function FeatureCardsManager({ features }: { features: Feature[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createFeature(formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear la tarjeta");
      }
    });
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-sm font-semibold text-zinc-900">Tarjetas con ícono (home)</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Las tarjetas que aparecen debajo del hero. Agregá, sacá o reordená las que necesites.
      </p>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {features.map((feature) => (
          <FeatureRow key={feature.id} feature={feature} />
        ))}
        {features.length === 0 && (
          <p className="text-sm text-zinc-400">Todavía no hay tarjetas cargadas.</p>
        )}
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">Agregar tarjeta</h3>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <Select name="icon" defaultValue="shirt">
            {FEATURE_ICON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Input name="title" placeholder="Título" required />
          <Textarea name="description" placeholder="Descripción" required />
          <Input
            type="number"
            name="sort_order"
            placeholder="Orden (0, 1, 2...)"
            defaultValue={features.length}
            className="w-32"
          />
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Agregando..." : "Agregar tarjeta"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
