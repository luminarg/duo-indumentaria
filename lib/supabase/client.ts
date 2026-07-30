"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para usar en Client Components (el navegador).
// Usa la clave pública (anon key) — respeta las políticas RLS.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
