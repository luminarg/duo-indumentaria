-- Rollo con varios pedidos: también puede llevar trabajos libres.
alter table production_layout_items add column if not exists job_id uuid references production_jobs(id) on delete cascade;
alter table production_layout_items alter column order_id drop not null;
create index if not exists idx_layout_items_job on production_layout_items(job_id);

alter table production_layouts add column if not exists job_ids uuid[] not null default '{}';
