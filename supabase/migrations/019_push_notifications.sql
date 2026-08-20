-- Suscripciones a notificaciones push (Web Push) — una fila por dispositivo
-- que el usuario activó. Un mismo usuario puede tener varias (celular,
-- computadora, etc.), por eso no es una columna en profiles.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- Cada usuario administra sus propias suscripciones (activar/desactivar en
-- su propio dispositivo). El envío diario lo hace el cron job con el
-- cliente admin (service role), que no pasa por RLS.
drop policy if exists "own subscriptions" on push_subscriptions;
create policy "own subscriptions" on push_subscriptions for all using (user_id = auth.uid());
