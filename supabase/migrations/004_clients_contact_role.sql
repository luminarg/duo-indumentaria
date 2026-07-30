-- El cliente suele ser una institución (ej. "Club Ameghino"), con una
-- persona de referencia que tiene un cargo (Presidente, Coordinador,
-- Profesor, etc.). Antes solo guardábamos el nombre de esa persona.
alter table clients
  add column if not exists contact_role text;
