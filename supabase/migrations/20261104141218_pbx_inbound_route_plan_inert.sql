-- Inbound FVX routing plan, intentionally INERT until a separately authorized VPS change.
-- It is NOT an active routing table; Asterisk currently calls union-301 directly.
create table if not exists public.pbx_inbound_route_plans (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  destination_type text not null default 'direct_301'
    check (destination_type in ('direct_301','queue')),
  queue_id uuid references public.pbx_queues(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint pbx_inbound_plan_target_consistency check (
    (destination_type='direct_301' and queue_id is null) or
    (destination_type='queue' and queue_id is not null)
  )
);
alter table public.pbx_inbound_route_plans enable row level security;
revoke all on public.pbx_inbound_route_plans from public,anon,authenticated;
grant select on public.pbx_inbound_route_plans to authenticated;
grant all on public.pbx_inbound_route_plans to service_role;
drop policy if exists pbx_inbound_plans_manager_read on public.pbx_inbound_route_plans;
create policy pbx_inbound_plans_manager_read on public.pbx_inbound_route_plans for select to authenticated
using (
  (select auth.uid()) is not null
  and private.is_platform_organization(organization_id)
  and private.has_organization_permission(organization_id,'pbx.manage')
);

create or replace function public.pbx_save_inbound_route_plan(
  p_organization_id uuid,
  p_destination_type text,
  p_queue_id uuid default null
) returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null
    or not private.is_platform_organization(p_organization_id)
    or not private.has_organization_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissão para planejar o encaminhamento de entrada.' using errcode='42501';
  end if;
  if p_destination_type is null or p_destination_type not in ('direct_301','queue')
     or (p_destination_type='direct_301' and p_queue_id is not null)
     or (p_destination_type='queue' and p_queue_id is null) then
     raise exception 'Destino de entrada inválido.' using errcode='23514';
  end if;
  if p_destination_type='queue' and not exists (
      select 1 from public.pbx_queues q
      where q.id=p_queue_id
        and q.organization_id=p_organization_id
        and q.enabled=true
        and q.provisioning_status='applied'
  ) then
    raise exception 'Selecione uma fila ativa e já aplicada nesta empresa.' using errcode='23514';
  end if;

  insert into public.pbx_inbound_route_plans
    (organization_id,destination_type,queue_id,updated_by,updated_at)
  values (p_organization_id,p_destination_type,p_queue_id,(select auth.uid()),now())
  on conflict (organization_id) do update set
    destination_type=excluded.destination_type,
    queue_id=excluded.queue_id,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;
  return true;
end;
$$;
revoke all on function public.pbx_save_inbound_route_plan(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pbx_save_inbound_route_plan(uuid,text,uuid) to authenticated;
comment on table public.pbx_inbound_route_plans is
  'PLANEJAMENTO apenas. Não altera o dialplan, não redireciona a FVX, não liga filas externas. A troca exige ativação controlada e separada na VPS.';

