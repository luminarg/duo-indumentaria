-- El color/diseño general del pedido lo define el dueño (no el cliente),
-- junto con la tela y la moldería. Se guarda a nivel de pedido, no por ítem.
alter table order_technical_details
  add column if not exists color_scheme text;
