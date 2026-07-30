import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente "admin" con la service role key — se salta RLS por completo.
// SOLO se usa en el servidor (Server Actions / Route Handlers), NUNCA en
// el navegador. Sirve para las páginas públicas de pedido: el cliente entra
// con un link y token, y acá se busca el pedido por ese token a mano,
// validando explícitamente en el código en vez de depender de RLS abierta.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
