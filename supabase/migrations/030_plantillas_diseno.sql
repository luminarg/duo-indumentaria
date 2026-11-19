-- Plantillas de fondo subidas (dibujadas en Corel). Las del sistema están en
-- el código (lib/produccion/templates.ts). Las formas se guardan normalizadas
-- 0–1; los colores marcadores se cambian por los colores de cada diseño.
create table if not exists design_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Mis plantillas',
  aspect numeric(10,4) not null default 1,   -- alto / ancho
  slots int not null default 1,              -- cantidad de colores que se pueden cambiar
  shapes jsonb not null,                     -- [{ pts: [[x,y],...], slot? | color? }]
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table design_templates enable row level security;
drop policy if exists "team full access" on design_templates;
create policy "team full access" on design_templates for all using (is_team_member());
