import Link from "next/link";
import {
  FileEdit,
  UploadCloud,
  Lock,
  Scissors,
  Ruler,
  Stamp,
  Shirt,
  Truck,
  CheckSquare,
  ArrowRight,
  AlertTriangle,
  Clock,
  Wallet,
  Receipt,
} from "lucide-react";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/orderStatus";
import { Badge } from "../components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../components/ui/Card";
import { cn } from "@/lib/cn";

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(`${dueDate}T00:00:00`) < new Date(new Date().toDateString());
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
    profile,
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
    supabase
      .from("orders")
      .select("id, order_number, team_or_group_name, contact_name, status, estimated_delivery_date")
      .neq("status", "entregado")
      .order("estimated_delivery_date", { ascending: true, nullsFirst: false }),
    supabase.auth.getUser().then(async ({ data }) =>
      data.user ? (await supabase.from("profiles").select("full_name").eq("id", data.user.id).single()).data : null
    ),
  ]);

  const counts = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const statuses = [
    ["borrador", "Borrador", FileEdit],
    ["cargado_por_cliente", "Cargado", UploadCloud],
    ["cerrado", "Cerrado", Lock],
    ["cortando", "Cortando", Scissors],
    ["diseno_molderia", "Moldería", Ruler],
    ["sublimacion_estampado", "Sublimación", Stamp],
    ["costura_terminaciones", "Costura", Shirt],
    ["entregado", "Entregado", Truck],
  ] as const;

  const tasks = tasksRaw ?? [];
  const pendingCount = tasks.length;

  // Costo total del mes: todo lo cargado en Compras y gastos con fecha de
  // este mes (compras con proveedor + gastos generales, ya unificados).
  const costoMensual = (monthPurchases ?? []).reduce((sum, p) => sum + Number(p.real_cost ?? 0), 0);

  // Cobranza total del mes: seña cobrada (cuando el pedido pasó a "cerrado")
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
  for (const o of activeOrders ?? []) if (o.estimated_delivery_date && o.estimated_delivery_date < todayStr) demorados += 1;

  // ── Lo que necesita atención hoy ──────────────────────────────────────
  const today = new Date(todayStr + "T00:00:00");
  const daysTo = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - today.getTime()) / 86_400_000);
  const STEP_INDEX: Record<string, number> = Object.fromEntries(ORDER_STATUSES.map((st, k) => [st, k]));
  const beforeSublim = (st: string) => (STEP_INDEX[st] ?? 0) < STEP_INDEX.sublimacion_estampado;
  const nameOf = (o: { team_or_group_name: string | null; contact_name: string | null; order_number: string }) => o.team_or_group_name || o.contact_name || o.order_number;
  type Todo = { key: string; tone: "red" | "orange" | "blue"; title: string; detail: string; href: string; action: string };
  const todos: Todo[] = [];
  for (const o of activeOrders ?? []) {
    if (!o.estimated_delivery_date) continue;
    const d = daysTo(o.estimated_delivery_date);
    if (d < 0) todos.push({ key: o.id, tone: "red", title: nameOf(o), detail: `${o.order_number} · atrasado ${-d} ${-d === 1 ? "día" : "días"} (${orderStatusLabel(o.status)})`, href: `/panel/pedidos/${o.id}`, action: "Ver pedido" });
    else if (d <= 10 && beforeSublim(o.status))
      todos.push({ key: o.id, tone: "orange", title: nameOf(o), detail: `${o.order_number} · entrega en ${d} ${d === 1 ? "día" : "días"} y sigue en ${orderStatusLabel(o.status).toLowerCase()}`, href: ["cerrado", "cortando", "diseno_molderia"].includes(o.status) ? `/panel/produccion/${o.id}` : `/panel/pedidos/${o.id}`, action: ["cerrado", "cortando", "diseno_molderia"].includes(o.status) ? "Ir a producción" : "Ver pedido" });
  }
  for (const t of tasks)
    if (t.due_date && t.due_date <= todayStr)
      todos.push({ key: t.id, tone: "blue", title: t.title, detail: `Tarea · ${isOverdue(t.due_date) ? "vencida" : "vence hoy"}`, href: "/panel/tareas", action: "Ver tarea" });
  const TONE = { red: "bg-red-50 text-red-700", orange: "bg-orange-50 text-orange-700", blue: "bg-[#E8EEF8] text-[#102C5B]" } as const;
  const weekDeliveries = (activeOrders ?? []).filter((o) => o.estimated_delivery_date && daysTo(o.estimated_delivery_date) >= 0 && daysTo(o.estimated_delivery_date) <= 7).length;
  const upcomingList = (activeOrders ?? []).filter((o) => o.estimated_delivery_date).slice(0, 6);
  const firstName = (profile?.full_name || "").split(" ")[0];
  const hour = now.getHours();
  const hello = hour < 13 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#102C5B]">
          {hello}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · esto es lo que necesita atención hoy.
        </p>
      </div>

      {/* Pedidos por etapa: cada una lleva a la lista filtrada. */}
      <Card className="p-5">
        <div className="mb-3 flex items-center">
          <h2 className="text-sm font-bold text-zinc-900">Pedidos por etapa</h2>
          <Link href="/panel/pedidos" className="ml-auto flex items-center gap-1 text-sm font-medium text-[#102C5B] hover:underline">
            Ver todos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {statuses.map(([key, label, Icon]) => (
            <Link
              key={key}
              href={`/panel/pedidos?q=${encodeURIComponent(orderStatusLabel(key))}`}
              className={cn("flex flex-col gap-1 rounded-xl p-3 transition-colors", (counts[key] ?? 0) > 0 ? "bg-[#E8EEF8] text-[#102C5B] hover:bg-[#dbe4f3]" : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100")}
            >
              <Icon className="h-4 w-4" />
              <span className="text-2xl font-extrabold leading-none">{counts[key] ?? 0}</span>
              <span className="text-xs font-semibold leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 px-5 py-4">
            <h2 className="text-sm font-bold text-zinc-900">Para hacer hoy</h2>
            {todos.some((t) => t.tone === "red") && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">Hay atrasados</span>}
            <Link href="/panel/tareas" className="ml-auto text-sm font-medium text-[#102C5B] hover:underline">
              Tareas ({pendingCount})
            </Link>
          </div>
          {todos.length ? (
            <ul>
              {todos.slice(0, 8).map((t) => (
                <li key={t.tone + t.key} className="flex items-center gap-3 border-t border-zinc-100 px-5 py-3">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE[t.tone])}>
                    {t.tone === "blue" ? <CheckSquare className="h-4 w-4" /> : t.tone === "red" ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-900">{t.title}</div>
                    <div className="truncate text-xs text-zinc-500">{t.detail}</div>
                  </div>
                  <Link href={t.href} className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                    {t.action}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-zinc-100 px-5 py-6 text-sm text-zinc-500">Nada urgente: no hay pedidos atrasados ni tareas que venzan hoy.</p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 self-start">
          <Kpi icon={Truck} tone="bg-[#E6F7FD] text-[#0B6E99]" label="Entregas en 7 días" value={String(weekDeliveries)} href="/panel/pedidos" />
          <Kpi icon={AlertTriangle} tone="bg-red-50 text-red-700" label="Pedidos atrasados" value={String(demorados)} href="/panel/pedidos" />
          <Kpi icon={Wallet} tone="bg-green-50 text-green-700" label="Cobrado este mes" value={formatMoney(cobranzaMensual)} />
          <Kpi icon={Receipt} tone="bg-zinc-100 text-zinc-700" label="Gastos este mes" value={formatMoney(costoMensual)} href="/panel/compras" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="overflow-x-auto p-0">
          <h2 className="px-5 pb-2 pt-4 text-sm font-bold text-zinc-900">Próximas entregas</h2>
          {upcomingList.length ? (
            <table className="w-full text-left text-sm">
              <tbody>
                {upcomingList.map((o) => {
                  const d = daysTo(o.estimated_delivery_date!);
                  const pct = Math.round((((STEP_INDEX[o.status] ?? 0) + 1) / ORDER_STATUSES.length) * 100);
                  return (
                    <tr key={o.id} className="border-t border-zinc-100">
                      <td className="px-5 py-3">
                        <Link href={`/panel/pedidos/${o.id}`} className="block font-semibold text-zinc-900 hover:underline">
                          {nameOf(o)}
                        </Link>
                        <span className="text-xs text-zinc-500">{o.order_number}</span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className={cn("font-semibold", d < 0 ? "text-red-600" : d <= 7 ? "text-orange-700" : "text-zinc-700")}>
                          {new Date(`${o.estimated_delivery_date}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                        </div>
                        <div className="text-zinc-500">{d < 0 ? `atrasado ${-d} d` : d === 0 ? "hoy" : `en ${d} d`}</div>
                      </td>
                      <td className="px-3 py-3"><Badge status={o.status} /></td>
                      <td className="w-32 px-5 py-3">
                        <div className="h-1.5 rounded-full bg-zinc-100" aria-label={`Avance ${pct}%`}>
                          <div className="h-1.5 rounded-full bg-[#00AEEF]" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-5 pb-5 text-sm text-zinc-500">No hay pedidos con fecha de entrega.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">Próximos en agenda</h2>
            <Link href="/panel/agenda" className="text-sm font-medium text-[#102C5B] hover:underline">
              Ver todo
            </Link>
          </div>
          {events && events.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {events.map((event) => (
                <li key={event.id} className="flex flex-col">
                  <span className="text-sm font-semibold text-zinc-900">{event.title}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(event.event_at).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {(event.clients as unknown as { name: string } | null)?.name ? ` · ${(event.clients as unknown as { name: string }).name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No hay eventos próximos.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, href }: { icon: typeof Truck; tone: string; label: string; value: string; href?: string }) {
  const body = (
    <Card className="flex h-full flex-col gap-2 p-4">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <span className="text-xl font-extrabold text-zinc-900">{value}</span>
    </Card>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}
