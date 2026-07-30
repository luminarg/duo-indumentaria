-- Fecha aproximada de entrega, la carga el dueño desde el detalle del
-- pedido. Se usa para calcular si un pedido está "demorado" o "en tiempo"
-- y para las métricas del dashboard.
alter table orders add column if not exists estimated_delivery_date date;
