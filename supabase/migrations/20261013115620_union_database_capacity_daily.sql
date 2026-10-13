-- Lightweight daily PostgreSQL capacity trend (catalog statistics only).
-- The heavier per-organization snapshot feature remains manual.
create table if not exists private.union_database_capacity_samples (
  sample_date date primary key,
  database_bytes bigint not null,
  sac_bytes bigint not null,
  uniq_bytes bigint not null,
  service_orders_bytes bigint not null,
  measured_at timestamptz not null default now()
);
revoke all on private.union_database_capacity_samples from public, anon, authenticated;

create or replace function private.capture_union_database_capacity()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into private.union_database_capacity_samples(
    sample_date, database_bytes, sac_bytes, uniq_bytes, service_orders_bytes, measured_at
  )
  select
    (pg_catalog.now() at time zone 'America/Sao_Paulo')::date,
    pg_catalog.pg_database_size(pg_catalog.current_database()),
    coalesce(sum(pg_catalog.pg_total_relation_size(c.oid))
      filter (where c.relname like 'sac_digital%'), 0),
    coalesce(sum(pg_catalog.pg_total_relation_size(c.oid))
      filter (where c.relname like 'uniq_%'), 0),
    coalesce(sum(pg_catalog.pg_total_relation_size(c.oid))
      filter (where c.relname like 'service_order%'), 0),
    pg_catalog.now()
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  on conflict(sample_date) do update set
    database_bytes = excluded.database_bytes,
    sac_bytes = excluded.sac_bytes,
    uniq_bytes = excluded.uniq_bytes,
    service_orders_bytes = excluded.service_orders_bytes,
    measured_at = excluded.measured_at;

  delete from private.union_database_capacity_samples
  where sample_date < (pg_catalog.now() at time zone 'America/Sao_Paulo')::date - 365;
end;
$$;
revoke all on function private.capture_union_database_capacity()
from public, anon, authenticated;

select cron.schedule(
  'union-database-capacity-daily',
  '30 3 * * *',
  'select private.capture_union_database_capacity();'
);
select private.capture_union_database_capacity();
