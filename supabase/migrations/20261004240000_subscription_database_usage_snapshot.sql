-- Snapshot administrativo de uso do PostgreSQL por empresa.
-- Não participa de enforcement nem de cobrança automática.

begin;

create table if not exists public.organization_database_usage_snapshots (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  row_count bigint not null default 0 check (row_count >= 0),
  row_payload_bytes bigint not null default 0 check (row_payload_bytes >= 0),
  allocated_bytes_estimate bigint not null default 0 check (allocated_bytes_estimate >= 0),
  tables_with_data integer not null default 0 check (tables_with_data >= 0),
  details jsonb not null default '[]'::jsonb,
  measured_at timestamptz not null default now(),
  measured_by uuid references public.profiles(id) on delete set null
);

alter table public.organization_database_usage_snapshots enable row level security;
revoke all on table public.organization_database_usage_snapshots from anon, authenticated;

create or replace function public.load_union_organization_database_usage_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_snapshot public.organization_database_usage_snapshots%rowtype;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.view') then
    raise exception 'Sem permissão para visualizar o uso do banco.' using errcode = '42501';
  end if;

  select *
  into v_snapshot
  from public.organization_database_usage_snapshots snapshot
  where snapshot.organization_id = p_organization_id;

  if v_snapshot.organization_id is null then
    return jsonb_build_object(
      'organization_id', p_organization_id,
      'row_count', 0,
      'row_payload_bytes', 0,
      'allocated_bytes_estimate', 0,
      'tables_with_data', 0,
      'details', '[]'::jsonb,
      'measured_at', null
    );
  end if;

  return jsonb_build_object(
    'organization_id', v_snapshot.organization_id,
    'row_count', v_snapshot.row_count,
    'row_payload_bytes', v_snapshot.row_payload_bytes,
    'allocated_bytes_estimate', v_snapshot.allocated_bytes_estimate,
    'tables_with_data', v_snapshot.tables_with_data,
    'details', v_snapshot.details,
    'measured_at', v_snapshot.measured_at
  );
end;
$$;

revoke all on function public.load_union_organization_database_usage_v1(uuid) from public, anon;
grant execute on function public.load_union_organization_database_usage_v1(uuid) to authenticated;

create or replace function public.refresh_union_organization_database_usage_v1(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table record;
  v_org_rows bigint;
  v_org_payload bigint;
  v_total_payload bigint;
  v_relation_bytes bigint;
  v_allocated_estimate bigint;
  v_row_count bigint := 0;
  v_row_payload bigint := 0;
  v_allocated bigint := 0;
  v_tables integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para medir o uso do banco.' using errcode = '42501';
  end if;

  if p_organization_id is null
     or not exists (
       select 1 from public.organizations organization
       where organization.id = p_organization_id
     ) then
    raise exception 'Empresa inválida.' using errcode = '22023';
  end if;

  for v_table in
    select column_info.table_name
    from information_schema.columns column_info
    join information_schema.tables table_info
      on table_info.table_schema = column_info.table_schema
     and table_info.table_name = column_info.table_name
    where column_info.table_schema = 'public'
      and column_info.column_name = 'organization_id'
      and table_info.table_type = 'BASE TABLE'
      and column_info.table_name not in (
        'organization_database_usage_snapshots',
        'organization_usage_counters'
      )
    order by column_info.table_name
  loop
    execute format(
      'select
         count(*) filter (where organization_id = $1)::bigint,
         coalesce(sum(pg_catalog.pg_column_size(t)) filter (where organization_id = $1), 0)::bigint,
         coalesce(sum(pg_catalog.pg_column_size(t)), 0)::bigint
       from public.%I t',
      v_table.table_name
    )
    into v_org_rows, v_org_payload, v_total_payload
    using p_organization_id;

    if coalesce(v_org_rows, 0) = 0 then
      continue;
    end if;

    select pg_catalog.pg_total_relation_size(
      format('%I.%I', 'public', v_table.table_name)::regclass
    )
    into v_relation_bytes;

    if coalesce(v_total_payload, 0) > 0 then
      v_allocated_estimate := round(
        v_relation_bytes::numeric * v_org_payload::numeric / v_total_payload::numeric
      )::bigint;
    else
      v_allocated_estimate := 0;
    end if;

    v_row_count := v_row_count + coalesce(v_org_rows, 0);
    v_row_payload := v_row_payload + coalesce(v_org_payload, 0);
    v_allocated := v_allocated + greatest(coalesce(v_allocated_estimate, 0), 0);
    v_tables := v_tables + 1;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'table_name', v_table.table_name,
      'rows', v_org_rows,
      'row_payload_bytes', v_org_payload,
      'allocated_bytes_estimate', greatest(coalesce(v_allocated_estimate, 0), 0)
    ));
  end loop;

  insert into public.organization_database_usage_snapshots (
    organization_id,
    row_count,
    row_payload_bytes,
    allocated_bytes_estimate,
    tables_with_data,
    details,
    measured_at,
    measured_by
  )
  values (
    p_organization_id,
    v_row_count,
    v_row_payload,
    v_allocated,
    v_tables,
    v_details,
    now(),
    (select auth.uid())
  )
  on conflict (organization_id) do update set
    row_count = excluded.row_count,
    row_payload_bytes = excluded.row_payload_bytes,
    allocated_bytes_estimate = excluded.allocated_bytes_estimate,
    tables_with_data = excluded.tables_with_data,
    details = excluded.details,
    measured_at = excluded.measured_at,
    measured_by = excluded.measured_by;

  insert into public.organization_usage_counters (
    organization_id, usage_key, usage_value, measured_at, updated_by, updated_at
  )
  values
    (p_organization_id, 'database_rows', v_row_count, now(), (select auth.uid()), now()),
    (p_organization_id, 'database_row_bytes', v_row_payload, now(), (select auth.uid()), now()),
    (p_organization_id, 'database_bytes_estimate', v_allocated, now(), (select auth.uid()), now())
  on conflict (organization_id, usage_key) do update set
    usage_value = excluded.usage_value,
    measured_at = excluded.measured_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  v_result := jsonb_build_object(
    'organization_id', p_organization_id,
    'row_count', v_row_count,
    'row_payload_bytes', v_row_payload,
    'allocated_bytes_estimate', v_allocated,
    'tables_with_data', v_tables,
    'details', v_details,
    'measured_at', now()
  );

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    p_organization_id,
    (select auth.uid()),
    'platform_billing.database_usage.measured',
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'row_count', v_row_count,
      'row_payload_bytes', v_row_payload,
      'allocated_bytes_estimate', v_allocated,
      'tables_with_data', v_tables
    )
  );

  return v_result;
end;
$$;

revoke all on function public.refresh_union_organization_database_usage_v1(uuid) from public, anon;
grant execute on function public.refresh_union_organization_database_usage_v1(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
