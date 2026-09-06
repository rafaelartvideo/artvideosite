begin;

create table if not exists public.service_order_situation_visits (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  situation_id uuid references public.os_situations(id) on delete set null,
  service_type_id_snapshot uuid references public.service_types(id) on delete set null,
  visit_number integer not null check (visit_number > 0),
  situation_name_snapshot text not null,
  situation_color_snapshot text,
  entered_at timestamptz not null,
  exited_at timestamptz,
  sla_hours_snapshot numeric,
  sla_due_at timestamptz,
  entered_by uuid references public.profiles(id) on delete set null,
  exited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_order_situation_visits_dates_check
    check (exited_at is null or exited_at >= entered_at),
  constraint service_order_situation_visits_visit_unique
    unique (service_order_id, situation_id, visit_number)
);

create index if not exists service_order_situation_visits_order_idx
  on public.service_order_situation_visits(service_order_id, entered_at desc);

create index if not exists service_order_situation_visits_situation_idx
  on public.service_order_situation_visits(service_order_id, situation_id, visit_number desc);

create unique index if not exists service_order_situation_visits_one_open_idx
  on public.service_order_situation_visits(service_order_id)
  where exited_at is null;

alter table public.service_order_situation_visits enable row level security;

drop policy if exists service_order_situation_visits_select on public.service_order_situation_visits;
create policy service_order_situation_visits_select
on public.service_order_situation_visits
for select
to authenticated
using (
  private.has_permission('orders.section.sla_cards')
  and private.can_view_service_order(service_order_id)
);

grant select on public.service_order_situation_visits to authenticated;
revoke insert, update, delete on public.service_order_situation_visits from authenticated;

create or replace function private.service_order_effective_sla_hours(
  p_service_type_id uuid,
  p_situation_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when sts.service_type_id is null then null
    when sts.use_default_hours is true then nullif(os.hours, 0)
    else nullif(sts.sla_hours, 0)
  end
  from public.os_situations os
  left join public.service_type_situations sts
    on sts.situation_id = os.id
   and sts.service_type_id = p_service_type_id
  where os.id = p_situation_id
  limit 1;
$$;

create or replace function private.open_service_order_situation_visit(
  p_service_order_id uuid,
  p_situation_id uuid,
  p_service_type_id uuid,
  p_entered_at timestamptz,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_name text;
  v_color text;
  v_sla_hours numeric;
  v_visit_number integer;
begin
  if p_situation_id is null then
    return;
  end if;

  select name, color
    into v_name, v_color
  from public.os_situations
  where id = p_situation_id;

  if v_name is null then
    v_name := 'Situação removida';
  end if;

  v_sla_hours := private.service_order_effective_sla_hours(p_service_type_id, p_situation_id);

  select coalesce(max(visit_number), 0) + 1
    into v_visit_number
  from public.service_order_situation_visits
  where service_order_id = p_service_order_id
    and situation_id is not distinct from p_situation_id;

  insert into public.service_order_situation_visits (
    service_order_id,
    situation_id,
    service_type_id_snapshot,
    visit_number,
    situation_name_snapshot,
    situation_color_snapshot,
    entered_at,
    sla_hours_snapshot,
    sla_due_at,
    entered_by
  ) values (
    p_service_order_id,
    p_situation_id,
    p_service_type_id,
    v_visit_number,
    v_name,
    v_color,
    coalesce(p_entered_at, clock_timestamp()),
    v_sla_hours,
    case
      when v_sla_hours is not null and v_sla_hours > 0
        then coalesce(p_entered_at, clock_timestamp()) + (v_sla_hours * interval '1 hour')
      else null
    end,
    p_user_id
  );
end;
$$;

create or replace function private.track_service_order_situation_visit()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_changed_at timestamptz := clock_timestamp();
  v_user_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.situation_id is not null then
      perform private.open_service_order_situation_visit(
        new.id,
        new.situation_id,
        new.service_type_id,
        coalesce(new.situation_started_at, new.created_at, v_changed_at),
        v_user_id
      );

      if new.completed_at is not null then
        update public.service_order_situation_visits
        set exited_at = greatest(new.completed_at, entered_at),
            exited_by = v_user_id,
            updated_at = v_changed_at
        where service_order_id = new.id
          and exited_at is null;
      end if;
    end if;
    return new;
  end if;

  if new.situation_id is distinct from old.situation_id then
    update public.service_order_situation_visits
    set exited_at = greatest(v_changed_at, entered_at),
        exited_by = v_user_id,
        updated_at = v_changed_at
    where service_order_id = new.id
      and exited_at is null;

    if new.situation_id is not null then
      perform private.open_service_order_situation_visit(
        new.id,
        new.situation_id,
        new.service_type_id,
        coalesce(new.situation_started_at, v_changed_at),
        v_user_id
      );
    end if;
  elsif new.completed_at is distinct from old.completed_at and new.completed_at is not null then
    update public.service_order_situation_visits
    set exited_at = greatest(new.completed_at, entered_at),
        exited_by = v_user_id,
        updated_at = v_changed_at
    where service_order_id = new.id
      and exited_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_service_order_situation_visit on public.service_orders;
create trigger trg_track_service_order_situation_visit
after insert or update of situation_id, completed_at on public.service_orders
for each row execute function private.track_service_order_situation_visit();

-- Backfill da permanência atualmente conhecida. Não é possível reconstruir
-- trocas históricas anteriores a esta migration sem registros já existentes.
insert into public.service_order_situation_visits (
  service_order_id,
  situation_id,
  service_type_id_snapshot,
  visit_number,
  situation_name_snapshot,
  situation_color_snapshot,
  entered_at,
  exited_at,
  sla_hours_snapshot,
  sla_due_at,
  created_at,
  updated_at
)
select
  so.id,
  so.situation_id,
  so.service_type_id,
  1,
  coalesce(os.name, 'Situação removida'),
  os.color,
  so.situation_started_at,
  case
    when so.completed_at is not null then greatest(so.completed_at, so.situation_started_at)
    else null
  end,
  sla.hours,
  case
    when sla.hours is not null and sla.hours > 0
      then so.situation_started_at + (sla.hours * interval '1 hour')
    else null
  end,
  now(),
  now()
from public.service_orders so
left join public.os_situations os on os.id = so.situation_id
left join lateral (
  select private.service_order_effective_sla_hours(so.service_type_id, so.situation_id) as hours
) sla on true
where so.situation_id is not null
  and not exists (
    select 1
    from public.service_order_situation_visits existing
    where existing.service_order_id = so.id
  );

commit;
