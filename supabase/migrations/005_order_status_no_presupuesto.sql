-- El presupuesto ahora se arma ANTES de crear el pedido (ver migración
-- 006, tabla `quotes`), no como un estado intermedio del pedido. Se quita
-- 'en_presupuesto' del enum de estados del pedido.
begin;

alter type order_status rename to order_status_old;

create type order_status as enum (
  'borrador',
  'cargado_por_cliente',
  'senado',
  'en_produccion',
  'entregado'
);

alter table orders alter column status drop default;

alter table orders
  alter column status type order_status
  using (
    case status::text
      when 'en_presupuesto' then 'borrador'
      else status::text
    end
  )::order_status;

alter table orders alter column status set default 'borrador'::order_status;

drop type order_status_old;

commit;
