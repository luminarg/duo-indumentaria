-- Batch de novedades: color propio por presupuesto, contactos frecuentes en
-- Agenda, y marca de "vio la pantalla de novedades" por usuario.

alter table quotes add column if not exists accent_color text;

create table if not exists frequent_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'otro', -- comisionista | proveedor_tela | proveedor_insumos | otro
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

alter table frequent_contacts enable row level security;
drop policy if exists "team full access" on frequent_contacts;
create policy "team full access" on frequent_contacts for all using (is_team_member());

alter table profiles add column if not exists whats_new_seen_at timestamptz;
