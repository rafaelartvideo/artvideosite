begin;

insert into public.system_modules (key, name, description, category, sort_order, is_active)
values (
  'field_tracking',
  'Mapa de Campo',
  'Rastreamento operacional de técnicos, dispositivos e veículos em campo.',
  'operation',
  55,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.organization_modules (
  organization_id,
  module_key,
  is_enabled,
  limits,
  settings,
  enabled_at
)
select
  organization_module.organization_id,
  'field_tracking',
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  now()
from public.organization_modules organization_module
where organization_module.module_key = 'orders'
  and organization_module.is_enabled
on conflict (organization_id, module_key) do update set
  is_enabled = true,
  enabled_at = coalesce(public.organization_modules.enabled_at, excluded.enabled_at),
  updated_at = now();

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('field_tracking.view', 'Visualizar mapa de campo', 'Permite visualizar a posição dos rastreadores da empresa.', 'Mapa de Campo — Acesso', 3200),
  ('field_tracking.share', 'Compartilhar localização', 'Permite que o próprio usuário compartilhe a localização do dispositivo autenticado.', 'Mapa de Campo — Rastreamento', 3201),
  ('field_tracking.manage', 'Gerenciar rastreadores', 'Permite gerenciar técnicos, veículos e dispositivos rastreados.', 'Mapa de Campo — Configurações', 3202)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, permission.id
from public.role_permissions existing
join public.permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.key = 'roles.permissions.manage'
cross join public.permissions permission
where permission.key in ('field_tracking.view', 'field_tracking.share', 'field_tracking.manage')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, share_permission.id
from public.role_permissions existing
join public.permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.key = 'orders.view'
cross join public.permissions share_permission
where share_permission.key = 'field_tracking.share'
on conflict (role_id, permission_id) do nothing;

create table if not exists public.field_tracking_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_type text not null default 'technician'
    check (unit_type in ('technician', 'vehicle', 'device')),
  name text not null check (btrim(name) <> ''),
  linked_user_id uuid references public.profiles(id) on delete set null,
  device_label text,
  is_active boolean not null default true,
  is_sharing boolean not null default false,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  accuracy_m numeric(10,2) check (accuracy_m is null or accuracy_m >= 0),
  speed_mps numeric(10,3) check (speed_mps is null or speed_mps >= 0),
  heading numeric(6,2) check (heading is null or (heading >= 0 and heading <= 360)),
  last_seen_at timestamptz,
  last_recorded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index if not exists field_tracking_units_org_user_technician_uidx
  on public.field_tracking_units (organization_id, linked_user_id)
  where unit_type = 'technician' and linked_user_id is not null;

create index if not exists field_tracking_units_org_active_idx
  on public.field_tracking_units (organization_id, is_active, unit_type);

create index if not exists field_tracking_units_org_last_seen_idx
  on public.field_tracking_units (organization_id, last_seen_at desc)
  where is_active;

create table if not exists public.field_tracking_points (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m numeric(10,2) check (accuracy_m is null or accuracy_m >= 0),
  speed_mps numeric(10,3) check (speed_mps is null or speed_mps >= 0),
  heading numeric(6,2) check (heading is null or (heading >= 0 and heading <= 360)),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, unit_id)
    references public.field_tracking_units(organization_id, id) on delete cascade
);

create index if not exists field_tracking_points_unit_recorded_idx
  on public.field_tracking_points (organization_id, unit_id, recorded_at desc);

create or replace function private.field_tracking_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.field_tracking_touch_updated_at() from public;

drop trigger if exists field_tracking_units_touch_updated_at on public.field_tracking_units;
create trigger field_tracking_units_touch_updated_at
before update on public.field_tracking_units
for each row execute function private.field_tracking_touch_updated_at();

create or replace function private.can_access_field_tracking(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and (select auth.uid()) is not null
    and private.is_organization_member(p_organization_id)
    and private.is_organization_module_enabled(p_organization_id, 'field_tracking')
    and private.has_effective_organization_permission(p_organization_id, p_permission_key);
$$;

revoke all on function private.can_access_field_tracking(uuid, text) from public;

alter table public.field_tracking_units enable row level security;
alter table public.field_tracking_points enable row level security;

drop policy if exists field_tracking_units_select on public.field_tracking_units;
create policy field_tracking_units_select
on public.field_tracking_units
for select
to authenticated
using (
  private.can_access_field_tracking(organization_id, 'field_tracking.view')
  or (
    linked_user_id = (select auth.uid())
    and private.can_access_field_tracking(organization_id, 'field_tracking.share')
  )
);

drop policy if exists field_tracking_points_select on public.field_tracking_points;
create policy field_tracking_points_select
on public.field_tracking_points
for select
to authenticated
using (
  private.can_access_field_tracking(organization_id, 'field_tracking.view')
);

revoke insert, update, delete on public.field_tracking_units from anon, authenticated;
revoke insert, update, delete on public.field_tracking_points from anon, authenticated;
grant select on public.field_tracking_units to authenticated;
grant select on public.field_tracking_points to authenticated;

create or replace function public.list_field_tracking_units_v1(
  p_organization_id uuid
)
returns table(
  id uuid,
  organization_id uuid,
  unit_type text,
  name text,
  linked_user_id uuid,
  device_label text,
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

revoke all on function public.list_field_tracking_units_v1(uuid) from public, anon;
grant execute on function public.list_field_tracking_units_v1(uuid) to authenticated;

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

  if not private.can_access_field_tracking(p_organization_id, 'field_tracking.share') then
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'field_tracking_units'
    )
  then
    alter publication supabase_realtime add table public.field_tracking_units;
  end if;
end
$$;

commit;
