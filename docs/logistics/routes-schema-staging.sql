-- Staging only, after fleet-schema-staging.sql and jobs-schema-staging.sql.
-- Immutable geographic planning snapshots; no claim of road routing or actual travel.
begin;
create table public.logistics_route_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shift_id uuid not null,
  planned_departure timestamptz not null,
  origin_lat double precision not null check(origin_lat between -90 and 90),
  origin_lon double precision not null check(origin_lon between -180 and 180),
  return_to_origin boolean not null default true,
  assumed_speed_kmh numeric(5,2) not null check(assumed_speed_kmh between 5 and 100),
  stops jsonb not null check(jsonb_typeof(stops)='array' and jsonb_array_length(stops) between 1 and 30),
  method text not null default 'geographic' check(method='geographic'),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(organization_id,shift_id) references public.logistics_shifts(organization_id,id) on delete restrict
);
create index logistics_route_plans_shift on public.logistics_route_plans(organization_id,shift_id,created_at desc);
alter table public.logistics_route_plans enable row level security;
revoke all on public.logistics_route_plans from public,anon,authenticated;
grant select on public.logistics_route_plans to authenticated;
grant insert(organization_id,shift_id,planned_departure,origin_lat,origin_lon,return_to_origin,assumed_speed_kmh,stops) on public.logistics_route_plans to authenticated;
create policy logistics_route_plans_read on public.logistics_route_plans for select to authenticated using (
  private.can_access_field_tracking(organization_id,'field_tracking.view') and private.can_access_field_tracking(organization_id,'field_tracking.manage')
);
create policy logistics_route_plans_insert on public.logistics_route_plans for insert to authenticated with check (
  private.can_access_field_tracking(organization_id,'field_tracking.view') and private.can_access_field_tracking(organization_id,'field_tracking.manage')
);
create function private.validate_logistics_route_plan() returns trigger language plpgsql security invoker set search_path='' as $$
declare
  item jsonb;
  seen uuid[] := array[]::uuid[];
  job uuid;
  window_start_value timestamptz;
  window_end_value timestamptz;
  lat double precision;
  lon double precision;
  service_minutes integer;
  normalized jsonb := '[]'::jsonb;
begin
  perform 1 from public.logistics_shifts s where s.organization_id=new.organization_id and s.id=new.shift_id and s.ended_at is null for share;
  if not found then raise exception 'Selecione uma jornada aberta.'; end if;
  for item in select value from jsonb_array_elements(new.stops) loop
    job:=(item->>'id')::uuid;
    lat:=(item->>'latitude')::double precision;
    lon:=(item->>'longitude')::double precision;
    service_minutes:=(item->>'serviceMinutes')::integer;
    if job is null or job=any(seen) or lat is null or lon is null or service_minutes is null or not(lat between -90 and 90 and lon between -180 and 180 and service_minutes between 1 and 180) then
      raise exception 'Parada inválida ou repetida.';
    end if;
    select j.window_start,j.window_end into window_start_value,window_end_value
      from public.logistics_jobs j where j.id=job and j.organization_id=new.organization_id and j.shift_id=new.shift_id and j.status in ('assigned','loaded') for share;
    if not found then raise exception 'Operação não pertence à jornada ou já foi iniciada.'; end if;
    seen:=array_append(seen,job);
    normalized:=normalized||jsonb_build_array(jsonb_build_object('id',job,'latitude',lat,'longitude',lon,'serviceMinutes',service_minutes,'window_start',window_start_value,'window_end',window_end_value));
  end loop;
  new.stops:=normalized;
  return new;
end $$;
create trigger logistics_route_plan_validation before insert on public.logistics_route_plans for each row execute function private.validate_logistics_route_plan();
revoke all on function private.validate_logistics_route_plan() from public,anon,authenticated;
commit;
