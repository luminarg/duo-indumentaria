-- Tipos de artículo reutilizables (remera, pantalón, buzo...) — cada uno
-- define si por defecto lleva número/nombre y tiene su propia guía de
-- talles (con medidas). Se configuran desde Configuración → Talles.
create table if not exists article_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  requires_number boolean not null default false,
  requires_name boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Guía de talles de cada tipo de artículo: talle + medidas en texto libre
-- (ej. "Pecho 52cm, Largo 70cm") para que el cliente elija bien.
create table if not exists article_type_sizes (
  id uuid primary key default gen_random_uuid(),
  article_type_id uuid not null references article_types(id) on delete cascade,
  label text not null,
  measurements text,
  sort_order int not null default 0
);

create index if not exists idx_article_type_sizes_type on article_type_sizes(article_type_id);

-- Cada artículo de un presupuesto puede asociarse a un tipo (para heredar
-- su guía de talles) y tiene su propio "lleva número"/"lleva nombre" —
-- precargado desde el tipo elegido, pero editable por artículo.
alter table quote_items add column if not exists article_type_id uuid references article_types(id) on delete set null;
alter table quote_items add column if not exists requires_number boolean not null default false;
alter table quote_items add column if not exists requires_name boolean not null default false;

-- Al generar el pedido desde un presupuesto, se congela acá qué debe
-- completar el cliente por cada artículo (una fila por artículo del
-- presupuesto) — el admin confirma/ajusta estos checkboxes justo antes de
-- generar el link del pedido.
create table if not exists order_article_requirements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  description text not null,
  article_type_id uuid references article_types(id) on delete set null,
  requires_number boolean not null default false,
  requires_name boolean not null default false,
  quantity_quoted int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_article_requirements_order on order_article_requirements(order_id);

-- Cada prenda que carga el cliente queda vinculada al artículo del pedido
-- al que pertenece (para agruparlas en el panel y en el propio formulario).
alter table order_items add column if not exists requirement_id uuid references order_article_requirements(id) on delete set null;

alter table article_types enable row level security;
alter table article_type_sizes enable row level security;
alter table order_article_requirements enable row level security;

drop policy if exists "team full access" on article_types;
create policy "team full access" on article_types for all using (is_team_member());

drop policy if exists "team full access" on article_type_sizes;
create policy "team full access" on article_type_sizes for all using (is_team_member());

drop policy if exists "team full access" on order_article_requirements;
create policy "team full access" on order_article_requirements for all using (is_team_member());

-- Se leen desde el presupuesto público en PDF y desde el formulario público
-- de pedido (que igual usa la service role, pero se deja consistente con
-- el resto de las tablas de catálogo público como `sizes`/`product_sizes`).
drop policy if exists "public read article_types" on article_types;
create policy "public read article_types" on article_types for select using (true);

drop policy if exists "public read article_type_sizes" on article_type_sizes;
create policy "public read article_type_sizes" on article_type_sizes for select using (true);
