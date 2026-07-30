-- Reemplaza el estado único "en_produccion" por el flujo real de taller.
begin;

alter type order_status rename to order_status_old;

create type order_status as enum (
  'borrador',
  'cargado_por_cliente',
  'senado',
  'cortando',
  'estampando',
  'armando',
  'embalando',
  'entregado'
);

alter table orders alter column status drop default;

alter table orders
  alter column status type order_status
  using (
    case status::text
      when 'en_produccion' then 'cortando'
      else status::text
    end
  )::order_status;

alter table orders alter column status set default 'borrador'::order_status;

drop type order_status_old;

commit;
