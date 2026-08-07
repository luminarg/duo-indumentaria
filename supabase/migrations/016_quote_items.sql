-- Ítems del presupuesto: ahora se arma con artículos (descripción, precio
-- unitario, cantidad) en vez de un monto total cargado a mano. El total y
-- la seña del presupuesto se recalculan solos a partir de estos ítems.
create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  description text not null,
  unit_price numeric(12,2) not null default 0,
  quantity int not null default 1,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_items_quote on quote_items(quote_id);

alter table quote_items enable row level security;
drop policy if exists "team full access" on quote_items;
create policy "team full access" on quote_items for all using (is_team_member());
