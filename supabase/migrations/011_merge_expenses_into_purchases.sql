-- Unifica "compras" y "gastos" en una sola tabla (purchases) para simplificar
-- la UI del panel: antes eran dos conceptos separados (purchases con
-- proveedor/presupuestado-vs-real, expenses con categoría), ahora todo vive
-- en purchases y la categoría queda disponible para los gastos generales que
-- no tienen proveedor asociado.

alter table purchases add column if not exists category text;

-- Migra las filas existentes de expenses a purchases antes de borrar la
-- tabla vieja, por si ya hay datos cargados.
insert into purchases (order_id, category, description, real_cost, purchase_date, created_at)
select order_id, category, description, amount, expense_date, created_at
from expenses;

drop table if exists expenses;
