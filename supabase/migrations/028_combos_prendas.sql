-- Combos: un artículo que se compone de varias prendas, cada una con su
-- moldería y su diseño (ej. "Combo camiseta + short", "Promo buzo + pantalón").
-- Si un artículo no tiene prendas cargadas, se trabaja como una sola prenda.
create table if not exists article_type_components (
  id uuid primary key default gen_random_uuid(),
  article_type_id uuid not null references article_types(id) on delete cascade,
  name text not null,                                   -- ej. "Camiseta", "Short"
  model_id uuid references pattern_models(id) on delete set null,
  -- Qué datos del jugador lleva esta prenda (el short: número sí, nombre no).
  copy_number boolean not null default true,
  copy_name boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_article_type_components_type on article_type_components(article_type_id);

alter table article_type_components enable row level security;
drop policy if exists "team full access" on article_type_components;
create policy "team full access" on article_type_components for all using (is_team_member());

-- Cada diseño corresponde a una prenda del artículo (null = artículo de una sola prenda).
alter table order_designs add column if not exists component_id uuid references article_type_components(id) on delete set null;
alter table order_designs drop constraint if exists order_designs_order_id_requirement_id_variant_version_key;
create unique index if not exists uq_order_designs_version
  on order_designs (order_id, coalesce(requirement_id, '00000000-0000-0000-0000-000000000000'::uuid),
                    coalesce(component_id, '00000000-0000-0000-0000-000000000000'::uuid), variant, version);

-- De qué artículo, prenda y variante es cada rollo: el pedido pasa a
-- sublimación recién cuando todas sus prendas tienen rollo.
alter table production_layouts add column if not exists requirement_id uuid references order_article_requirements(id) on delete set null;
alter table production_layouts add column if not exists component_id uuid references article_type_components(id) on delete set null;
alter table production_layouts add column if not exists variant text;
