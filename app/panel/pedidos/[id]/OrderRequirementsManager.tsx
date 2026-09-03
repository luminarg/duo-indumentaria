"use client";

import { useState, useTransition } from "react";
import { createOrderRequirement, updateOrderRequirement, deleteOrderRequirement } from "../actions";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type Requirement = {
  id: string;
  description: string;
  unit_price: number;
  quantity_quoted: number | null;
  article_type_id: string | null;
  requires_number: boolean;
  requires_name: boolean;
};

type ArticleType = { id: string; name: string; requires_number: boolean; requires_name: boolean };

function RequirementRow({
  requirement,
  orderId,
  articleTypes,
}: {
  requirement: Requirement;
  orderId: string;
  articleTypes: ArticleType[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unitPrice, setUnitPrice] = useState(requirement.unit_price);
  const [articleTypeId, setArticleTypeId] = useState(requirement.article_type_id ?? "");
  const [requiresNumber, setRequiresNumber] = useState(requirement.requires_number);
  const [requiresName, setRequiresName] = useState(requirement.requires_name);

  function handleArticleTypeChange(id: string) {
    setArticleTypeId(id);
    const at = articleTypes.find((a) => a.id === id);
    if (at) {
      setRequiresNumber(at.requires_number);
      setRequiresName(at.requires_name);
    }
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateOrderRequirement(requirement.id, orderId, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="border-b border-zinc-100 py-2 last:border-0">
      <div className="grid grid-cols-[1fr_7rem_6rem_auto] items-end gap-2">
        <Input name="description" defaultValue={requirement.description} />
        <Input
          type="number"
          step="0.01"
          name="unit_price"
          value={unitPrice}
          onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
        />
        <Input type="number" name="quantity_quoted" defaultValue={requirement.quantity_quoted ?? ""} placeholder="Cant. ref." />
        <div className="flex items-center gap-2 pb-1">
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            Guardar
          </Button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await deleteOrderRequirement(requirement.id, orderId);
              })
            }
            className="text-xs text-red-600"
          >
            Borrar
          </button>
        </div>
      </div>

      {articleTypes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <select
            name="article_type_id"
            value={articleTypeId}
            onChange={(e) => handleArticleTypeChange(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs focus:border-zinc-500 focus:outline-none"
          >
            <option value="">Sin tipo de artículo</option>
            {articleTypes.map((at) => (
              <option key={at.id} value={at.id}>
                {at.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-zinc-600">
            <input
              type="checkbox"
              name="requires_number"
              checked={requiresNumber}
              onChange={(e) => setRequiresNumber(e.target.checked)}
            />
            Lleva número
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-600">
            <input
              type="checkbox"
              name="requires_name"
              checked={requiresName}
              onChange={(e) => setRequiresName(e.target.checked)}
            />
            Lleva nombre
          </label>
        </div>
      )}
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </form>
  );
}

export function OrderRequirementsManager({
  orderId,
  requirements,
  articleTypes,
}: {
  orderId: string;
  requirements: Requirement[];
  articleTypes: ArticleType[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createOrderRequirement(orderId, formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al agregar el artículo");
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-zinc-900">Artículos del pedido</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Podés agregar, editar o borrar artículos en cualquier momento, aunque el pedido ya esté generado — por
        ejemplo si el cliente pide sumar algo después de haber cargado sus cantidades. Al agregar uno nuevo, el
        cliente lo va a ver la próxima vez que entre a su link para cargar la cantidad.
      </p>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      {requirements.length > 0 && (
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_7rem_6rem_auto] gap-2 border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-500">
            <span>Descripción</span>
            <span>Precio unit.</span>
            <span>Cant. ref.</span>
            <span></span>
          </div>
          {requirements.map((r) => (
            <RequirementRow key={r.id} requirement={r} orderId={orderId} articleTypes={articleTypes} />
          ))}
        </div>
      )}

      {requirements.length === 0 && <p className="mb-3 text-sm text-zinc-400">Todavía no hay artículos cargados.</p>}

      <form onSubmit={handleCreate} className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
        {articleTypes.length > 0 && (
          <select
            name="article_type_id"
            defaultValue=""
            className="self-start rounded-md border border-zinc-300 px-2 py-1 text-xs focus:border-zinc-500 focus:outline-none"
          >
            <option value="">Sin tipo de artículo</option>
            {articleTypes.map((at) => (
              <option key={at.id} value={at.id}>
                {at.name}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-[1fr_7rem_6rem_auto] items-end gap-2">
          <Input name="description" placeholder="Ej: Buzo con capucha" required />
          <Input type="number" step="0.01" name="unit_price" placeholder="Precio unit." defaultValue={0} />
          <Input type="number" name="quantity_quoted" placeholder="Cant. ref." />
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Agregando..." : "Agregar"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
