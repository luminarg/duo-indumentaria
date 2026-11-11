-- Páginas de contenido del sitio público (Nosotros, Preguntas frecuentes,
-- Cómo hacer tu pedido, etc.), creadas y editadas desde el panel sin
-- tocar código. El contenido se guarda en Markdown (texto con formato).
create table if not exists site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content text not null default '',
  published boolean not null default false,
  show_in_menu boolean not null default true,
  sort_order int not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_pages enable row level security;

drop policy if exists "team full access" on site_pages;
create policy "team full access" on site_pages for all using (is_team_member());

-- El público solo ve las páginas publicadas.
drop policy if exists "public read published site_pages" on site_pages;
create policy "public read published site_pages" on site_pages for select using (published = true);
