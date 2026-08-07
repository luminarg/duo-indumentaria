"use client";

import { useMemo, useState, useTransition } from "react";
import { createQuoteItem, updateQuoteItem, deleteQuoteItem } from "../actions";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type QuoteItem = {
  id: string;
  description: string;
  unit_price: number;
  quantity: number;
};

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

function ItemRow({ item, quoteId }: { item: QuoteItem; quoteId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unitPrice, setUnitPrice] = useState(item.unit_price);
  const [quantity, setQuantity] = useState(item.quantity);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateQuoteItem(item.id, quoteId, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form
      onSubmit={handleSave}
      className="grid grid-cols-[1fr_7rem_5rem_6rem_auto] items-end gap-2 border-b border-zinc-100 py-2 last:border-0"
    >
      <Input name="description" defaultValue={item.description} />
      <Input
        type="number"
        step="0.01"
        name="unit_price"
        value={unitPrice}
        onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
      />
      <Input
        type="number"
        name="quantity"
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value) || 0)}
      />
      <span className="pb-2 text-sm text-zinc-600">{formatMoney(unitPrice * quantity)}</span>
      <div className="flex items-center gap-2 pb-1">
        <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
          Guardar
        </Button>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await deleteQuoteItem(item.id, quoteId);
            })
          }
          className="text-xs text-red-600"
        >
          Borrar
        </button>
      </div>
      {error && <div className="col-span-5 text-xs text-red-600">{error}</div>}
    </form>
  );
}

export function QuoteItemsManager({ quoteId, items }: { quoteId: string; items: QuoteItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.unit_price) * Number(i.quantity), 0),
    [items]
  );

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createQuoteItem(quoteId, formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al agregar el artículo");
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-zinc-900">Artículos</h2>
      <p className="mb-3 text-xs text-zinc-500">
        El total y la seña se calculan solos a partir de estos artículos.
      </p>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      {items.length > 0 && (
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_7rem_5rem_6rem_auto] gap-2 border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-500">
            <span>Descripción</span>
            <span>Precio unit.</span>
            <span>Cant.</span>
            <span>Subtotal</span>
            <span></span>
          </div>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} quoteId={quoteId} />
          ))}
        </div>
      )}

      {items.length === 0 && <p className="mb-3 text-sm text-zinc-400">Todavía no cargaste artículos.</p>}

      <form onSubmit={handleCreate} className="grid grid-cols-[1fr_7rem_5rem_auto] items-end gap-2 border-t border-zinc-200 pt-3">
        <Input name="description" placeholder="Ej: Camiseta manga corta" required />
        <Input type="number" step="0.01" name="unit_price" placeholder="Precio unit." defaultValue={0} />
        <Input type="number" name="quantity" placeholder="Cant." defaultValue={1} />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Agregando..." : "Agregar"}
        </Button>
      </form>

      <div className="mt-4 flex justify-end border-t border-zinc-200 pt-3">
        <div className="text-right">
          <div className="text-xs text-zinc-500">Total</div>
          <div className="text-lg font-bold text-zinc-900">{formatMoney(total)}</div>
        </div>
      </div>
    </Card>
  );
}
