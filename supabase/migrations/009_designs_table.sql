-- Galería simple de diseños/trabajos realizados (portfolio), para el
-- carrusel "Algunos de nuestros diseños" de la home. Sin precios ni talles
-- todavía — eso queda para cuando se arme el catálogo completo (las tablas
-- `products`/`product_images`/`sizes` ya están listas para ese momento).
create table designs (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table designs enable row level security;

create policy "team full access" on designs for all using (is_team_member());
create policy "public read designs" on designs for select using (active = true);
