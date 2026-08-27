-- Bug: next_sequence_number calculaba el próximo número contando filas
-- existentes ("count(*) + 1"). Si se borra un presupuesto/pedido en el
-- medio, el conteo baja y el siguiente insert recalcula un número que ya
-- existe → choca con la restricción unique (quotes_quote_number_key /
-- orders_order_number_key). Fix: usar el número más alto ya usado ese año
-- (no la cantidad de filas), así nunca se repite aunque se borren filas
-- intermedias.
create or replace function next_sequence_number(prefix text, year int)
returns text as $$
declare
  max_seq int;
begin
  if prefix = 'PED' then
    select coalesce(max(substring(order_number from '(\d+)$')::int), 0) + 1 into max_seq
    from orders
    where order_number like prefix || '-' || year || '-%';
  else
    select coalesce(max(substring(quote_number from '(\d+)$')::int), 0) + 1 into max_seq
    from quotes
    where quote_number like prefix || '-' || year || '-%';
  end if;

  return prefix || '-' || year || '-' || lpad(max_seq::text, 3, '0');
end;
$$ language plpgsql;
