-- Rollos con varios pedidos: qué prendas (pedido × artículo × prenda ×
-- variante) entran en cada rollo. Un pedido pasa a sublimación cuando todas
-- sus prendas tienen rollo (propio o compartido).
create table if not exists production_layout_items (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references production_layouts(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  requirement_id uuid references order_article_requirements(id) on delete set null,
  component_id uuid references article_type_components(id) on delete set null,
  variant text not null default 'jugador',
  created_at timestamptz not null default now()
);
create index if not exists idx_layout_items_order on production_layout_items(order_id);
create index if not exists idx_layout_items_layout on production_layout_items(layout_id);

alter table production_layout_items enable row level security;
drop policy if exists "team full access" on production_layout_items;
create policy "team full access" on production_layout_items for all using (is_team_member());
