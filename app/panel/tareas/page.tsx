import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { TareasBoard } from "./TareasBoard";
import { NotificationsToggle } from "../NotificationsToggle";
import { hasAnyPushSubscription } from "../push-actions";

export default async function TareasPage() {
  const supabase = await createClient();

  const [{ data: tasksRaw }, { data: orders }, { data: teamMembers }, alreadySubscribed] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_date, orders(order_number), profiles(full_name)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("orders").select("id, order_number").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
    hasAnyPushSubscription(),
  ]);

  const tasks = (tasksRaw ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    orderNumber: (t.orders as unknown as { order_number: string } | null)?.order_number ?? null,
    assignedName: (t.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Tareas"
        description="Kanban con prioridad y vencimiento, vinculadas a pedidos."
        action={<NotificationsToggle initiallySubscribed={alreadySubscribed} />}
      />
      <TareasBoard tasks={tasks} orders={orders ?? []} teamMembers={teamMembers ?? []} />
    </div>
  );
}
