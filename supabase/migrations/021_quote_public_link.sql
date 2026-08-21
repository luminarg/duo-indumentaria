-- Link público para que el cliente ajuste cantidades del presupuesto (y
-- vea el total recalcularse) antes de que generes el pedido. Mismo patrón
-- que orders.public_token.
alter table quotes add column if not exists public_token text not null unique default encode(gen_random_bytes(16), 'hex');
create index if not exists idx_quotes_public_token on quotes(public_token);

-- Cuándo el cliente confirmó sus cantidades desde el link público — distinto
-- de approved_at, que se setea cuando VOS generás el pedido desde el panel.
alter table quotes add column if not exists client_confirmed_at timestamptz;
