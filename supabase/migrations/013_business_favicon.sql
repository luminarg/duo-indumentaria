-- Favicon configurable desde el panel (Configuración > Datos del negocio).
alter table business_settings add column if not exists favicon_url text;
