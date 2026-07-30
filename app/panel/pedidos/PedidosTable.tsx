"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { DeliveryBadge } from "../../components/ui/DeliveryBadge";
import { SearchInput } from "../../components/ui/SearchInput";
import { EmptyState } from "../../components/ui/EmptyState";

type Order = {
  id: string;
  order_number: string;
  public_token: string;
  status: string;
  contact_name: string | null;
  team_or_group_name: string | null;
  estimated_delivery_date: string | null;
  created_at: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PedidosTable({ orders, siteUrl }: { orders: Order[]; siteUrl: string }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.order_number, o.team_or_group_name, o.contact_name, o.status]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [orders, query]);

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por número, cliente o estado..."
      />

      {filtered.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-5 py-3 font-medium">N°</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Entrega aprox.</th>
                <th className="px-5 py-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100 last:border-0 hover:bg-white/40">
                  <td className="px-5 py-3">
                    <Link
                      href={`/panel/pedidos/${order.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {order.team_or_group_name || order.contact_name || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge status={order.status} />
                      <DeliveryBadge status={order.status} estimatedDeliveryDate={order.estimated_delivery_date} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{formatDate(order.estimated_delivery_date)}</td>
                  <td className="px-5 py-3">
                    <code className="text-xs text-zinc-400">
                      {siteUrl}/pedido/{order.public_token}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          message={
            query
              ? "No hay pedidos que coincidan con la búsqueda."
              : "Todavía no hay pedidos generados. Cargá un presupuesto y generá el pedido desde ahí."
          }
        />
      )}
    </div>
  );
}
