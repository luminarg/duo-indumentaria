-- BUGFIX: is_team_member() consultaba `profiles`, y `profiles` tiene una
-- política de RLS que a su vez llama a is_team_member() -> recursión
-- infinita ("stack depth limit exceeded"). Pasaba en cualquier tabla con
-- lectura pública + política de equipo combinadas (ej. site_sliders) en
-- cuanto tenía filas reales cargadas.
--
-- Fix estándar de Supabase para este caso: marcar la función SECURITY
-- DEFINER, para que su consulta interna a `profiles` no vuelva a pasar por
-- las políticas de RLS de esa tabla.
create or replace function is_team_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;
