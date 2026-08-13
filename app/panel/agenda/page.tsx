import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { AgendaManager } from "./AgendaManager";

export default async function AgendaPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: upcomingRaw }, { data: pastRaw }, { data: clients }, { data: contacts }] = await Promise.all([
    supabase
      .from("agenda_events")
      .select("id, title, event_type, event_at, notes, clients(name)")
      .gte("event_at", nowIso)
      .order("event_at", { ascending: true }),
    supabase
      .from("agenda_events")
      .select("id, title, event_type, event_at, notes, clients(name)")
      .lt("event_at", nowIso)
      .order("event_at", { ascending: false })
      .limit(20),
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase.from("frequent_contacts").select("*").order("name", { ascending: true }),
  ]);

  const mapEvent = (e: NonNullable<typeof upcomingRaw>[number]) => ({
    id: e.id,
    title: e.title,
    event_type: e.event_type,
    event_at: e.event_at,
    notes: e.notes,
    clientName: (e.clients as unknown as { name: string } | null)?.name ?? null,
  });

  return (
    <div>
      <PageHeader title="Agenda" description="Llamadas, reuniones, entregas y contactos frecuentes." />
      <AgendaManager
        upcoming={(upcomingRaw ?? []).map(mapEvent)}
        past={(pastRaw ?? []).map(mapEvent)}
        clients={clients ?? []}
        contacts={contacts ?? []}
      />
    </div>
  );
}
