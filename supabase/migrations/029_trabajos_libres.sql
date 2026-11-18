-- Trabajos libres: escalado para terceros, sin un pedido detrás.
-- El cliente puede usar la moldería propia o traer la suya (modelo "de cliente").
alter table pattern_models add column if not exists owner_name text; -- null = moldería propia

create table if not exists production_jobs (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  notes text,
  model_id uuid references pattern_models(id) on delete set null,
  -- [{ size, qty, name, number, variant }]
  items jsonb not null default '[]'::jsonb,
  -- Mismo formato que order_designs.config (lib/produccion/types.ts → DesignConfig)
  design jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_production_jobs_created on production_jobs(created_at desc);

alter table production_jobs enable row level security;
drop policy if exists "team full access" on production_jobs;
create policy "team full access" on production_jobs for all using (is_team_member());

alter table production_layouts add column if not exists job_id uuid references production_jobs(id) on delete cascade;
create index if not exists idx_production_layouts_job on production_layouts(job_id);
