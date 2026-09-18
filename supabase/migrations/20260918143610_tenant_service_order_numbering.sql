create table if not exists private.service_order_number_counters (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  last_number bigint not null check (last_number >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.service_order_number_counters from public, anon, authenticated;

insert into private.service_order_number_counters as counter (
  organization_id,
  last_number,
  updated_at
)
select
  so.organization_id,
  coalesce(
    max(
      case
        when so.os_number ~ '^[0-9]+$' then so.os_number::bigint
        else null
      end
    ),
    0
  ) as last_number,
  now()
from public.service_orders so
group by so.organization_id
on conflict (organization_id) do update
set
  last_number = greatest(counter.last_number, excluded.last_number),
  updated_at = excluded.updated_at;

create or replace function public.assign_service_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_next_number bigint;
  v_candidate bigint;
begin
  if new.organization_id is null then
    raise exception 'A empresa da OS deve ser informada antes da geração do número.'
      using errcode = '23502';
  end if;

  select greatest(
    coalesce(
      max(
        case
          when so.os_number ~ '^[0-9]+$' then so.os_number::bigint
          else null
        end
      ),
      0
    ) + 1,
    1
  )
  into v_candidate
  from public.service_orders so
  where so.organization_id = new.organization_id;

  insert into private.service_order_number_counters as counter (
    organization_id,
    last_number,
    updated_at
  )
  values (
    new.organization_id,
    v_candidate,
    now()
  )
  on conflict (organization_id) do update
  set
    last_number = greatest(counter.last_number + 1, excluded.last_number),
    updated_at = excluded.updated_at
  returning last_number into v_next_number;

  new.os_number := v_next_number::text;
  return new;
end;
$function$;

revoke all on function public.assign_service_order_number() from public, anon, authenticated;
grant execute on function public.assign_service_order_number() to service_role;

drop sequence if exists public.service_orders_number_seq;
