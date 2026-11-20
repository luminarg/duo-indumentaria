"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { DeliveryBadge } from "../../components/ui/DeliveryBadge";
import { SearchInput } from "../../components/ui/SearchInput";
import { EmptyState } from "../../components/ui/EmptyState";
import { orderStatusLabel } from "@/lib/orderStatus";

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

export function PedidosTable({ orders, siteUrl, initialQuery = "" }: { orders: Order[]; siteUrl: string; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.order_number, o.team_or_group_name, o.contact_name, o.status, orderStatusLabel(o.status)]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [orders, query]);

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por equipo, cliente, número o estado..."
      />

      {filtered.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-5 py-3 font-medium">Pedido</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Entrega aprox.</th>
                <th className="px-5 py-3 font-medium">Link del cliente</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100 last:border-0 hover:bg-white/40">
                  <td className="px-5 py-3">
                    {/* El nombre del equipo o cliente es lo que se reconoce; el número va chico. */}
                    <Link href={`/panel/pedidos/${order.id}`} className="block text-base font-semibold text-zinc-900 hover:underline">
                      {order.team_or_group_name || order.contact_name || order.order_number}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {order.order_number}
                      {order.team_or_group_name && order.contact_name ? ` · ${order.contact_name}` : ""}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge status={order.status} />
                      <DeliveryBadge status={order.status} estimatedDeliveryDate={order.estimated_delivery_date} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{formatDate(order.estimated_delivery_date)}</td>
                  <td className="px-5 py-3">
                    <CopyLink url={`${siteUrl}/pedido/${order.public_token}`} />
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

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
      className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      {done ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}
