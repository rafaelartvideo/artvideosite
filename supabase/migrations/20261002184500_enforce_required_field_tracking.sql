begin;

create or replace function private.is_field_tracking_required(
  p_organization_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and coalesce(p_user_id, (select auth.uid())) is not null
    and private.is_organization_member(p_organization_id)
    and private.is_organization_module_enabled(p_organization_id, 'field_tracking')
    and exists (
      select 1
      from public.employees employee
      where employee.organization_id = p_organization_id
        and employee.profile_id = coalesce(p_user_id, (select auth.uid()))
        and employee.is_active
        and employee.field_tracking_prompt_on_login
    );
$$;

revoke all on function private.is_field_tracking_required(uuid,uuid)
from public, anon, authenticated;

create or replace function public.update_my_field_location_v1(
  p_organization_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_speed_mps numeric default null,
  p_heading numeric default null,
  p_recorded_at timestamptz default now(),
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_unit_id uuid;
  v_name text;
  v_recorded_at timestamptz := coalesce(p_recorded_at, now());
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not (
    private.can_access_field_tracking(p_organization_id, 'field_tracking.share')
    or private.is_field_tracking_required(p_organization_id, v_user_id)
  ) then
    raise exception 'Sem permissão para compartilhar localização.' using errcode = '42501';
  end if;

  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Coordenadas inválidas.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(profile.username), ''), 'Técnico')
    into v_name
  from public.profiles profile
  where profile.id = v_user_id;

  v_name := coalesce(v_name, 'Técnico');

  select unit.id
    into v_unit_id
  from public.field_tracking_units unit
  where unit.organization_id = p_organization_id
    and unit.linked_user_id = v_user_id
    and unit.unit_type = 'technician'
  limit 1
  for update;

  if v_unit_id is null then
    insert into public.field_tracking_units (
      organization_id,
      unit_type,
      name,
      linked_user_id,
      device_label,
      is_active,
      is_sharing,
      latitude,
      longitude,
      accuracy_m,
      speed_mps,
      heading,
      last_seen_at,
      last_recorded_at,
      created_by
    )
    values (
      p_organization_id,
      'technician',
      v_name,
      v_user_id,
      nullif(btrim(p_device_label), ''),
      true,
      true,
      p_latitude,
      p_longitude,
      p_accuracy_m,
      p_speed_mps,
      p_heading,
      now(),
      v_recorded_at,
      v_user_id
    )
    returning id into v_unit_id;
  else
    update public.field_tracking_units
    set
      name = v_name,
      device_label = coalesce(nullif(btrim(p_device_label), ''), device_label),
      is_active = true,
      is_sharing = true,
      latitude = p_latitude,
      longitude = p_longitude,
      accuracy_m = p_accuracy_m,
      speed_mps = p_speed_mps,
      heading = p_heading,
      last_seen_at = now(),
      last_recorded_at = v_recorded_at
    where id = v_unit_id
      and organization_id = p_organization_id;
  end if;

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
    p_organization_id,
    v_unit_id,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    p_speed_mps,
    p_heading,
    v_recorded_at
  );

  return v_unit_id;
end;
$$;

revoke all on function public.update_my_field_location_v1(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text)
from public, anon;
grant execute on function public.update_my_field_location_v1(uuid,double precision,double precision,numeric,numeric,numeric,timestamptz,text)
to authenticated;

create or replace function public.stop_my_field_tracking_v1(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if private.is_field_tracking_required(p_organization_id, v_user_id) then
    raise exception 'O compartilhamento de localização é obrigatório para este usuário.' using errcode = '42501';
  end if;

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.share') then
    raise exception 'Sem permissão para alterar o rastreamento.' using errcode = '42501';
  end if;

  update public.field_tracking_units
  set is_sharing = false
  where organization_id = p_organization_id
    and linked_user_id = v_user_id
    and unit_type = 'technician';
end;
$$;

revoke all on function public.stop_my_field_tracking_v1(uuid) from public, anon;
grant execute on function public.stop_my_field_tracking_v1(uuid) to authenticated;

commit;
