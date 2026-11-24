-- Diseño por grupo de talles: en un mismo artículo, niños y adultos pueden
-- llevar cada uno su PDF base (por ejemplo, el 10 para niños y el M para
-- adultos), así el escalado queda más parejo. null = todos los talles juntos
-- (como hasta ahora).
alter table order_designs add column if not exists size_group text;
alter table order_designs drop constraint if exists order_designs_size_group_check;
alter table order_designs add constraint order_designs_size_group_check check (size_group is null or size_group in ('nino', 'adulto'));

drop index if exists uq_order_designs_version;
create unique index if not exists uq_order_designs_version
  on order_designs (order_id, coalesce(requirement_id, '00000000-0000-0000-0000-000000000000'::uuid),
                    coalesce(component_id, '00000000-0000-0000-0000-000000000000'::uuid), variant,
                    coalesce(size_group, ''), version);

-- Los rollos también dicen de qué grupo de talles son (para saber qué falta).
alter table production_layouts add column if not exists size_group text;
alter table production_layout_items add column if not exists size_group text;
