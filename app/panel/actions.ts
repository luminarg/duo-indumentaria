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
