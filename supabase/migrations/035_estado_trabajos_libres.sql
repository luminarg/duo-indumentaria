-- Trabajos libres con estado propio (se puede cambiar a mano, por si se
-- avanzó por fuera del sistema). null = automático: diseño → rollo.
alter table production_jobs add column if not exists status text;
alter table production_jobs drop constraint if exists production_jobs_status_check;
alter table production_jobs add constraint production_jobs_status_check
  check (status is null or status in ('diseno', 'rollo', 'sublimacion', 'costura', 'entregado'));
