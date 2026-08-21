-- El precio del artículo (definido en el presupuesto) tiene que viajar al
-- pedido para poder mostrar precios/subtotales/total en el panel y en el
-- link público del cliente — antes el pedido solo tenía talles/cantidades,
-- sin ningún dato de precio.
alter table order_article_requirements add column if not exists unit_price numeric(12,2) not null default 0;
