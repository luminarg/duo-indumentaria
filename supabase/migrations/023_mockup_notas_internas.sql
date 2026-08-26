-- Mockup opcional (PNG) para embeber en el PDF del presupuesto.
alter table quotes add column if not exists mockup_url text;

-- Observaciones internas: solo el equipo las ve (nunca se exponen en el PDF
-- ni en ningún link público). Son de solo alta — no se editan ni se borran,
-- para mantener la trazabilidad completa del pedido/presupuesto.
create table if not exists internal_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  quote_id uuid references quotes(id) on delete cascade,
  author_id uuid references profiles(id),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint internal_notes_target_check check (
    (order_id is not null and quote_id is null) or (order_id is null and quote_id is not null)
  )
);
create index if not exists idx_internal_notes_order on internal_notes(order_id);
create index if not exists idx_internal_notes_quote on internal_notes(quote_id);

alter table internal_notes enable row level security;
drop policy if exists "team full access" on internal_notes;
create policy "team full access" on internal_notes for all using (is_team_member());
