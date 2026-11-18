-- Módulo de producción: diseño sobre moldería, escalado de talles y tizada.
--
-- Moldería
--   pattern_models   → un modelo de molde (ej. "Remera cuello redondo"),
--                      colgado de un tipo de artículo existente.
--   pattern_pieces   → cada pieza de ese modelo en cada talle (frente,
--                      espalda, mangas), en milímetros reales.
--   model_assembly   → dónde va cada tipo de pieza sobre el lienzo del
--                      patrón, para que rayas y tramas coincidan en las
--                      costuras (como el PowerClip de Corel).
-- Producción
--   order_designs      → el diseño de un pedido (con versiones): archivos
--                        de fondo y elementos, y las reglas de posición.
--   production_layouts → cada tizada generada: PDF, metros lineales.

-- Variante de prenda: hoy "jugador" o "arquero" (el arquero lleva otro
-- diseño). Texto libre con check para poder sumar variantes después.
alter table order_items add column if not exists variant text not null default 'jugador';
alter table order_items drop constraint if exists order_items_variant_check;
alter table order_items add constraint order_items_variant_check check (variant in ('jugador', 'arquero'));

create table if not exists pattern_models (
  id uuid primary key default gen_random_uuid(),
  article_type_id uuid references article_types(id) on delete set null,
  name text not null,                 -- ej. "Remera cuello redondo"
  neck text,                          -- redondo, v, raglan...
  base_size_label text not null default 'L', -- talle sobre el que se diseña
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tipo de pieza: frente, espalda, manga_izq, manga_der (se pueden sumar).
-- La geometría se guarda en mm, con el eje Y hacia abajo y la pieza vista
-- desde AFUERA (como se ve la prenda puesta, de frente).
create table if not exists pattern_pieces (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references pattern_models(id) on delete cascade,
  size_label text not null,           -- mismo texto que article_type_sizes.label
  kind text not null check (kind in ('frente', 'espalda', 'manga_izq', 'manga_der', 'otra')),
  name text,                          -- nombre libre si kind = 'otra'
  outline jsonb not null,             -- [[x,y], ...] en mm, polígono cerrado (incluye costura)
  width_mm numeric(8,2) not null,     -- ancho máximo (base de la grilla de 10 unidades)
  height_mm numeric(8,2) not null,
  shoulder_point jsonb,               -- [x,y] punto más alto del hombro (anclaje)
  baseline_y numeric(8,2),            -- Y de la línea de base (ruedo)
  source_file_path text,              -- PDF original en Storage
  created_at timestamptz not null default now(),
  unique (model_id, size_label, kind, name)
);
create index if not exists idx_pattern_pieces_model on pattern_pieces(model_id);

-- Armado sobre el lienzo del patrón (ver lib/produccion/assembly.ts):
--   baseline → centrada sobre la línea de base (el frente)
--   beside   → al lado de align_to_kind, misma línea de base (la espalda)
--   shoulder → por el punto del hombro de align_to_kind (las mangas)
-- offset_x/offset_y corren la pieza (mm del talle base, escalan con el talle).
create table if not exists model_assembly (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references pattern_models(id) on delete cascade,
  kind text not null,
  align_mode text not null check (align_mode in ('baseline', 'beside', 'shoulder')),
  align_to_kind text,                 -- para 'shoulder': ej. 'frente'
  offset_x numeric(8,2) not null default 0,
  offset_y numeric(8,2) not null default 0,
  unique (model_id, kind)
);

create table if not exists order_designs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  -- Artículo del pedido (ej. "Camiseta titular") al que corresponde el diseño.
  requirement_id uuid references order_article_requirements(id) on delete cascade,
  model_id uuid references pattern_models(id) on delete set null,
  variant text not null default 'jugador' check (variant in ('jugador', 'arquero')),
  version int not null default 1,
  -- Reglas y archivos del diseño (ver lib/produccion/types.ts → DesignConfig):
  -- fondo, elementos anclados, nombre, número, etiqueta de talle.
  config jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (order_id, requirement_id, variant, version)
);
create index if not exists idx_order_designs_order on order_designs(order_id);

create table if not exists production_layouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null, -- null si mezcla pedidos
  order_ids uuid[] not null default '{}',                  -- todos los pedidos del rollo
  roll_width_mm numeric(8,2) not null default 1550,
  length_mm numeric(10,2) not null,
  linear_meters numeric(8,3) generated always as (round(length_mm / 1000.0, 3)) stored,
  piece_count int not null,
  pdf_path text,                      -- en el bucket privado production-files
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_production_layouts_order on production_layouts(order_id);

alter table pattern_models enable row level security;
alter table pattern_pieces enable row level security;
alter table model_assembly enable row level security;
alter table order_designs enable row level security;
alter table production_layouts enable row level security;

drop policy if exists "team full access" on pattern_models;
create policy "team full access" on pattern_models for all using (is_team_member());
drop policy if exists "team full access" on pattern_pieces;
create policy "team full access" on pattern_pieces for all using (is_team_member());
drop policy if exists "team full access" on model_assembly;
create policy "team full access" on model_assembly for all using (is_team_member());
drop policy if exists "team full access" on order_designs;
create policy "team full access" on order_designs for all using (is_team_member());
drop policy if exists "team full access" on production_layouts;
create policy "team full access" on production_layouts for all using (is_team_member());

-- Bucket privado para moldes, archivos de diseño y PDFs de rollo. Igual que
-- order-resources: sin políticas públicas, se accede con la service role y
-- URLs firmadas.
insert into storage.buckets (id, name, public)
values ('production-files', 'production-files', false)
on conflict (id) do nothing;
