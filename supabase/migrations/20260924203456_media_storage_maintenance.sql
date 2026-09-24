begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:media_storage_maintenance', 0)
);

create table if not exists public.media_optimization_log (
  media_id uuid primary key references public.media(id) on delete cascade,
  status text not null check (status in ('optimized','skipped','failed')),
  original_path text,
  optimized_path text,
  original_size bigint,
  optimized_size bigint,
  error_message text,
  processed_at timestamptz not null default now()
);

alter table public.media_optimization_log enable row level security;
revoke all on table public.media_optimization_log from anon, authenticated;
grant select, insert, update, delete on table public.media_optimization_log to service_role;

create or replace function public.media_maintenance_orphan_candidates(
  p_limit integer default 500,
  p_older_than interval default interval '1 day'
)
returns table (
  media_id uuid,
  bucket_id text,
  storage_path text,
  file_size bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    m.id,
    m.bucket_id,
    m.storage_path,
    coalesce(m.file_size, 0)::bigint
  from public.media m
  where m.bucket_id = 'service-images'
    and m.created_at < now() - p_older_than
    and not exists (select 1 from public.service_order_media x where x.media_id = m.id)
    and not exists (select 1 from public.service_order_situation_media x where x.media_id = m.id)
    and not exists (select 1 from public.service_order_checklist_item_media x where x.media_id = m.id)
    and not exists (select 1 from public.service_order_solution_attempt_media x where x.media_id = m.id)
    and not exists (select 1 from public.entity_record_media x where x.media_id = m.id)
    and not exists (
      select 1
      from public.organization_company_settings x
      where x.logo_media_id = m.id or x.menu_logo_media_id = m.id
    )
  order by m.created_at asc
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

create or replace function public.media_maintenance_storage_orphan_candidates(
  p_limit integer default 1000,
  p_older_than interval default interval '1 day'
)
returns table (
  bucket_id text,
  storage_path text,
  size_bytes bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    s.bucket_id,
    s.name,
    coalesce((s.metadata ->> 'size')::bigint, 0)
  from storage.objects s
  where s.bucket_id = 'service-images'
    and s.created_at < now() - p_older_than
    and not exists (
      select 1
      from public.media m
      where m.bucket_id = s.bucket_id
        and m.storage_path = s.name
    )
  order by s.created_at asc
  limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;

create or replace function public.media_maintenance_compression_candidates(
  p_limit integer default 4,
  p_min_bytes bigint default 500000
)
returns table (
  media_id uuid,
  organization_id uuid,
  bucket_id text,
  storage_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  quality integer,
  min_quality integer,
  max_dimension integer,
  target_max_bytes bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    m.id,
    m.organization_id,
    m.bucket_id,
    m.storage_path,
    m.file_name,
    coalesce(m.file_size, 0)::bigint,
    m.mime_type,
    case when exists (
      select 1 from public.service_order_media som
      where som.media_id = m.id
        and coalesce(som.sort_order, 0) >= 500
        and coalesce(som.sort_order, 0) < 1000
    ) then 88 else 82 end,
    case when exists (
      select 1 from public.service_order_media som
      where som.media_id = m.id
        and coalesce(som.sort_order, 0) >= 500
        and coalesce(som.sort_order, 0) < 1000
    ) then 82 else 72 end,
    case when exists (
      select 1 from public.service_order_media som
      where som.media_id = m.id
        and coalesce(som.sort_order, 0) >= 500
        and coalesce(som.sort_order, 0) < 1000
    ) then 2200 else 1920 end,
    case when exists (
      select 1 from public.service_order_media som
      where som.media_id = m.id
        and coalesce(som.sort_order, 0) >= 500
        and coalesce(som.sort_order, 0) < 1000
    ) then 1638400::bigint else 1228800::bigint end
  from public.media m
  where m.bucket_id = 'service-images'
    and m.mime_type in ('image/jpeg', 'image/png')
    and coalesce(m.file_size, 0) >= greatest(1, coalesce(p_min_bytes, 500000))
    and m.created_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.media_optimization_log log
      where log.media_id = m.id
    )
    and (
      exists(select 1 from public.service_order_media x where x.media_id = m.id)
      or exists(select 1 from public.service_order_situation_media x where x.media_id = m.id)
      or exists(select 1 from public.service_order_checklist_item_media x where x.media_id = m.id)
      or exists(select 1 from public.service_order_solution_attempt_media x where x.media_id = m.id)
      or exists(select 1 from public.entity_record_media x where x.media_id = m.id)
      or exists (
        select 1
        from public.organization_company_settings x
        where x.logo_media_id = m.id or x.menu_logo_media_id = m.id
      )
    )
  order by m.file_size desc nulls last, m.created_at asc
  limit greatest(1, least(coalesce(p_limit, 4), 20));
$$;

revoke all on function public.media_maintenance_orphan_candidates(integer, interval) from public, anon, authenticated;
revoke all on function public.media_maintenance_storage_orphan_candidates(integer, interval) from public, anon, authenticated;
revoke all on function public.media_maintenance_compression_candidates(integer, bigint) from public, anon, authenticated;

grant execute on function public.media_maintenance_orphan_candidates(integer, interval) to service_role;
grant execute on function public.media_maintenance_storage_orphan_candidates(integer, interval) to service_role;
grant execute on function public.media_maintenance_compression_candidates(integer, bigint) to service_role;

comment on table public.media_optimization_log is
  'Registro interno das otimizações legadas de mídia para impedir recompressão repetida.';
comment on function public.media_maintenance_orphan_candidates(integer, interval) is
  'Lista mídias service-images antigas sem qualquer vínculo funcional.';
comment on function public.media_maintenance_storage_orphan_candidates(integer, interval) is
  'Lista objetos físicos antigos de service-images sem registro correspondente em media.';
comment on function public.media_maintenance_compression_candidates(integer, bigint) is
  'Lista imagens legadas vinculadas que ainda podem ser compactadas uma única vez.';

commit;