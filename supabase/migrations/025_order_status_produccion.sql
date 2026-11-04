-- Nuevos estados de producción:
--   Cerrado → Cortando → Diseño en moldería → Sublimación/estampado →
--   Costura y terminaciones → Entregado
-- Se mantienen "borrador" y "cargado_por_cliente" (etapas en las que el
-- cliente todavía edita su link). Los pedidos existentes con estados viejos
-- se pasan al equivalente más cercano.
begin;

alter type order_status rename to order_status_old;

create type order_status as enum (
  'borrador',
  'cargado_por_cliente',
  'cerrado',
  'cortando',
  'diseno_molderia',
  'sublimacion_estampado',
  'costura_terminaciones',
  'entregado'
);

alter table orders alter column status drop default;

alter table orders
  alter column status type order_status
  using (
    case status::text
      when 'senado' then 'cerrado'
      when 'estampando' then 'sublimacion_estampado'
      when 'armando' then 'costura_terminaciones'
      when 'embalando' then 'costura_terminaciones'
      else status::text
    end
  )::order_status;

alter table orders alter column status set default 'borrador'::order_status;

drop type order_status_old;

commit;
