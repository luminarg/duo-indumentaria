-- Se invierte el flujo: el presupuesto es el punto de partida (se carga a
-- mano lo que pidió el cliente) y desde ahí se genera el pedido — no al
-- revés como estaba antes. El presupuesto se asocia directo al cliente; el
-- pedido queda opcional (se completa recién cuando se genera el link).
alter table quotes
  alter column order_id drop not null,
  add column if not exists client_id uuid references clients(id),
  add column if not exists items_description text,
  add column if not exists fabric text,
  add column if not exists color_scheme text,
  add column if not exists pattern_notes text;
