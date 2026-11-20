import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";

// Producción: pedidos listos para pasar del diseño al rollo.
// Se muestran los que están en "Diseño en moldería" y, abajo, los cerrados
// o cortando por si se quiere adelantar el armado.
const ACTIVE = ["diseno_molderia"];
const UPCOMING = ["cerrado", "cortando"];

export default async function ProduccionPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, team_or_group_name, contact_name, estimated_delivery_date, order_items(quantity)")
    .in("status", [...ACTIVE, ...UPCOMING])
    .order("estimated_delivery_date", { ascending: true, nullsFirst: false });

  const { data: layouts } = await supabase
    .from("production_layouts")
    .select("order_id, linear_meters, created_at")
    .order("created_at", { ascending: false });
  const lastLayout = new Map<string, { linear_meters: number }>();
  for (const l of layouts ?? []) if (l.order_id && !lastLayout.has(l.order_id)) lastLayout.set(l.order_id, l);

  const rows = (orders ?? []).map((o) => ({
    ...o,
    garments: (o.order_items as { quantity: number }[] | null)?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 0,
  }));
  const active = rows.filter((o) => ACTIVE.includes(o.status));
  const upcoming = rows.filter((o) => UPCOMING.includes(o.status));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Producción"
        description="Diseño sobre moldería, escalado de talles y rollo listo para imprimir y cortar."
        action={
          <div className="flex gap-2">
            <Link href="/panel/produccion/rollo-combinado" className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
              Rollo con varios pedidos
            </Link>
            <Link href="/panel/produccion/trabajos" className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
              Trabajos libres
            </Link>
            <Link href="/panel/produccion/dtf" className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
              DTF en papel
            </Link>
            <Link href="/panel/produccion/moldes" className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
              Moldería
            </Link>
          </div>
        }
      />
      <Section title="En diseño en moldería" rows={active} lastLayout={lastLayout} empty="No hay pedidos en diseño en moldería." />
      <Section title="Próximos (cerrados o cortando)" rows={upcoming} lastLayout={lastLayout} empty="No hay pedidos próximos." />
    </div>
  );
}

function Section({
  title,
  rows,
  lastLayout,
  empty,
}: {
  title: string;
  rows: { id: string; order_number: string; status: string; team_or_group_name: string | null; contact_name: string | null; estimated_delivery_date: string | null; garments: number }[];
  lastLayout: Map<string, { linear_meters: number }>;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500">{title}</h2>
      {rows.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-5 py-3 font-medium">N°</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Prendas</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Entrega aprox.</th>
                <th className="px-5 py-3 font-medium">Último rollo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const l = lastLayout.get(o.id);
                return (
                  <tr key={o.id} className="border-b border-zinc-100 last:border-0 hover:bg-white/40">
                    <td className="px-5 py-3">
                      <Link href={`/panel/produccion/${o.id}`} className="font-medium text-zinc-900 hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{o.team_or_group_name || o.contact_name || "—"}</td>
                    <td className="px-5 py-3 text-zinc-600">{o.garments}</td>
                    <td className="px-5 py-3"><Badge status={o.status} /></td>
                    <td className="px-5 py-3 text-zinc-600">
                      {o.estimated_delivery_date
                        ? new Date(`${o.estimated_delivery_date}T00:00:00`).toLocaleDateString("es-AR")
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{l ? `${Number(l.linear_meters).toFixed(2)} m` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState message={empty} />
      )}
    </section>
  );
}
