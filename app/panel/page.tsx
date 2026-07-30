import Link from "next/link";
import {
  FileEdit,
  UploadCloud,
  HandCoins,
  Scissors,
  Stamp,
  Shirt,
  Package,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { cn } from "@/lib/cn";

const PRIORITY_STYLES: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-800",
  baja: "bg-zinc-100 text-zinc-600",
};

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(`${dueDate}T00:00:00`) < new Date(new Date().toDateString());
}

function formatTaskDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

type QuoteAmounts = { total: number; deposit_amount: number } | null;

function firstQuote(q: unknown): QuoteAmounts {
  if (!q) return null;
  const quote = Array.isArray(q) ? q[0] : q;
  if (!quote) return null;
  return { total: Number(quote.total ?? 0), deposit_amount: Number(quote.deposit_amount ?? 0) };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const startOfMonthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStr = now.toISOString().slice(0, 10);

  const [
    { data: orders },
    { data: events },
    { data: tasksRaw },
    { data: monthPurchases },
    { data: depositedOrders },
    { data: deliveredOrders },
    { data: activeOrders },
  ] = await Promise.all([
    supabase.from("orders").select("status"),
    supabase
      .from("agenda_events")
      .select("id, title, event_type, event_at, clients(name)")
      .gte("event_at", now.toISOString())
      .order("event_at", { ascending: true })
      .limit(5),
    supabase
      .from("tasks")
      .select("id, title, priority, due_date, status")
      .neq("status", "hecha")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6),
    supabase.from("purchases").select("real_cost").gte("purchase_date", startOfMonthDate),
    supabase.from("orders").select("id, quotes(deposit_amount)").gte("deposit_paid_at", startOfMonthIso),
    supabase.from("orders").select("id, quotes(total, deposit_amount)").gte("delivered_at", startOfMonthIso),
    supabase.from("orders").select("status, estimated_delivery_date").neq("status", "entregado"),
  ]);

  const counts = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const statuses = [
    ["borrador", "Borrador", FileEdit],
    ["cargado_por_cliente", "Cargado por cliente", UploadCloud],
    ["senado", "Señado", HandCoins],
    ["cortando", "Cortando", Scissors],
    ["estampando", "Estampando", Stamp],
    ["armando", "Armando", Shirt],
    ["embalando", "Embalando", Package],
    ["entregado", "Entregado", Truck],
  ] as const;

  const tasks = tasksRaw ?? [];
  const pendingCount = tasks.length;

  // Costo total del mes: todo lo cargado en Compras y gastos con fecha de
  // este mes (compras con proveedor + gastos generales, ya unificados).
  const costoMensual = (monthPurchases ?? []).reduce((sum, p) => sum + Number(p.real_cost ?? 0), 0);

  // Cobranza total del mes: seña cobrada (cuando el pedido pasó a "señado")
  // + saldo cobrado (cuando se marcó "entregado"), cruzando con el monto del
  // presupuesto que generó cada pedido.
  const cobranzaSenas = (depositedOrders ?? []).reduce((sum, o) => {
    const quote = firstQuote(o.quotes);
    return sum + (quote?.deposit_amount ?? 0);
  }, 0);
  const cobranzaSaldos = (deliveredOrders ?? []).reduce((sum, o) => {
    const quote = firstQuote(o.quotes);
    if (!quote) return sum;
    return sum + (quote.total - quote.deposit_amount);
  }, 0);
  const cobranzaMensual = cobranzaSenas + cobranzaSaldos;

  // Pedidos demorados / en tiempo: solo cuenta los que ya tienen fecha de
  // entrega aproximada cargada y todavía no fueron entregados.
  let demorados = 0;
  let enTiempo = 0;
  for (const o of activeOrders ?? []) {
    if (!o.estimated_delivery_date) continue;
    if (o.estimated_delivery_date < todayStr) demorados += 1;
    else enTiempo += 1;
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Estado general de los pedidos." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {statuses.map(([key, label, Icon]) => (
          <Card key={key} className="flex flex-col items-center gap-1 text-center">
            <Icon className="h-5 w-5 text-zinc-400" />
            <div className="text-3xl font-bold text-zinc-900">{counts[key] ?? 0}</div>
            <div className="text-xs text-zinc-600">{label}</div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-700">Métricas del mes</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="text-center">
          <p className="text-xs font-medium text-zinc-500">Costo total (mes)</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">{formatMoney(costoMensual)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-medium text-zinc-500">Cobranza total (mes)</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">{formatMoney(cobranzaMensual)}</p>
        </Card>
        <Link href="/panel/pedidos">
          <Card className="text-center transition-shadow hover:shadow-xl">
            <p className="text-xs font-medium text-zinc-500">Pedidos demorados</p>
            <p className="mt-1 text-xl font-semibold text-red-600">{demorados}</p>
          </Card>
        </Link>
        <Link href="/panel/pedidos">
          <Card className="text-center transition-shadow hover:shadow-xl">
            <p className="text-xs font-medium text-zinc-500">Pedidos en tiempo</p>
            <p className="mt-1 text-xl font-semibold text-green-600">{enTiempo}</p>
          </Card>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Próximos en agenda</h2>
            <Link href="/panel/agenda" className="text-xs text-zinc-500 hover:underline">
              Ver todo
            </Link>
          </div>
          {events && events.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="text-sm">
                  <div className="font-medium text-zinc-900">{event.title}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(event.event_at).toLocaleString("es-AR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {(event.clients as unknown as { name: string } | null)?.name
                      ? ` · ${(event.clients as unknown as { name: string }).name}`
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No hay eventos próximos.</p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Tareas pendientes {pendingCount > 0 && <span className="text-zinc-400">({pendingCount})</span>}
            </h2>
            <Link href="/panel/tareas" className="text-xs text-zinc-500 hover:underline">
              Ver todo
            </Link>
          </div>
          {tasks.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => {
                const overdue = isOverdue(task.due_date);
                return (
                  <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
                    <div>
                      <div className="font-medium text-zinc-900">{task.title}</div>
                      {task.due_date && (
                        <div className={cn("text-xs", overdue ? "font-medium text-red-600" : "text-zinc-500")}>
                          Vence {formatTaskDate(task.due_date)}
                          {overdue ? " · vencida" : ""}
                        </div>
                      )}
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.media)}>
                      {task.priority}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No hay tareas pendientes.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
