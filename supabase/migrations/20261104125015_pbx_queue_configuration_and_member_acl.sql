-- Union PABX: queues configured by CRM, applied by signed outbound agent.
-- IMPORTANT: no changes to FVX trunk, inbound routing or existing ramals.
create table if not exists public.pbx_queues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  test_extension integer not null check (test_extension between 850 and 899),
  strategy text not null default 'ringall' check (strategy in ('ringall','rrmemory','linear')),
  ring_seconds integer not null default 20 check (ring_seconds between 10 and 40),
  max_wait_seconds integer not null default 120 check (max_wait_seconds between 30 and 300),
  enabled boolean not null default true,
  provisioning_status text not null default 'pending' check (provisioning_status in ('pending','applied','failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbx_queues_number_unique unique (organization_id,test_extension)
);
create index if not exists pbx_queues_org_updated_idx on public.pbx_queues (organization_id,updated_at desc);
create index if not exists pbx_queues_pending_idx on public.pbx_queues (organization_id,updated_at)
  where provisioning_status='pending';

create table if not exists public.pbx_queue_members (
  queue_id uuid not null references public.pbx_queues(id) on delete cascade,
  extension_id uuid not null references public.pbx_extensions(id) on delete restrict,
  position smallint not null check (position between 1 and 20),
  primary key (queue_id,extension_id),
  constraint pbx_queue_member_order unique (queue_id,position)
);
create index if not exists pbx_queue_members_extension_idx on public.pbx_queue_members(extension_id);

alter table public.pbx_queues enable row level security;
alter table public.pbx_queue_members enable row level security;
revoke all on public.pbx_queues from public,anon,authenticated;
revoke all on public.pbx_queue_members from public,anon,authenticated;
grant select on public.pbx_queues to authenticated;
grant select on public.pbx_queue_members to authenticated;
grant all on public.pbx_queues to service_role;
grant all on public.pbx_queue_members to service_role;

drop policy if exists pbx_queues_read on public.pbx_queues;
create policy pbx_queues_read on public.pbx_queues for select to authenticated using (
  (select auth.uid()) is not null
  and private.is_platform_organization(organization_id)
  and private.has_organization_permission(organization_id,'pbx.manage')
);
drop policy if exists pbx_queue_members_read on public.pbx_queue_members;
create policy pbx_queue_members_read on public.pbx_queue_members for select to authenticated using (
  exists(select 1 from public.pbx_queues q
    where q.id=queue_id
      and private.is_platform_organization(q.organization_id)
      and private.has_organization_permission(q.organization_id,'pbx.manage'))
);

create or replace function public.pbx_save_queue(
  p_organization_id uuid,
  p_queue_id uuid,
  p_name text,
  p_test_extension integer,
  p_strategy text,
  p_ring_seconds integer,
  p_max_wait_seconds integer,
  p_enabled boolean,
  p_extension_ids uuid[]
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid;
  v_len integer := coalesce(cardinality(p_extension_ids),0);
  v_valid integer;
begin
  if (select auth.uid()) is null
    or not private.is_platform_organization(p_organization_id)
    or not private.has_organization_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissão para gerenciar filas.' using errcode='42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80
    or p_test_extension is null or p_test_extension not between 850 and 899
    or p_strategy is null or p_strategy not in ('ringall','rrmemory','linear')
    or p_ring_seconds is null or p_ring_seconds not between 10 and 40
    or p_max_wait_seconds is null or p_max_wait_seconds not between 30 and 300
    or p_enabled is null or v_len>20 or (p_enabled and v_len=0) then
    raise exception 'Configuração da fila inválida.' using errcode='23514';
  end if;
  if exists(select 1 from public.pbx_extensions x
    where x.organization_id=p_organization_id and x.number=p_test_extension) then
    raise exception 'Número da fila já utilizado por um ramal.' using errcode='23505';
  end if;
  if v_len<>(
    select count(distinct x.extension_id)
    from unnest(coalesce(p_extension_ids,array[]::uuid[])) x(extension_id)
  ) then
    raise exception 'Ramais duplicados na fila.' using errcode='23514';
  end if;
  select count(*) into v_valid
    from public.pbx_extensions e
    where e.id=any(coalesce(p_extension_ids,array[]::uuid[]))
      and e.organization_id=p_organization_id
      and e.desired_enabled
      and e.provisioning_status in ('manual','applied');
  if v_valid<>v_len then
    raise exception 'A fila inclui ramal de outra empresa, desativado ou não provisionado.' using errcode='23514';
  end if;

  if p_queue_id is null then
    insert into public.pbx_queues
      (organization_id,name,test_extension,strategy,ring_seconds,max_wait_seconds,enabled)
    values
      (p_organization_id,btrim(p_name),p_test_extension,p_strategy,p_ring_seconds,p_max_wait_seconds,p_enabled)
    returning id into v_id;
  else
    update public.pbx_queues q
    set name=btrim(p_name),test_extension=p_test_extension,
      strategy=p_strategy,ring_seconds=p_ring_seconds,max_wait_seconds=p_max_wait_seconds,
      enabled=p_enabled,provisioning_status='pending',last_error=null,updated_at=now()
    where q.id=p_queue_id and q.organization_id=p_organization_id
    returning q.id into v_id;
    if v_id is null then
      raise exception 'Fila não encontrada nesta empresa.' using errcode='42501';
    end if;
    delete from public.pbx_queue_members where queue_id=v_id;
  end if;

  insert into public.pbx_queue_members(queue_id,extension_id,position)
    select v_id, e.extension_id, e.ord::smallint
    from unnest(coalesce(p_extension_ids,array[]::uuid[])) with ordinality e(extension_id,ord);
  return v_id;
end;
$$;
revoke all on function public.pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[]) to authenticated;

create or replace function public.pbx_retry_queue(
  p_organization_id uuid,p_queue_id uuid
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null
    or not private.is_platform_organization(p_organization_id)
    or not private.has_organization_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissão para repetir provisionamento.' using errcode='42501';
  end if;
  update public.pbx_queues q set provisioning_status='pending',last_error=null,updated_at=now()
  where q.id=p_queue_id and q.organization_id=p_organization_id
    and q.provisioning_status='failed'
  returning q.id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.pbx_retry_queue(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_retry_queue(uuid,uuid) to authenticated;

comment on table public.pbx_queues is 'Roteamento interno de teste. Tronco FVX não redirecionado automaticamente.';

