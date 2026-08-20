"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createArticleType,
  updateArticleType,
  deleteArticleType,
  createArticleTypeSize,
  deleteArticleTypeSize,
} from "./actions";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

type ArticleTypeSize = {
  id: string;
  label: string;
  measurements: string | null;
};

type ArticleType = {
  id: string;
  name: string;
  requires_number: boolean;
  requires_name: boolean;
  sizes: ArticleTypeSize[];
};

function SizesEditor({ articleTypeId, sizes }: { articleTypeId: string; sizes: ArticleTypeSize[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createArticleTypeSize(articleTypeId, formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al agregar el talle");
      }
    });
  }

  function handleDelete(sizeId: string) {
    startTransition(async () => {
      await deleteArticleTypeSize(sizeId);
    });
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs font-medium text-zinc-500">Guía de talles</p>
      {error && <div className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">{error}</div>}

      {sizes.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {sizes.map((size) => (
            <div
              key={size.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-2.5 py-1.5 text-sm"
            >
              <div>
                <span className="font-medium text-zinc-800">{size.label}</span>
                {size.measurements && <span className="text-zinc-500"> — {size.measurements}</span>}
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(size.id)}
                className="text-zinc-400 hover:text-red-600"
                aria-label="Quitar talle"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {sizes.length === 0 && <p className="mb-2 text-xs text-zinc-400">Todavía no cargaste talles.</p>}

      <form onSubmit={handleAdd} className="grid grid-cols-[5rem_1fr_auto] items-center gap-1.5">
        <input
          name="label"
          placeholder="Talle (S, M...)"
          required
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <input
          name="measurements"
          placeholder="Medidas (opcional) — ej: Pecho 52cm, Largo 70cm"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center rounded-md bg-zinc-900 p-1.5 text-white hover:bg-zinc-800"
          aria-label="Agregar talle"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function ArticleTypeRow({ articleType }: { articleType: ArticleType }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateArticleType(articleType.id, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-1">
      {error && <div className="mb-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <Input label="Nombre" name="name" defaultValue={articleType.name} className="flex-1" />
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            Guardar
          </Button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm(`¿Borrar el tipo "${articleType.name}"?`)) {
                startTransition(async () => {
                  await deleteArticleType(articleType.id);
                });
              }
            }}
            className="pb-2 text-xs text-red-600"
          >
            Borrar
          </button>
        </div>
        <div className="flex gap-4 text-sm text-zinc-700">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="requires_number" defaultChecked={articleType.requires_number} />
            Lleva número
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="requires_name" defaultChecked={articleType.requires_name} />
            Lleva nombre
          </label>
        </div>
      </form>

      <SizesEditor articleTypeId={articleType.id} sizes={articleType.sizes} />
    </Card>
  );
}

export function ArticleTypesManager({ articleTypes }: { articleTypes: ArticleType[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createArticleType(formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear el tipo de artículo");
      }
    });
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-sm font-semibold text-zinc-900">Tipos de artículo</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Ej: Remera manga corta, Pantalón, Buzo. Cada uno define si lleva número/nombre por defecto y su propia
        guía de talles — se usan al cargar artículos en un presupuesto.
      </p>

      {error && <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="mt-4 flex flex-col gap-3">
        {articleTypes.map((at) => (
          <ArticleTypeRow key={at.id} articleType={at} />
        ))}
        {articleTypes.length === 0 && (
          <p className="text-sm text-zinc-400">Todavía no cargaste tipos de artículo.</p>
        )}
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">Agregar tipo de artículo</h3>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input name="name" placeholder="Ej: Remera manga corta" required className="flex-1" />
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Agregando..." : "Agregar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
