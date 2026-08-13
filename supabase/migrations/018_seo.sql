-- Campos de SEO editables desde Configuración: título y descripción para
-- buscadores, palabras clave, e imagen para cuando se comparte el link en
-- redes (WhatsApp, Facebook, etc.).

alter table business_settings add column if not exists seo_title text;
alter table business_settings add column if not exists seo_description text;
alter table business_settings add column if not exists seo_keywords text;
alter table business_settings add column if not exists seo_og_image_url text;
