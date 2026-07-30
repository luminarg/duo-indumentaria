-- ============================================================================
-- DUO INDUMENTARIA — Schema de base de datos (Supabase / Postgres)
-- ============================================================================
-- Cómo usarlo: Supabase Dashboard > SQL Editor > pegar y correr entero.
-- Está pensado para correr una sola vez sobre un proyecto nuevo.
-- ============================================================================

-- Extensiones necesarias (uuid y funciones cripto para gen_random_uuid)
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. ENUMS (listas fijas de valores)
-- ============================================================================

create type client_type as enum ('club', 'colegio', 'gimnasio', 'particular');

create type order_status as enum (
  'borrador',              -- creado por el dueño/hermano (presupuesto ya acordado a mano)
  'cargado_por_cliente',   -- el cliente ya completó sus datos en el link
  'senado',                -- el cliente pagó la seña
  'cortando',              -- flujo de taller, en orden:
  'estampando',
  'armando',
  'embalando',
  'entregado'
);

create type task_priority as enum ('alta', 'media', 'baja');
create type task_status as enum ('pendiente', 'en_curso', 'hecha');

create type quote_status as enum ('borrador', 'enviado', 'aprobado', 'vencido', 'rechazado');

create type agenda_event_type as enum ('llamada', 'reunion', 'entrega', 'otro');

create type user_role as enum ('dueno', 'hermano', 'empleado');

-- ============================================================================
-- 2. USUARIOS Y ROLES (equipo interno — no clientes)
-- ============================================================================
-- Se apoya en supabase auth.users. Esta tabla extiende cada usuario con su rol.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'empleado',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 3. CONFIGURACIÓN DEL NEGOCIO (todo lo que se edita desde el panel)
-- ============================================================================

-- Fila única (singleton) con los datos generales del negocio.
create table business_settings (
  id int primary key default 1 check (id = 1), -- fuerza que exista una sola fila
  business_name text not null default 'Duo Indumentaria',
  logo_url text,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  address text,
  social_instagram text,
  social_facebook text,
  social_tiktok text,

  -- Apariencia del sitio público
  primary_color text default '#0a0a0a',
  secondary_color text default '#16a34a',
  font_family text default 'Inter',

  -- Catálogo
  show_prices boolean not null default true,

  -- Presupuestos
  default_deposit_percent numeric(5,2) not null default 50.00,
  quote_validity_days int not null default 7,
  quote_header_text text,
  quote_footer_text text default 'El presupuesto no incluye IVA. Necesitamos una seña del 50% para confirmar el pedido.',

  -- Mail automático al cliente
  email_subject_template text,
  email_body_template text,

  updated_at timestamptz not null default now()
);

insert into business_settings (id) values (1);

-- Sliders / banners de la home, orden configurable
create table site_sliders (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,
  subtitle text,
  link_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Galería simple de diseños/trabajos realizados (portfolio), para el
-- carrusel "Algunos de nuestros diseños" de la home. Sin precios ni talles
-- todavía — eso queda para cuando se arme el catálogo completo (las tablas
-- `products`/`product_images`/`sizes` más abajo ya están listas para eso).
create table designs (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Métodos de pago habilitados (efectivo, transferencia, mercado pago, etc.)
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  details text, -- ej. alias de transferencia, notas
  active boolean not null default true,
  sort_order int not null default 0
);

-- Proveedores
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 4. CATÁLOGO DE PRODUCTOS
-- ============================================================================

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text, -- remera, buzo, short, etc.
  base_price numeric(12,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0
);

-- Tabla de talles disponibles en general (S, M, L, XL, 2, 4, 6...)
create table sizes (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0
);

-- Qué talles aplican a cada producto (tabla de talles por producto)
create table product_sizes (
  product_id uuid not null references products(id) on delete cascade,
  size_id uuid not null references sizes(id) on delete cascade,
  extra_cost numeric(12,2) not null default 0, -- ej. talles especiales más caros
  primary key (product_id, size_id)
);

-- Tipos de estampado y su costo adicional (sublimado, vinilo, bordado, etc.)
create table print_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  extra_cost numeric(12,2) not null default 0,
  active boolean not null default true
);

-- ============================================================================
-- 5. CLIENTES
-- ============================================================================

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type client_type not null default 'particular',
  contact_name text,       -- persona de referencia (ej. "Juan Pérez")
  contact_role text,       -- cargo de esa persona (ej. "Presidente", "Coordinador")
  phone text,
  email text,
  origin text, -- de dónde vino (instagram, recomendado, etc.)
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 6. PEDIDOS (el corazón del sistema — carga sin login vía link único)
-- ============================================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique, -- ej. PED-2026-001, se genera con trigger (abajo)
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'), -- va en la URL del link

  client_id uuid references clients(id) on delete set null,
  status order_status not null default 'borrador',

  -- Datos generales que puede cargar el cliente
  team_or_group_name text, -- nombre del club/colegio/equipo si aplica
  contact_name text,       -- por si el pedido llega antes de crear el cliente formalmente
  contact_phone text,
  contact_email text,

  general_notes text,
  estimated_delivery_date date, -- fecha aproximada de entrega, la carga el dueño

  created_by uuid references profiles(id), -- quién generó el link (el hermano, el dueño)
  created_at timestamptz not null default now(),
  loaded_at timestamptz,     -- cuándo el cliente completó su parte
  quoted_at timestamptz,
  deposit_paid_at timestamptz,
  production_started_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_orders_public_token on orders(public_token);
create index idx_orders_status on orders(status);

-- Items del pedido: cantidad, talle, color, nombre individual si lleva
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name_snapshot text, -- por si el producto cambia/desaparece después
  size_id uuid references sizes(id), -- referencia al talle del catálogo, si aplica
  size_label text, -- talle en texto libre (ej. "10 años", "especial"), por si no está en `sizes`
  color text,
  individual_name text, -- nombre que lleva la prenda (para equipos)
  individual_number text, -- número de camiseta, si aplica
  quantity int not null default 1,
  unit_price numeric(12,2), -- se completa al presupuestar
  print_type_id uuid references print_types(id),
  notes text
);

create index idx_order_items_order on order_items(order_id);

-- Recursos gráficos que sube el cliente: mockup, logo, paleta de colores, etc.
create table order_resources (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  resource_type text not null, -- 'mockup' | 'logo' | 'paleta' | 'otro'
  file_url text not null,      -- ruta en Supabase Storage
  file_name text,
  uploaded_at timestamptz not null default now()
);

create index idx_order_resources_order on order_resources(order_id);

-- Detalles técnicos de producción: tela, moldería, notas para el hermano
create table order_technical_details (
  order_id uuid primary key references orders(id) on delete cascade,
  fabric text,      -- tela
  pattern_notes text, -- moldería
  print_notes text,   -- detalle de estampado
  extra_notes text
);

-- ============================================================================
-- 7. PRESUPUESTOS
-- ============================================================================

-- El presupuesto es el PUNTO DE PARTIDA: se arma a mano con lo que pidió
-- el cliente (por eso se asocia directo a `clients`, no a un pedido). El
-- pedido (`orders`) recién se crea cuando el presupuesto se generó, y en
-- ese momento se completa `order_id` acá abajo.
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique, -- ej. P-2026-001
  client_id uuid not null references clients(id),
  order_id uuid references orders(id) on delete set null, -- se completa al generar el pedido

  items_description text, -- lo que pidió el cliente, en texto libre (cantidades, prendas)
  fabric text,
  color_scheme text,
  pattern_notes text,

  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  deposit_percent numeric(5,2) not null default 50.00,
  deposit_amount numeric(12,2) not null default 0,

  status quote_status not null default 'borrador',
  valid_until date,

  pdf_url text, -- pdf generado guardado en Storage
  notes text,

  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  approved_at timestamptz
);

create index idx_quotes_client on quotes(client_id);
create index idx_quotes_order on quotes(order_id);

-- ============================================================================
-- 8. COMPRAS Y GASTOS
-- ============================================================================
-- Un único concepto para compras (con proveedor y presupuestado vs. real) y
-- gastos generales (sin proveedor, con categoría) — antes eran dos tablas
-- separadas, se unificaron en "purchases" para simplificar la UI.

create table purchases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null, -- null = compra/gasto general
  supplier_id uuid references suppliers(id) on delete set null,
  category text, -- ej. flete, insumos, servicios (opcional, sobre todo para gastos sin proveedor)
  description text not null,
  budgeted_cost numeric(12,2) default 0,
  real_cost numeric(12,2) default 0,
  purchase_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 9. TAREAS (kanban / checklist)
-- ============================================================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null, -- opcional, puede ser suelta
  title text not null,
  description text,
  status task_status not null default 'pendiente',
  priority task_priority not null default 'media',
  due_date date,
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  file_url text not null,
  file_name text
);

-- ============================================================================
-- 10. AGENDA
-- ============================================================================

create table agenda_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  event_type agenda_event_type not null default 'otro',
  title text not null,
  notes text,
  event_at timestamptz not null,
  reminder_sent boolean not null default false, -- para push notifications
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_agenda_events_date on agenda_events(event_at);

-- ============================================================================
-- 11. NUMERACIÓN AUTOMÁTICA (order_number y quote_number)
-- ============================================================================
-- Genera PED-2026-001, P-2026-001, etc. usando el año actual + contador.

create or replace function next_sequence_number(prefix text, year int)
returns text as $$
declare
  seq_count int;
begin
  if prefix = 'PED' then
    select count(*) + 1 into seq_count
    from orders
    where order_number like prefix || '-' || year || '-%';
  else
    select count(*) + 1 into seq_count
    from quotes
    where quote_number like prefix || '-' || year || '-%';
  end if;

  return prefix || '-' || year || '-' || lpad(seq_count::text, 3, '0');
end;
$$ language plpgsql;

create or replace function set_order_number()
returns trigger as $$
begin
  if new.order_number is null then
    new.order_number := next_sequence_number('PED', extract(year from now())::int);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_order_number
before insert on orders
for each row execute function set_order_number();

create or replace function set_quote_number()
returns trigger as $$
begin
  if new.quote_number is null then
    new.quote_number := next_sequence_number('P', extract(year from now())::int);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_quote_number
before insert on quotes
for each row execute function set_quote_number();

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Regla general: todo lo interno (panel del dueño) requiere estar autenticado
-- como usuario del equipo (fila en `profiles`). El acceso público al link de
-- pedido NO se resuelve con RLS abierta a "anon": se resuelve en el servidor
-- (Server Actions / Route Handlers de Next.js) usando la service role key,
-- validando el token del link ahí. Esto evita exponer toda la tabla `orders`
-- a cualquiera que adivine un token.

alter table profiles enable row level security;
alter table business_settings enable row level security;
alter table site_sliders enable row level security;
alter table designs enable row level security;
alter table payment_methods enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table sizes enable row level security;
alter table product_sizes enable row level security;
alter table print_types enable row level security;
alter table clients enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_resources enable row level security;
alter table order_technical_details enable row level security;
alter table quotes enable row level security;
alter table purchases enable row level security;
alter table tasks enable row level security;
alter table task_attachments enable row level security;
alter table agenda_events enable row level security;

-- Helper: ¿el usuario autenticado es parte del equipo interno?
-- SECURITY DEFINER es necesario: si no, esta consulta a `profiles` vuelve a
-- pasar por la política de RLS de `profiles` (que también llama a esta
-- función) y termina en una recursión infinita en cuanto hay filas reales
-- en cualquier tabla con lectura pública + política de equipo combinadas.
create or replace function is_team_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- Política estándar: el equipo interno (cualquier rol) puede hacer todo
-- sobre las tablas de gestión. Se puede endurecer más adelante por rol
-- (ej. solo 'dueno' puede borrar) si hace falta.
create policy "team full access" on business_settings for all using (is_team_member());
create policy "team full access" on site_sliders for all using (is_team_member());
create policy "team full access" on designs for all using (is_team_member());
create policy "team full access" on payment_methods for all using (is_team_member());
create policy "team full access" on suppliers for all using (is_team_member());
create policy "team full access" on products for all using (is_team_member());
create policy "team full access" on product_images for all using (is_team_member());
create policy "team full access" on sizes for all using (is_team_member());
create policy "team full access" on product_sizes for all using (is_team_member());
create policy "team full access" on print_types for all using (is_team_member());
create policy "team full access" on clients for all using (is_team_member());
create policy "team full access" on orders for all using (is_team_member());
create policy "team full access" on order_items for all using (is_team_member());
create policy "team full access" on order_resources for all using (is_team_member());
create policy "team full access" on order_technical_details for all using (is_team_member());
create policy "team full access" on quotes for all using (is_team_member());
create policy "team full access" on purchases for all using (is_team_member());
create policy "team full access" on tasks for all using (is_team_member());
create policy "team full access" on task_attachments for all using (is_team_member());
create policy "team full access" on agenda_events for all using (is_team_member());

-- Cada usuario puede ver/editar su propio perfil; el equipo puede ver todos.
create policy "read own or team profile" on profiles for select using (
  id = auth.uid() or is_team_member()
);
create policy "update own profile" on profiles for update using (id = auth.uid());

-- Catálogo y sliders visibles públicamente (para la web institucional),
-- sin necesidad de estar logueado.
create policy "public read products" on products for select using (active = true);
create policy "public read product_images" on product_images for select using (true);
create policy "public read sizes" on sizes for select using (true);
create policy "public read product_sizes" on product_sizes for select using (true);
create policy "public read sliders" on site_sliders for select using (active = true);
create policy "public read designs" on designs for select using (active = true);
create policy "public read business_settings" on business_settings for select using (true);

-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================
