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
  CheckSquare,
  ArrowRight,
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
      .limit(4),
    supabase
      .from("tasks")
      .select("id, title, description, priority, due_date, status")
      .neq("status", "hecha")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
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
    ["cargado_por_cliente", "Cargado", UploadCloud],
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

      {/* Tareas — lo primero y más grande: es lo que hay que hacer HOY. */}
      <Card className="mb-8 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">Tareas pendientes</h2>
              {pendingCount > 0 && <p className="text-xs text-zinc-500">{pendingCount} por hacer</p>}
            </div>
          </div>
          <Link
            href="/panel/tareas"
            className="flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Ver todas <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {tasks.length > 0 ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {tasks.map((task) => {
              const overdue = isOverdue(task.due_date);
              return (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{task.title}</div>
                    {task.description && (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{task.description}</div>
                    )}
                    {task.due_date && (
                      <div className={cn("mt-1 text-xs", overdue ? "font-semibold text-red-600" : "text-zinc-500")}>
                        Vence {formatTaskDate(task.due_date)}
                        {overdue ? " · vencida" : ""}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.media
                    )}
                  >
                    {task.priority}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No hay tareas pendientes — todo al día.</p>
        )}
      </Card>

      {/* Todo lo demás, más chico y compacto. */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Pedidos por estado</h2>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {statuses.map(([key, label, Icon]) => (
          <Card key={key} className="flex flex-col items-center gap-0.5 p-2.5 text-center">
            <Icon className="h-3.5 w-3.5 text-zinc-400" />
            <div className="text-lg font-semibold text-zinc-800">{counts[key] ?? 0}</div>
            <div className="text-[10px] leading-tight text-zinc-500">{label}</div>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Métricas del mes</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3 text-center">
          <p className="text-[11px] font-medium text-zinc-500">Costo total (mes)</p>
          <p className="mt-0.5 text-base font-semibold text-zinc-900">{formatMoney(costoMensual)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[11px] font-medium text-zinc-500">Cobranza total (mes)</p>
          <p className="mt-0.5 text-base font-semibold text-zinc-900">{formatMoney(cobranzaMensual)}</p>
        </Card>
        <Link href="/panel/pedidos">
          <Card className="p-3 text-center transition-shadow hover:shadow-xl">
            <p className="text-[11px] font-medium text-zinc-500">Pedidos demorados</p>
            <p className="mt-0.5 text-base font-semibold text-red-600">{demorados}</p>
          </Card>
        </Link>
        <Link href="/panel/pedidos">
          <Card className="p-3 text-center transition-shadow hover:shadow-xl">
            <p className="text-[11px] font-medium text-zinc-500">Pedidos en tiempo</p>
            <p className="mt-0.5 text-base font-semibold text-green-600">{enTiempo}</p>
          </Card>
        </Link>
      </div>

      <div className="mt-5">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Próximos en agenda</h2>
            <Link href="/panel/agenda" className="text-xs text-zinc-500 hover:underline">
              Ver todo
            </Link>
          </div>
          {events && events.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-800">{event.title}</span>
                  <span className="text-xs text-zinc-500">
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
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No hay eventos próximos.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
