"use server";

import { createClient } from "@/lib/supabase/server";

// Marca que el usuario actual ya vio la pantalla de "Qué hay de nuevo" —
// se llama al cerrarla. No hace revalidatePath porque el layout la vuelve a
// leer en cada request de todas formas (server component).
export async function markWhatsNewSeen() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ whats_new_seen_at: new Date().toISOString() }).eq("id", user.id);
}

export type SearchHit = { kind: "pedido" | "cliente" | "presupuesto" | "trabajo"; title: string; subtitle?: string; href: string };

/** Búsqueda del panel: pedidos, clientes, presupuestos y trabajos libres. */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const q = query.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const [orders, clients, quotes, jobs] = await Promise.all([
    supabase.from("orders").select("id, order_number, team_or_group_name, contact_name, status").or(`order_number.ilike.${like},team_or_group_name.ilike.${like},contact_name.ilike.${like}`).limit(6),
    supabase.from("clients").select("id, name, contact_name").or(`name.ilike.${like},contact_name.ilike.${like}`).limit(4),
    supabase.from("quotes").select("id, quote_number, clients(name)").ilike("quote_number", like).limit(4),
    supabase.from("production_jobs").select("id, client_name").ilike("client_name", like).limit(3),
  ]);
  const out: SearchHit[] = [];
  for (const o of orders.data ?? [])
    out.push({ kind: "pedido", title: o.order_number, subtitle: o.team_or_group_name || o.contact_name || undefined, href: `/panel/pedidos/${o.id}` });
  for (const c of clients.data ?? []) out.push({ kind: "cliente", title: c.name, subtitle: c.contact_name || undefined, href: `/panel/clientes/${c.id}` });
  for (const qt of quotes.data ?? []) {
    const cl = (qt as { clients?: { name?: string } | { name?: string }[] | null }).clients;
    const name = Array.isArray(cl) ? cl[0]?.name : cl?.name;
    out.push({ kind: "presupuesto", title: qt.quote_number, subtitle: name, href: `/panel/presupuestos/${qt.id}` });
  }
  for (const j of jobs.data ?? []) out.push({ kind: "trabajo", title: j.client_name, subtitle: "Trabajo libre", href: `/panel/produccion/trabajos/${j.id}` });
  return out.slice(0, 12);
}
