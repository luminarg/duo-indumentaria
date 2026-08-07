"use client";

import { useState, useTransition } from "react";
import { updateQuote } from "../actions";
import { Card } from "../../../components/ui/Card";
import { Input, Textarea, Select } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type Quote = {
  id: string;
  items_description: string | null;
  fabric: string | null;
  color_scheme: string | null;
  pattern_notes: string | null;
  total: number;
  deposit_amount: number;
  deposit_percent: number;
  valid_until: string | null;
  notes: string | null;
  status: string;
};

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

const STATUSES = ["borrador", "enviado", "aprobado", "vencido", "rechazado"];

export function QuoteDetail({ quote }: { quote: Quote }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateQuote(quote.id, formData);
        setMessage("Guardado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <Card>
      {error && <div className="mb-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div className="mb-3 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <Textarea
          label="Qué pidió el cliente"
          name="items_description"
          defaultValue={quote.items_description ?? ""}
          className="sm:col-span-2"
          hint="Resumen libre para tu referencia interna — no se desglosa en el PDF, para eso están los artículos."
        />
        <Input
          label="Tela"
          name="fabric"
          defaultValue={quote.fabric ?? ""}
          hint="Tipo de tela a usar (opcional)."
        />
        <Input
          label="Color / diseño"
          name="color_scheme"
          defaultValue={quote.color_scheme ?? ""}
          hint="Combinación de colores o esquema acordado."
        />
        <Textarea
          label="Notas de moldería"
          name="pattern_notes"
          defaultValue={quote.pattern_notes ?? ""}
          className="sm:col-span-2"
          hint="Detalles de corte/molde para producción (opcional)."
        />
        <div className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Monto total (según artículos)
          <div className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900">
            {formatMoney(quote.total)}
          </div>
        </div>
        <Input
          label="% de seña"
          type="number"
          name="deposit_percent"
          defaultValue={quote.deposit_percent}
          hint="Porcentaje que le pedís de seña para confirmar el pedido."
        />
        <div className="flex flex-col gap-1 text-xs font-medium text-zinc-500 sm:col-span-2">
          Seña calculada
          <div className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900">
            {formatMoney(quote.deposit_amount)}
          </div>
        </div>
        <Input
          label="Válido hasta"
          type="date"
          name="valid_until"
          defaultValue={quote.valid_until ?? ""}
          hint="Fecha límite de validez del presupuesto (opcional)."
        />
        <Select
          label="Estado"
          name="status"
          defaultValue={quote.status}
          hint="Se actualiza solo a 'aprobado' cuando generás el pedido."
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Textarea
          label="Notas"
          name="notes"
          defaultValue={quote.notes ?? ""}
          className="sm:col-span-2"
          hint="Para vos o para el cliente — aparece en el PDF si lo completás."
        />

        <Button type="submit" disabled={isPending} className="self-start sm:col-span-2">
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </form>
    </Card>
  );
}
