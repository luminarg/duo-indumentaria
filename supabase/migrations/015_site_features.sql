-- Las tarjetas con ícono de la home pasan de ser 3 campos fijos
-- (feature1_title/text, feature2_..., feature3_...) a una lista dinámica:
-- se pueden agregar, sacar, reordenar y elegir ícono para cada una desde
-- Configuración, igual que ya funciona con los sliders y los diseños.

create table site_features (
  id uuid primary key default gen_random_uuid(),
  icon text not null default 'shirt',
  title text not null,
  description text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table site_features enable row level security;
create policy "team full access" on site_features for all using (is_team_member());
create policy "public read site_features" on site_features for select using (active = true);

-- Migra lo que ya estaba cargado en business_settings (si llegaste a correr
-- la migración 014 y guardaste texto ahí) o usa los textos originales del
-- sitio si no. to_jsonb(...) evita el error si esas columnas no existen.
insert into site_features (icon, title, description, sort_order)
select
  'shirt',
  coalesce(nullif(to_jsonb(bs) ->> 'feature1_title', ''), 'Personalizá tu equipo'),
  coalesce(nullif(to_jsonb(bs) ->> 'feature1_text', ''), 'Materializá tu identidad por completo: camiseta, short y medias con tu diseño.'),
  0
from business_settings bs where bs.id = 1
union all
select
  'lightbulb',
  coalesce(nullif(to_jsonb(bs) ->> 'feature2_title', ''), 'Te asesoramos'),
  coalesce(nullif(to_jsonb(bs) ->> 'feature2_text', ''), 'Te proponemos ideas, creamos el logo de tu equipo y la línea de diseño.'),
  1
from business_settings bs where bs.id = 1
union all
select
  'trophy',
  coalesce(nullif(to_jsonb(bs) ->> 'feature3_title', ''), 'Todas las disciplinas'),
  coalesce(nullif(to_jsonb(bs) ->> 'feature3_text', ''), 'Fabricamos indumentaria para todos los deportes.'),
  2
from business_settings bs where bs.id = 1;

alter table business_settings
  drop column if exists feature1_title,
  drop column if exists feature1_text,
  drop column if exists feature2_title,
  drop column if exists feature2_text,
  drop column if exists feature3_title,
  drop column if exists feature3_text;
