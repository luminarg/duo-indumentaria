import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Recordatorio diario (lunes a viernes, 10am hora Argentina — ver
// vercel.json) con la cantidad de tareas pendientes y vencidas. Lo dispara
// el Cron de Vercel, que llega con Authorization: Bearer <CRON_SECRET> — acá
// se valida ese secreto para que nadie más pueda pegarle a este endpoint y
// hacer spam de notificaciones.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return NextResponse.json({ error: "Faltan las claves VAPID configuradas" }, { status: 500 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contacto@duoindumentaria.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const admin = createAdminClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [{ data: pendingTasks }, { data: subscriptions }, { data: settings }] = await Promise.all([
    admin.from("tasks").select("id, due_date").neq("status", "hecha"),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth"),
    admin.from("business_settings").select("favicon_url, logo_url").eq("id", 1).single(),
  ]);

  const pendingCount = pendingTasks?.length ?? 0;
  const overdueCount = (pendingTasks ?? []).filter((t) => t.due_date && t.due_date < todayStr).length;

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, pendingCount, overdueCount, note: "Sin suscripciones activas" });
  }

  const title = "Tareas de hoy";
  const body =
    pendingCount === 0
      ? "No tenés tareas pendientes — al día."
      : overdueCount > 0
        ? `Tenés ${pendingCount} tareas pendientes, ${overdueCount} vencida${overdueCount === 1 ? "" : "s"}.`
        : `Tenés ${pendingCount} tarea${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"} hoy.`;

  const icon = settings?.favicon_url || settings?.logo_url || undefined;
  const payload = JSON.stringify({ title, body, url: "/panel/tareas", icon });

  let sent = 0;
  const staleEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return NextResponse.json({
    sent,
    removedStale: staleEndpoints.length,
    pendingCount,
    overdueCount,
  });
}
