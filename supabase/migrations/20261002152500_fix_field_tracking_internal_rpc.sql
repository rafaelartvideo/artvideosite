create or replace function public.redeem_field_tracking_pairing_internal_v1(
  p_pairing_token_hash text default null,
  p_pairing_code_hash text default null,
  p_tracker_token_hash text default null,
  p_device_label text default null
)
returns table(
  unit_id uuid,
  organization_id uuid,
  unit_name text,
  unit_type text,
  identifier_type text,
  identifier_value text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pairing public.field_tracking_pairings%rowtype;
  v_unit public.field_tracking_units%rowtype;
begin
  if nullif(btrim(coalesce(p_tracker_token_hash, '')), '') is null then
    raise exception 'Credencial do rastreador inválida.' using errcode = '22023';
  end if;

  select pairing.*
    into v_pairing
  from public.field_tracking_pairings as pairing
  where pairing.consumed_at is null
    and pairing.expires_at > now()
    and (
      (
        nullif(btrim(coalesce(p_pairing_token_hash, '')), '') is not null
        and pairing.pairing_token_hash = p_pairing_token_hash
      )
      or (
        nullif(btrim(coalesce(p_pairing_code_hash, '')), '') is not null
        and pairing.pairing_code_hash = p_pairing_code_hash
      )
    )
  order by pairing.created_at desc
  limit 1
  for update;

  if v_pairing.id is null then
    raise exception 'Código de pareamento inválido ou expirado.' using errcode = 'P0002';
  end if;

  select tracking_unit.*
    into v_unit
  from public.field_tracking_units as tracking_unit
  where tracking_unit.organization_id = v_pairing.organization_id
    and tracking_unit.id = v_pairing.unit_id
    and tracking_unit.is_active
  limit 1
  for update;

  if v_unit.id is null then
    raise exception 'Rastreador não está mais disponível.' using errcode = 'P0002';
  end if;

  update public.field_tracking_pairings as pairing
  set consumed_at = now()
  where pairing.id = v_pairing.id;

  update public.field_tracking_units as tracking_unit
  set
    tracker_token_hash = p_tracker_token_hash,
    paired_at = now(),
    paired_device_label = nullif(btrim(coalesce(p_device_label, '')), ''),
    device_label = coalesce(nullif(btrim(coalesce(p_device_label, '')), ''), tracking_unit.device_label),
    is_sharing = true
  where tracking_unit.id = v_unit.id
    and tracking_unit.organization_id = v_unit.organization_id;

  return query
  select
    v_unit.id,
    v_unit.organization_id,
    v_unit.name,
    v_unit.unit_type,
    v_unit.identifier_type,
    v_unit.identifier_value;
end;
$$;

revoke all on function public.redeem_field_tracking_pairing_internal_v1(text,text,text,text)
from public, anon, authenticated;
grant execute on function public.redeem_field_tracking_pairing_internal_v1(text,text,text,text)
to service_role;

create or replace function public.update_paired_field_location_internal_v1(
  p_tracker_token_hash text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_mps numeric default null,
  p_heading numeric default null,
  p_recorded_at timestamptz default now(),
  p_device_label text default null
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

  select tracking_unit.*
    into v_unit
  from public.field_tracking_units as tracking_unit
  where tracking_unit.tracker_token_hash = p_tracker_token_hash
    and tracking_unit.is_active
  limit 1
  for update;

  if v_unit.id is null then
    raise exception 'Rastreador não autorizado.' using errcode = '42501';
  end if;

  update public.field_tracking_units as tracking_unit
  set
    is_sharing = true,
    latitude = p_latitude,
    longitude = p_longitude,
    accuracy_m = p_accuracy_m,
    speed_mps = p_speed_mps,
    heading = p_heading,
    last_seen_at = now(),
    last_recorded_at = v_recorded_at,
    device_label = coalesce(nullif(btrim(coalesce(p_device_label, '')), ''), tracking_unit.device_label)
  where tracking_unit.id = v_unit.id
    and tracking_unit.organization_id = v_unit.organization_id;

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

revoke all on function public.update_paired_field_location_internal_v1(text,double precision,double precision,numeric,numeric,numeric,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.update_paired_field_location_internal_v1(text,double precision,double precision,numeric,numeric,numeric,timestamptz,text)
to service_role;
