-- Short: dos tipos de pieza nuevos (cada pierna es una sola pieza, delantero
-- y trasero juntos). El resto del módulo de producción no cambia.
alter table pattern_pieces drop constraint if exists pattern_pieces_kind_check;
alter table pattern_pieces
  add constraint pattern_pieces_kind_check
  check (kind in ('frente', 'espalda', 'manga_izq', 'manga_der', 'pierna_izq', 'pierna_der', 'otra'));
