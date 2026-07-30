-- Texto por defecto del pie del presupuesto (se muestra en el PDF y se
-- puede editar desde Configuración).
update business_settings
set quote_footer_text = 'El presupuesto no incluye IVA. Necesitamos una seña del 50% para confirmar el pedido.'
where id = 1 and quote_footer_text is null;
