-- Agrega título y subtítulo del hero como campos editables desde el panel.
alter table business_settings
  add column if not exists hero_title text default 'Vive tu Juego.',
  add column if not exists hero_subtitle text default 'Indumentaria deportiva personalizada para clubes, colegios y gimnasios.';
