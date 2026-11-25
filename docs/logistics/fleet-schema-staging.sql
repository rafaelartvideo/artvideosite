-- Rascunho de schema para validação em staging. NÃO aplicar em produção.
-- Reutiliza o módulo e a autorização do Mapa de Campo.
begin;
create unique index if not exists employees_logistics_org_id_uidx on public.employees(organization_id,id);

create table public.logistics_drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,employee_id),
  foreign key(organization_id,employee_id) references public.employees(organization_id,id) on delete restrict
);
create table public.logistics_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 120),
  plate text not null check(plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  capacity_kg numeric(10,2) check(capacity_kg > 0),
  capacity_m3 numeric(10,3) check(capacity_m3 > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,id), unique(organization_id,plate)
);
create table public.logistics_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null,
  vehicle_id uuid not null,
  tracker_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  initial_odometer_km numeric(12,1) not null check(initial_odometer_km >= 0),
  final_odometer_km numeric(12,1),
  departure_checklist jsonb not null,
  return_checklist jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  ended_by uuid references public.profiles(id) on delete restrict,
  foreign key(organization_id,driver_id) references public.logistics_drivers(organization_id,id) on delete restrict,
  foreign key(organization_id,vehicle_id) references public.logistics_vehicles(organization_id,id) on delete restrict,
  foreign key(organization_id,tracker_id) references public.field_tracking_units(organization_id,id) on delete restrict,
  check((ended_at is null and final_odometer_km is null and return_checklist is null and ended_by is null)
     or (ended_at >= started_at and final_odometer_km >= initial_odometer_km and return_checklist is not null and ended_by is not null)),
  check(jsonb_typeof(departure_checklist) = 'object' and departure_checklist @> '{"tires":true,"lights":true,"cargo":true}'),
  check(return_checklist is null or (jsonb_typeof(return_checklist) = 'object' and return_checklist ?& array['cargo','damage_notes'] and jsonb_typeof(return_checklist->'cargo') = 'boolean' and jsonb_typeof(return_checklist->'damage_notes') = 'string' and length(return_checklist->>'damage_notes') <= 1000 and (return_checklist->>'cargo' = 'true' or length(btrim(return_checklist->>'damage_notes')) > 0)))
);
create unique index logistics_active_driver on public.logistics_shifts(organization_id,driver_id) where ended_at is null;
create unique index logistics_active_vehicle on public.logistics_shifts(organization_id,vehicle_id) where ended_at is null;
create unique index logistics_active_tracker on public.logistics_shifts(organization_id,tracker_id) where ended_at is null;
create index logistics_shifts_recent on public.logistics_shifts(organization_id,started_at desc);

alter table public.logistics_drivers enable row level security;
alter table public.logistics_vehicles enable row level security;
alter table public.logistics_shifts enable row level security;
-- Gestão inicial restrita a quem já pode visualizar e gerenciar rastreadores.
do $$
declare t text;
begin
  foreach t in array array['logistics_drivers','logistics_vehicles','logistics_shifts'] loop
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy logistics_read on public.%I for select to authenticated using (private.can_access_field_tracking(organization_id,''field_tracking.view'') and private.can_access_field_tracking(organization_id,''field_tracking.manage''))',t);
    execute format('create policy logistics_insert on public.%I for insert to authenticated with check (private.can_access_field_tracking(organization_id,''field_tracking.view'') and private.can_access_field_tracking(organization_id,''field_tracking.manage''))',t);
    execute format('create policy logistics_update on public.%I for update to authenticated using (private.can_access_field_tracking(organization_id,''field_tracking.view'') and private.can_access_field_tracking(organization_id,''field_tracking.manage'')) with check (private.can_access_field_tracking(organization_id,''field_tracking.view'') and private.can_access_field_tracking(organization_id,''field_tracking.manage''))',t);
  end loop;
end $$;
grant insert (organization_id,employee_id) on public.logistics_drivers to authenticated;
grant update (is_active) on public.logistics_drivers to authenticated;
grant insert (organization_id,name,plate,capacity_kg,capacity_m3) on public.logistics_vehicles to authenticated;
grant update (name,capacity_kg,capacity_m3,is_active) on public.logistics_vehicles to authenticated;
grant insert (organization_id,driver_id,vehicle_id,tracker_id,initial_odometer_km,departure_checklist) on public.logistics_shifts to authenticated;
grant update (final_odometer_km,return_checklist) on public.logistics_shifts to authenticated;

create function private.validate_logistics_driver() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.is_active and not exists(select 1 from public.employees e where e.organization_id=new.organization_id and e.id=new.employee_id and e.is_active) then
    raise exception 'Funcionário ativo não encontrado ou sem acesso.';
  end if;
  if tg_op='UPDATE' and not new.is_active and exists(select 1 from public.logistics_shifts s where s.organization_id=new.organization_id and s.driver_id=new.id and s.ended_at is null) then
    raise exception 'Motorista possui jornada aberta.';
  end if;
  return new;
end $$;
create trigger logistics_driver_validation before insert or update on public.logistics_drivers for each row execute function private.validate_logistics_driver();

create function private.validate_logistics_vehicle() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not new.is_active and exists(select 1 from public.logistics_shifts s where s.organization_id=new.organization_id and s.vehicle_id=new.id and s.ended_at is null) then
    raise exception 'Veículo possui jornada aberta.';
  end if;
  return new;
end $$;
create trigger logistics_vehicle_validation before update on public.logistics_vehicles for each row execute function private.validate_logistics_vehicle();

create function private.validate_logistics_shift() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    -- Lock driver and vehicle rows to serialize status changes with shift creation.
    perform 1 from public.logistics_drivers d where d.organization_id=new.organization_id and d.id=new.driver_id for share;
    perform 1 from public.logistics_vehicles v where v.organization_id=new.organization_id and v.id=new.vehicle_id for share;
    if not exists(select 1 from public.logistics_drivers d join public.employees e on e.organization_id=d.organization_id and e.id=d.employee_id where d.organization_id=new.organization_id and d.id=new.driver_id and d.is_active and e.is_active)
    or not exists(select 1 from public.logistics_vehicles v where v.organization_id=new.organization_id and v.id=new.vehicle_id and v.is_active)
    or not exists(select 1 from public.field_tracking_units t where t.organization_id=new.organization_id and t.id=new.tracker_id and t.is_active) then
      raise exception 'Motorista, veículo ou rastreador indisponível.';
    end if;
    if new.initial_odometer_km < coalesce((select max(s.final_odometer_km) from public.logistics_shifts s where s.organization_id=new.organization_id and s.vehicle_id=new.vehicle_id),0) then
      raise exception 'Hodômetro inicial inferior ao último valor registrado.';
    end if;
  else
    if old.ended_at is not null then raise exception 'Jornada já encerrada.'; end if;
    if new.final_odometer_km is null or new.final_odometer_km < old.initial_odometer_km or new.return_checklist is null then
      raise exception 'Informe o hodômetro final e o checklist de retorno.';
    end if;
    new.ended_at := now(); new.ended_by := auth.uid();
  end if;
  return new;
end $$;
create trigger logistics_shift_validation before insert or update on public.logistics_shifts for each row execute function private.validate_logistics_shift();
revoke all on function private.validate_logistics_driver(), private.validate_logistics_vehicle(), private.validate_logistics_shift() from public,anon,authenticated;
commit;
