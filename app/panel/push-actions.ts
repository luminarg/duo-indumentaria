"use server";

import { createClient } from "@/lib/supabase/server";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

// Guarda (o actualiza) la suscripción push de este dispositivo para el
// usuario actual. Se llama después de que el navegador ya confirmó el
// permiso y armó la suscripción (PushManager.subscribe) — acá solo la
// persistimos para poder mandarle notificaciones después.
export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const user = await requireTeamMember();
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error("No se pudo activar la notificación: " + error.message);
}

// Se llama al desactivar las notificaciones desde este dispositivo (o si el
// navegador invalidó la suscripción vieja antes de crear una nueva).
export async function deletePushSubscription(endpoint: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error("No se pudo desactivar la notificación: " + error.message);
}

// Le dice al cliente si ESTE usuario ya tiene alguna suscripción activa (en
// cualquier dispositivo) — se usa para pintar el estado inicial del botón
// sin depender solo de lo que haya en el navegador actual.
export async function hasAnyPushSubscription() {
  const user = await requireTeamMember();
  const supabase = await createClient();
  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  return (count ?? 0) > 0;
}
