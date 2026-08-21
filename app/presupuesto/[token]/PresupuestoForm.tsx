"use client";

import { useMemo, useState, useTransition } from "react";
import { submitQuoteQuantities } from "./actions";

type Item = { id: string; description: string; unitPrice: number; quantity: number };

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

export function PresupuestoForm({
  token,
  items,
  depositPercent,
}: {
  token: string;
  items: Item[];
  depositPercent: number;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.quantity]))
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ total: number; depositAmount: number; depositPercent: number } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPrice * (quantities[item.id] ?? 0), 0),
    [items, quantities]
  );
  const depositAmount = (total * depositPercent) / 100;

  function updateQuantity(itemId: string, value: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, value) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitQuoteQuantities({
        token,
        quantities: items.map((item) => ({ itemId: item.id, quantity: quantities[item.id] ?? 0 })),
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setConfirmed({ total: result.total, depositAmount: result.depositAmount, depositPercent: result.depositPercent });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
      {confirmed && (
        <div className="rounded-md bg-green-50 px-4 py-4 text-sm text-green-800">
          <p className="font-medium">¡Gracias! Confirmamos tu presupuesto.</p>
          <div className="mt-3 flex items-center justify-between">
            <span>Total</span>
            <span className="text-base font-semibold">{formatMoney(confirmed.total)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Seña ({confirmed.depositPercent}%)</span>
            <span className="text-base font-semibold">{formatMoney(confirmed.depositAmount)}</span>
          </div>
          <p className="mt-3 text-xs text-green-700">
            Si todavía querés cambiar alguna cantidad, podés hacerlo abajo y volver a confirmar.
          </p>
        </div>
      )}
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-zinc-900">Artículos</p>
        <p className="-mt-2 text-xs text-zinc-500">
          Ajustá la cantidad de cada artículo. El total se actualiza solo a medida que cargás.
        </p>

        <div className="overflow-hidden rounded-md border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="px-3 py-2 text-left font-medium">Artículo</th>
                <th className="w-16 px-2 py-2 text-right font-medium">Cant.</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 text-zinc-800">
                    {item.description}
                    <p className="text-xs text-zinc-400">{formatMoney(item.unitPrice)} c/u</p>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      value={quantities[item.id] ?? 0}
                      onChange={(e) => updateQuantity(item.id, Number(e.target.value) || 0)}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-800">
                    {formatMoney(item.unitPrice * (quantities[item.id] ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md bg-zinc-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between font-semibold text-zinc-900">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-zinc-600">
            <span>Seña ({depositPercent}%)</span>
            <span>{formatMoney(depositAmount)}</span>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Guardando..." : "Confirmar presupuesto"}
      </button>
    </form>
  );
}
