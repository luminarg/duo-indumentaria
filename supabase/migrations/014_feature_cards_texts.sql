-- Textos editables de las 3 tarjetas con ícono de la home pública
-- (sección debajo del hero: "Personalizá tu equipo" / "Te asesoramos" /
-- "Todas las disciplinas"). El ícono de cada una queda fijo, solo el
-- título y la descripción son configurables desde el panel.
alter table business_settings add column if not exists feature1_title text;
alter table business_settings add column if not exists feature1_text text;
alter table business_settings add column if not exists feature2_title text;
alter table business_settings add column if not exists feature2_text text;
alter table business_settings add column if not exists feature3_title text;
alter table business_settings add column if not exists feature3_text text;
