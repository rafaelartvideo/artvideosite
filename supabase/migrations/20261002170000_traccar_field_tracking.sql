begin;

alter table public.field_tracking_units
  add column if not exists tracking_provider text not null default 'native',
  add column if not exists traccar_unique_id_hash text,
  add column if not exists traccar_unique_id_hint text,
  add column if not exists battery_level numeric(5,2),
  add column if not exists charging boolean,
  add column if not exists altitude_m numeric(12,3),
  add column if not exists provider_protocol text,
  add column if not exists provider_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.field_tracking_units'::regclass
      and conname = 'field_tracking_units_provider_check'
  ) then
    alter table public.field_tracking_units
      add constraint field_tracking_units_provider_check
      check (tracking_provider in ('native','traccar_client','traccar_server'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.field_tracking_units'::regclass
      and conname = 'field_tracking_units_battery_level_check'
  ) then
    alter table public.field_tracking_units
      add constraint field_tracking_units_battery_level_check
      check (battery_level is null or battery_level between 0 and 100);
  end if;
end
$$;

create unique index if not exists field_tracking_units_traccar_hash_uidx
  on public.field_tracking_units (traccar_unique_id_hash)
  where traccar_unique_id_hash is not null;

create table if not exists public.field_tracking_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('traccar_server')),
  token_hash text not null unique,
  token_hint text not null,
  is_active boolean not null default true,
  last_received_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

alter table public.field_tracking_integrations enable row level security;
revoke all on public.field_tracking_integrations from anon, authenticated;

create index if not exists field_tracking_integrations_org_idx
  on public.field_tracking_integrations (organization_id, provider, is_active);

create index if not exists field_tracking_integrations_created_by_idx
  on public.field_tracking_integrations (created_by)
  where created_by is not null;

create or replace function public.create_traccar_field_tracking_unit_v1(
  p_organization_id uuid,
  p_unit_type text,
  p_name text,
  p_identifier_type text default null,
  p_identifier_value text default null
)
returns table(
  unit_id uuid,
  device_identifier text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_unit_type text := lower(btrim(coalesce(p_unit_type, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_identifier_type text := nullif(lower(btrim(coalesce(p_identifier_type, ''))), '');
  v_identifier_value text := nullif(btrim(coalesce(p_identifier_value, '')), '');
  v_device_identifier text;
  v_unit_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.manage') then
    raise exception 'Sem permissão para gerenciar rastreadores.' using errcode = '42501';
  end if;

  if v_unit_type not in ('technician','vehicle','device') then
    raise exception 'Tipo de rastreador inválido.' using errcode = '22023';
  end if;

  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Informe um nome válido para o rastreador.' using errcode = '22023';
  end if;

  if v_identifier_type is not null
     and v_identifier_type not in ('plate','imei','serial','other') then
    raise exception 'Tipo de identificador inválido.' using errcode = '22023';
  end if;

  if v_identifier_value is null then
    v_identifier_type := null;
  elsif v_identifier_type = 'imei' then
    v_identifier_value := regexp_replace(v_identifier_value, '[^0-9]', '', 'g');
    if char_length(v_identifier_value) <> 15 then
      raise exception 'IMEI deve possuir 15 dígitos.' using errcode = '22023';
    end if;
  else
    v_identifier_value := left(v_identifier_value, 120);
  end if;

  loop
    v_device_identifier :=
      'UW-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) ||
      '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    begin
      insert into public.field_tracking_units (
        organization_id,
        unit_type,
        name,
        identifier_type,
        identifier_value,
        tracking_provider,
        traccar_unique_id_hash,
        traccar_unique_id_hint,
        is_active,
        is_sharing,
        created_by
      )
      values (
        p_organization_id,
        v_unit_type,
        v_name,
        v_identifier_type,
        v_identifier_value,
        'traccar_client',
        encode(extensions.digest('traccar:' || v_device_identifier, 'sha256'), 'hex'),
        right(v_device_identifier, 6),
        true,
        false,
        v_user_id
      )
      returning id into v_unit_id;
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return query select v_unit_id, v_device_identifier;
end;
$$;

revoke all on function public.create_traccar_field_tracking_unit_v1(uuid,text,text,text,text)
from public, anon;
grant execute on function public.create_traccar_field_tracking_unit_v1(uuid,text,text,text,text)
to authenticated;

create or replace function public.rotate_traccar_field_tracking_identifier_v1(
  p_organization_id uuid,
  p_unit_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_identifier text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.manage') then
    raise exception 'Sem permissão para gerenciar rastreadores.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.field_tracking_units unit
    where unit.organization_id = p_organization_id
      and unit.id = p_unit_id
      and unit.is_active
  ) then
    raise exception 'Rastreador não encontrado.' using errcode = 'P0002';
  end if;

  loop
    v_identifier :=
      'UW-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) ||
      '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    begin
      update public.field_tracking_units
      set
        tracking_provider = 'traccar_client',
        traccar_unique_id_hash = encode(extensions.digest('traccar:' || v_identifier, 'sha256'), 'hex'),
        traccar_unique_id_hint = right(v_identifier, 6),
        is_sharing = false
      where organization_id = p_organization_id
        and id = p_unit_id;
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return v_identifier;
end;
$$;

revoke all on function public.rotate_traccar_field_tracking_identifier_v1(uuid,uuid)
from public, anon;
grant execute on function public.rotate_traccar_field_tracking_identifier_v1(uuid,uuid)
to authenticated;

create or replace function public.rotate_traccar_forward_token_v1(
  p_organization_id uuid
)
returns table(
  token text,
  token_hint text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text;
  v_hint text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.manage') then
    raise exception 'Sem permissão para configurar integração Traccar.' using errcode = '42501';
  end if;

  v_token :=
    'uwt_' ||
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '');
  v_hint := right(v_token, 8);

  insert into public.field_tracking_integrations (
    organization_id,
    provider,
    token_hash,
    token_hint,
    is_active,
    created_by
  )
  values (
    p_organization_id,
    'traccar_server',
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_hint,
    true,
    v_user_id
  )
  on conflict (organization_id, provider) do update set
    token_hash = excluded.token_hash,
    token_hint = excluded.token_hint,
    is_active = true,
    created_by = excluded.created_by,
    updated_at = now();

  return query select v_token, v_hint;
end;
$$;

revoke all on function public.rotate_traccar_forward_token_v1(uuid)
from public, anon;
grant execute on function public.rotate_traccar_forward_token_v1(uuid)
to authenticated;

create or replace function public.get_traccar_forward_integration_v1(
  p_organization_id uuid
)
returns table(
  configured boolean,
  token_hint text,
  last_received_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.manage') then
    raise exception 'Sem permissão para configurar integração Traccar.' using errcode = '42501';
  end if;

  return query
  select
    true,
    integration.token_hint,
    integration.last_received_at
  from public.field_tracking_integrations integration
  where integration.organization_id = p_organization_id
    and integration.provider = 'traccar_server'
    and integration.is_active
  limit 1;

  if not found then
    return query select false, null::text, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.get_traccar_forward_integration_v1(uuid)
from public, anon;
grant execute on function public.get_traccar_forward_integration_v1(uuid)
to authenticated;

create or replace function public.list_field_tracking_units_v3(
  p_organization_id uuid
)
returns table(
  id uuid,
  organization_id uuid,
  unit_type text,
  name text,
  linked_user_id uuid,
  device_label text,
  identifier_type text,
  identifier_value text,
  tracking_provider text,
  traccar_unique_id_hint text,
  battery_level numeric,
  charging boolean,
  altitude_m numeric,
  provider_protocol text,
  provider_status text,
  paired_at timestamptz,
  paired_device_label text,
  is_active boolean,
  is_sharing boolean,
  latitude double precision,
  longitude double precision,
  accuracy_m numeric,
  speed_mps numeric,
  heading numeric,
  last_seen_at timestamptz,
  last_recorded_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    unit.id,
    unit.organization_id,
    unit.unit_type,
    unit.name,
    unit.linked_user_id,
    unit.device_label,
    unit.identifier_type,
    unit.identifier_value,
    unit.tracking_provider,
    unit.traccar_unique_id_hint,
    unit.battery_level,
    unit.charging,
    unit.altitude_m,
    unit.provider_protocol,
    unit.provider_status,
    unit.paired_at,
    unit.paired_device_label,
    unit.is_active,
    unit.is_sharing,
    unit.latitude,
    unit.longitude,
    unit.accuracy_m,
    unit.speed_mps,
    unit.heading,
    unit.last_seen_at,
    unit.last_recorded_at,
    unit.updated_at
  from public.field_tracking_units unit
  where unit.organization_id = p_organization_id
    and unit.is_active
    and private.can_access_field_tracking(p_organization_id, 'field_tracking.view')
  order by
    case when unit.is_sharing then 0 else 1 end,
    unit.last_seen_at desc nulls last,
    unit.name;
$$;

revoke all on function public.list_field_tracking_units_v3(uuid)
from public, anon;
grant execute on function public.list_field_tracking_units_v3(uuid)
to authenticated;

create or replace function public.ingest_traccar_position_internal_v1(
  p_unique_id_hash text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_mps numeric default null,
  p_heading numeric default null,
  p_altitude_m numeric default null,
  p_battery_level numeric default null,
  p_charging boolean default null,
  p_recorded_at timestamptz default now(),
  p_protocol text default null,
  p_provider_status text default null,
  p_organization_id uuid default null
)
returns table(
  unit_id uuid,
  organization_id uuid,
  unit_name text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unit public.field_tracking_units%rowtype;
  v_recorded_at timestamptz := coalesce(p_recorded_at, now());
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Coordenadas inválidas.' using errcode = '22023';
  end if;

  select unit.*
    into v_unit
  from public.field_tracking_units unit
  where unit.traccar_unique_id_hash = p_unique_id_hash
    and unit.is_active
    and (p_organization_id is null or unit.organization_id = p_organization_id)
  limit 1
  for update;

  if v_unit.id is null then
    raise exception 'Rastreador Traccar não cadastrado.' using errcode = 'P0002';
  end if;

  update public.field_tracking_units unit
  set
    is_sharing = true,
    latitude = p_latitude,
    longitude = p_longitude,
    accuracy_m = p_accuracy_m,
    speed_mps = p_speed_mps,
    heading = p_heading,
    altitude_m = p_altitude_m,
    battery_level = case
      when p_battery_level between 0 and 100 then p_battery_level
      else unit.battery_level
    end,
    charging = coalesce(p_charging, unit.charging),
    provider_protocol = coalesce(nullif(btrim(coalesce(p_protocol, '')), ''), unit.provider_protocol),
    provider_status = coalesce(nullif(btrim(coalesce(p_provider_status, '')), ''), unit.provider_status),
    last_seen_at = now(),
    last_recorded_at = v_recorded_at,
    updated_at = now()
  where unit.id = v_unit.id
    and unit.organization_id = v_unit.organization_id;

  insert into public.field_tracking_points (
    organization_id,
    unit_id,
    latitude,
    longitude,
    accuracy_m,
    speed_mps,
    heading,
    recorded_at
  )
  values (
    v_unit.organization_id,
    v_unit.id,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    p_speed_mps,
    p_heading,
    v_recorded_at
  );

  return query
  select v_unit.id, v_unit.organization_id, v_unit.name;
end;
$$;

revoke all on function public.ingest_traccar_position_internal_v1(
  text,double precision,double precision,numeric,numeric,numeric,numeric,numeric,boolean,timestamptz,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.ingest_traccar_position_internal_v1(
  text,double precision,double precision,numeric,numeric,numeric,numeric,numeric,boolean,timestamptz,text,text,uuid
) to service_role;

commit;
