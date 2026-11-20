import Link from "next/link";
import { ArrowRight, Check, Flag, Layers, Rows3, Ruler, Shirt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { cn } from "@/lib/cn";

// Producción: cada pedido con el paso en el que está (diseño → mockup →
// rollo → sublimación) y un botón que lleva a lo que sigue. Arriba, las
// herramientas que no dependen de un pedido.
const TO_PRODUCE = ["cerrado", "cortando", "diseno_molderia"];
const SUBLIM = ["sublimacion_estampado"];

const TOOLS = [
  { href: "/panel/produccion/rollo-combinado", icon: Rows3, title: "Rollo combinado", text: "Juntá pedidos y trabajos para aprovechar la tela" },
  { href: "/panel/produccion/banderas", icon: Flag, title: "Banderas", text: "Medida, diseño y cantidad" },
  { href: "/panel/produccion/dtf", icon: Layers, title: "DTF en papel", text: "Escudos y logos en hoja, PNG 300 dpi" },
  { href: "/panel/produccion/trabajos", icon: Shirt, title: "Trabajos libres", text: "Escalado para un tercero" },
  { href: "/panel/produccion/moldes", icon: Ruler, title: "Moldería", text: "Moldes y talles" },
];

type Row = {
  id: string;
  href: string;
  name: string;
  sub: string;
  garments: number;
  delivery: string | null;
  steps: { label: string; state: "ok" | "now" | "todo" }[];
  action: string;
};

function daysFrom(today: Date, iso: string) {
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

export default async function ProduccionPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const tab = ver === "sublimacion" ? "sublimacion" : "producir";
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, team_or_group_name, contact_name, estimated_delivery_date, order_items(quantity)")
    .in("status", [...TO_PRODUCE, ...SUBLIM])
    .order("estimated_delivery_date", { ascending: true, nullsFirst: false });
  const ids = (orders ?? []).map((o) => o.id);
  const none = { data: [] as never[] };
  const [{ data: designs }, { data: mockups }, { data: layouts }, { data: layoutItems }, { data: jobs }] = await Promise.all([
    ids.length ? supabase.from("order_designs").select("order_id").in("order_id", ids) : none,
    ids.length ? supabase.from("order_resources").select("order_id").eq("resource_type", "mockup").in("order_id", ids) : none,
    supabase.from("production_layouts").select("order_id, job_id, linear_meters, created_at").order("created_at", { ascending: false }),
    ids.length ? supabase.from("production_layout_items").select("order_id").in("order_id", ids) : none,
    supabase.from("production_jobs").select("id, client_name, items, design, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const hasDesign = new Set((designs ?? []).map((d) => d.order_id));
  const hasMockup = new Set((mockups ?? []).map((d) => d.order_id));
  const hasRoll = new Set([...(layouts ?? []).map((l) => l.order_id), ...(layoutItems ?? []).map((l) => l.order_id)].filter(Boolean));
  const jobRolls = new Set((layouts ?? []).map((l) => l.job_id).filter(Boolean));

  const rows: Row[] = [];
  for (const o of orders ?? []) {
    const inSublim = SUBLIM.includes(o.status);
    if ((tab === "sublimacion") !== inSublim) continue;
    const d = hasDesign.has(o.id), m = hasMockup.has(o.id), r = hasRoll.has(o.id) || inSublim;
    const states: Row["steps"] = [
      { label: "Diseño", state: d ? "ok" : "now" },
      { label: "Mockup", state: m ? "ok" : d ? "now" : "todo" },
      { label: "Rollo", state: r ? "ok" : d ? (m ? "now" : "todo") : "todo" },
      { label: "Sublimación", state: inSublim ? "now" : "todo" },
    ];
    // Sin mockup no frena: si ya hay diseño, el rollo también está disponible.
    if (d && !m && !r) states[2].state = "now";
    rows.push({
      id: o.id,
      href: `/panel/produccion/${o.id}`,
      name: o.team_or_group_name || o.contact_name || o.order_number,
      sub: o.order_number,
      garments: (o.order_items as { quantity: number }[] | null)?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 0,
      delivery: o.estimated_delivery_date,
      steps: states,
      action: inSublim ? "Ver rollo" : !d ? "Empezar diseño" : !r ? (m ? "Armar rollo" : "Mockup o rollo") : "Ver rollo",
    });
  }
  if (tab === "producir") {
    for (const j of jobs ?? []) {
      if (jobRolls.has(j.id)) continue;
      const items = (Array.isArray(j.items) ? j.items : []) as { qty?: number }[];
      const d = !!j.design && Object.keys(j.design as object).length > 0;
      rows.push({
        id: j.id,
        href: `/panel/produccion/trabajos/${j.id}`,
        name: j.client_name,
        sub: "Trabajo libre",
        garments: items.reduce((s, i) => s + (Number(i.qty) || 0), 0),
        delivery: null,
        steps: [
          { label: "Diseño", state: d ? "ok" : "now" },
          { label: "Rollo", state: d ? "now" : "todo" },
        ],
        action: d ? "Armar rollo" : "Empezar diseño",
      });
    }
  }
  const today = new Date(new Date().toDateString());
  const countProduce = (orders ?? []).filter((o) => TO_PRODUCE.includes(o.status)).length + (jobs ?? []).filter((j) => !jobRolls.has(j.id)).length;
  const countSublim = (orders ?? []).filter((o) => SUBLIM.includes(o.status)).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Producción" description="Cada pedido muestra en qué paso está y qué sigue. Un clic y seguís donde quedaste." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="block transition-transform hover:-translate-y-0.5">
              <Card className="flex h-full flex-col gap-2 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8EEF8] text-[#102C5B]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-zinc-900">{t.title}</span>
                <span className="text-xs leading-snug text-zinc-500">{t.text}</span>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div role="tablist" aria-label="Qué mostrar" className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            {(
              [
                ["producir", `Para producir · ${countProduce}`, "/panel/produccion"],
                ["sublimacion", `En sublimación · ${countSublim}`, "/panel/produccion?ver=sublimacion"],
              ] as const
            ).map(([k, label, href]) => (
              <Link
                key={k}
                role="tab"
                aria-selected={tab === k}
                href={href}
                className={cn("rounded-md px-3.5 py-1.5 text-sm font-semibold", tab === k ? "bg-white text-[#102C5B] shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
              >
                {label}
              </Link>
            ))}
          </div>
          <span className="ml-auto text-xs text-zinc-500">Ordenado por fecha de entrega</span>
        </div>
        {rows.length === 0 ? (
          <div className="border-t border-zinc-100 p-5">
            <EmptyState message={tab === "producir" ? "No hay pedidos para producir." : "No hay pedidos en sublimación."} />
          </div>
        ) : (
          <ul>
            {rows.map((r, idx) => {
              const d = r.delivery ? daysFrom(today, r.delivery) : null;
              const late = d !== null && d < 0;
              const urgent = d !== null && d >= 0 && d <= 10 && r.steps[0].state !== "ok";
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-4 border-t border-zinc-100 px-5 py-4">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={r.href} className="text-base font-semibold text-zinc-900 hover:underline">
                        {r.name}
                      </Link>
                      {late && <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Atrasado</span>}
                      {urgent && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">Urgente</span>}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {r.sub} · {r.garments} {r.garments === 1 ? "prenda" : "prendas"}
                    </div>
                  </div>
                  <div className="flex flex-[2] flex-wrap items-center gap-1.5">
                    {r.steps.map((s, k) => (
                      <span key={s.label} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                            s.state === "ok" && "bg-green-50 text-green-700",
                            s.state === "now" && "bg-[#102C5B] text-white",
                            s.state === "todo" && "bg-zinc-100 text-zinc-500"
                          )}
                        >
                          {s.state === "ok" && <Check className="h-3 w-3" />}
                          {s.label}
                        </span>
                        {k < r.steps.length - 1 && <span className="text-zinc-300">›</span>}
                      </span>
                    ))}
                  </div>
                  <div className={cn("w-32 text-xs", late ? "font-semibold text-red-600" : "text-zinc-500")}>
                    {r.delivery
                      ? `${new Date(`${r.delivery}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} · ${late ? `hace ${-d!} d` : d === 0 ? "hoy" : `en ${d} d`}`
                      : "sin fecha"}
                  </div>
                  <Link
                    href={r.href}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold",
                      idx === 0 ? "bg-[#102C5B] text-white hover:bg-[#0A1E40]" : "border border-zinc-200 text-zinc-800 hover:bg-zinc-50"
                    )}
                  >
                    {r.action} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
