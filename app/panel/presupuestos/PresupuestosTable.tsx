"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "../../components/ui/Card";
import { SearchInput } from "../../components/ui/SearchInput";
import { EmptyState } from "../../components/ui/EmptyState";

type Quote = {
  id: string;
  quote_number: string;
  status: string;
  total: number;
  order_id: string | null;
  clientName: string | null;
};

export function PresupuestosTable({ quotes }: { quotes: Quote[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((quote) =>
      [quote.quote_number, quote.status, quote.clientName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [quotes, query]);

  return (
    <div className="flex flex-col gap-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por número, cliente o estado..." />

      {filtered.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-5 py-3 font-medium">N°</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Pedido</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-zinc-100 last:border-0 hover:bg-white/40">
                  <td className="px-5 py-3">
                    <Link href={`/panel/presupuestos/${q.id}`} className="font-medium text-zinc-900 hover:underline">
                      {q.quote_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{q.clientName ?? "—"}</td>
                  <td className="px-5 py-3 capitalize text-zinc-600">{q.status}</td>
                  <td className="px-5 py-3 text-zinc-600">${Number(q.total).toLocaleString("es-AR")}</td>
                  <td className="px-5 py-3">
                    {q.order_id ? (
                      <Link href={`/panel/pedidos/${q.order_id}`} className="text-xs text-zinc-500 hover:underline">
                        Ver pedido
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-400">Sin generar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          message={query ? "No hay presupuestos que coincidan con la búsqueda." : "Todavía no cargaste ningún presupuesto."}
        />
      )}
    </div>
  );
}
