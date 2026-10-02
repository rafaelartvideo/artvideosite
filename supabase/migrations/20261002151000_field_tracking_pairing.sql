begin;

alter table public.field_tracking_units
  add column if not exists identifier_type text,
  add column if not exists identifier_value text,
  add column if not exists tracker_token_hash text,
  add column if not exists paired_at timestamptz,
  add column if not exists paired_device_label text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.field_tracking_units'::regclass
      and conname = 'field_tracking_units_identifier_type_check'
  ) then
    alter table public.field_tracking_units
      add constraint field_tracking_units_identifier_type_check
      check (
        identifier_type is null
        or identifier_type in ('plate','imei','serial','other')
      );
  end if;
end
$$;

create unique index if not exists field_tracking_units_tracker_token_hash_uidx
  on public.field_tracking_units (tracker_token_hash)
  where tracker_token_hash is not null;

create index if not exists field_tracking_units_identifier_idx
  on public.field_tracking_units (organization_id, identifier_type, identifier_value)
  where identifier_value is not null;

create table if not exists public.field_tracking_pairings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  pairing_token_hash text not null unique,
  pairing_code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, unit_id)
    references public.field_tracking_units(organization_id, id) on delete cascade
);

create index if not exists field_tracking_pairings_unit_idx
  on public.field_tracking_pairings (organization_id, unit_id, created_at desc);

create index if not exists field_tracking_pairings_expiry_idx
  on public.field_tracking_pairings (expires_at)
  where consumed_at is null;

alter table public.field_tracking_pairings enable row level security;
revoke all on public.field_tracking_pairings from anon, authenticated;

create or replace function public.create_field_tracking_unit_v1(
  p_organization_id uuid,
  p_unit_type text,
  p_name text,
  p_identifier_type text default null,
  p_identifier_value text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit_type text := lower(btrim(coalesce(p_unit_type, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_identifier_type text := nullif(lower(btrim(coalesce(p_identifier_type, ''))), '');
  v_identifier_value text := nullif(btrim(coalesce(p_identifier_value, '')), '');
  v_unit_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.manage') then
    raise exception 'Sem permissão para gerenciar rastreadores.' using errcode = '42501';
  end if;

  if v_unit_type not in ('vehicle','device') then
    raise exception 'Tipo de rastreador inválido.' using errcode = '22023';
  end if;

  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Informe um nome válido para o rastreador.' using errcode = '22023';
  end if;

  if v_identifier_type is not null
     and v_identifier_type not in ('plate','imei','serial','other') then
    raise exception 'Tipo de identificador inválido.' using errcode = '22023';
  end if;

  if v_identifier_type = 'imei' then
    v_identifier_value := regexp_replace(coalesce(v_identifier_value, ''), '[^0-9]', '', 'g');
    if char_length(v_identifier_value) <> 15 then
      raise exception 'IMEI deve possuir 15 dígitos.' using errcode = '22023';
    end if;
  elsif v_identifier_value is not null then
    v_identifier_value := left(v_identifier_value, 120);
  end if;

  insert into public.field_tracking_units (
    organization_id,
    unit_type,
    name,
    identifier_type,
    identifier_value,
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
    true,
    false,
    (select auth.uid())
  )
  returning id into v_unit_id;

  return v_unit_id;
end;
$$;

revoke all on function public.create_field_tracking_unit_v1(uuid,text,text,text,text)
from public, anon;
grant execute on function public.create_field_tracking_unit_v1(uuid,text,text,text,text)
to authenticated;

create or replace function public.create_field_tracking_pairing_v1(
  p_organization_id uuid,
  p_unit_id uuid
)
returns table(
  unit_id uuid,
  unit_name text,
  pairing_token text,
  pairing_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.field_tracking_units%rowtype;
  v_token text;
  v_code text;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.manage') then
    raise exception 'Sem permissão para gerenciar rastreadores.' using errcode = '42501';
  end if;

  select *
    into v_unit
  from public.field_tracking_units unit
  where unit.organization_id = p_organization_id
    and unit.id = p_unit_id
    and unit.is_active
  limit 1;

  if v_unit.id is null then
    raise exception 'Rastreador não encontrado.' using errcode = 'P0002';
  end if;

  update public.field_tracking_pairings
  set expires_at = least(expires_at, now())
  where organization_id = p_organization_id
    and unit_id = p_unit_id
    and consumed_at is null
    and expires_at > now();

  loop
    v_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    begin
      insert into public.field_tracking_pairings (
        organization_id,
        unit_id,
        pairing_token_hash,
        pairing_code_hash,
        expires_at,
        created_by
      )
      values (
        p_organization_id,
        p_unit_id,
        encode(extensions.digest(v_token, 'sha256'), 'hex'),
        encode(extensions.digest('pairing-code:' || v_code, 'sha256'), 'hex'),
        v_expires_at,
        (select auth.uid())
      );
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return query
  select
    v_unit.id,
    v_unit.name,
    v_token,
    v_code,
    v_expires_at;
end;
$$;

revoke all on function public.create_field_tracking_pairing_v1(uuid,uuid)
from public, anon;
grant execute on function public.create_field_tracking_pairing_v1(uuid,uuid)
to authenticated;

create or replace function public.list_field_tracking_units_v2(
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

revoke all on function public.list_field_tracking_units_v2(uuid)
from public, anon;
grant execute on function public.list_field_tracking_units_v2(uuid)
to authenticated;

commit;
