-- Inert until an authenticated protocol-2 agent is installed. No default pauses.
alter table public.pbx_agents add column protocol_version integer not null default 1
 check(protocol_version in (1,2));

create table public.pbx_queue_member_controls (
 queue_id uuid not null references public.pbx_queues(id) on delete cascade,
 extension_id uuid not null references public.pbx_extensions(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 agent_id uuid not null references public.pbx_agents(id) on delete restrict,
 desired_paused boolean not null,
 revision uuid not null default gen_random_uuid(),
 status text not null default 'pending' check(status in ('pending','applied','failed')),
 requested_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 last_checked_at timestamptz,
 last_error text,
 primary key(queue_id,extension_id)
);
create index pbx_queue_controls_agent_check_idx on public.pbx_queue_member_controls(agent_id,last_checked_at nulls first,updated_at);
create index pbx_queue_controls_org_idx on public.pbx_queue_member_controls(organization_id);
create index pbx_queue_controls_extension_idx on public.pbx_queue_member_controls(extension_id);
create index pbx_queue_controls_actor_idx on public.pbx_queue_member_controls(requested_by) where requested_by is not null;
alter table public.pbx_queue_member_controls enable row level security;
revoke all on public.pbx_queue_member_controls from public,anon,authenticated;
grant select on public.pbx_queue_member_controls to authenticated;
grant select,insert,update on public.pbx_queue_member_controls to service_role;
create policy pbx_queue_controls_read on public.pbx_queue_member_controls for select to authenticated using (
 (select auth.uid()) is not null and private.is_platform_organization(organization_id)
 and private.has_organization_permission(organization_id,'pbx.manage')
 and exists(select 1 from public.pbx_queues q where q.id=queue_id and q.organization_id=pbx_queue_member_controls.organization_id)
 and exists(select 1 from public.pbx_extensions e where e.id=extension_id and e.organization_id=pbx_queue_member_controls.organization_id)
);

create function private.pbx_queue_controls_ready(p_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and private.is_platform_organization(p_organization_id)
 and private.has_organization_permission(p_organization_id,'pbx.manage')
 and exists(select 1 from public.pbx_agents a where a.organization_id=p_organization_id
   and a.enabled and a.protocol_version=2 and a.last_seen_at>now()-interval '95 seconds');
$$;
revoke all on function private.pbx_queue_controls_ready(uuid) from public,anon,authenticated;
grant execute on function private.pbx_queue_controls_ready(uuid) to authenticated;
create function public.pbx_queue_controls_ready(p_organization_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select private.pbx_queue_controls_ready(p_organization_id);
$$;
revoke all on function public.pbx_queue_controls_ready(uuid) from public,anon,authenticated;
grant execute on function public.pbx_queue_controls_ready(uuid) to authenticated;

create function private.pbx_set_queue_member_paused(p_organization_id uuid,p_queue_id uuid,p_extension_id uuid,p_paused boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; r uuid;
begin
 if not private.pbx_queue_controls_ready(p_organization_id) then
   raise exception 'Controle de pausa indisponivel para esta empresa. Atualize o acompanhamento da central.' using errcode='42501';
 end if;
 if p_paused is null or not exists(
   select 1 from public.pbx_queue_members m
   join public.pbx_queues q on q.id=m.queue_id
   join public.pbx_extensions e on e.id=m.extension_id
   where m.queue_id=p_queue_id and m.extension_id=p_extension_id
    and q.organization_id=p_organization_id and q.enabled and q.provisioning_status='applied'
    and e.organization_id=p_organization_id and e.desired_enabled and e.provisioning_status in ('applied','manual')
 ) then raise exception 'Ramal ou fila indisponivel para esta empresa.' using errcode='23514'; end if;
 select id into strict a from public.pbx_agents where organization_id=p_organization_id and enabled and protocol_version=2;
 insert into public.pbx_queue_member_controls(queue_id,extension_id,organization_id,agent_id,desired_paused,requested_by)
 values(p_queue_id,p_extension_id,p_organization_id,a,p_paused,(select auth.uid()))
 on conflict(queue_id,extension_id) do update set
  organization_id=excluded.organization_id,agent_id=excluded.agent_id,desired_paused=excluded.desired_paused,
  revision=gen_random_uuid(),status='pending',requested_by=excluded.requested_by,
  updated_at=now(),last_checked_at=null,last_error=null
 returning revision into r;
 return r;
end;
$$;
revoke all on function private.pbx_set_queue_member_paused(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.pbx_set_queue_member_paused(uuid,uuid,uuid,boolean) to authenticated;
create function public.pbx_set_queue_member_paused(p_organization_id uuid,p_queue_id uuid,p_extension_id uuid,p_paused boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.pbx_set_queue_member_paused(p_organization_id,p_queue_id,p_extension_id,p_paused);
$$;
revoke all on function public.pbx_set_queue_member_paused(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.pbx_set_queue_member_paused(uuid,uuid,uuid,boolean) to authenticated;

create function public.pbx_poll_queue_availability(p_agent_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(j)-'last_checked_at'-'updated_at'
   order by j.last_checked_at nulls first,j.updated_at,j.queue_id,j.extension_id),'[]'::jsonb)
 from (
  select c.queue_id,c.extension_id,c.organization_id,c.revision,c.desired_paused,e.endpoint_name,e.number,c.last_checked_at,c.updated_at
  from public.pbx_queue_member_controls c
  join public.pbx_agents a on a.id=c.agent_id and a.organization_id=c.organization_id
  join public.pbx_queues q on q.id=c.queue_id and q.organization_id=c.organization_id
  join public.pbx_extensions e on e.id=c.extension_id and e.organization_id=c.organization_id
  join public.pbx_queue_members m on m.queue_id=c.queue_id and m.extension_id=c.extension_id
  where a.id=p_agent_id and a.enabled and a.protocol_version=2
   and q.enabled and q.provisioning_status='applied' and e.desired_enabled and e.provisioning_status in ('applied','manual')
  order by c.last_checked_at nulls first,c.updated_at,c.queue_id,c.extension_id limit 10
 ) j;
$$;
revoke all on function public.pbx_poll_queue_availability(uuid) from public,anon,authenticated;
grant execute on function public.pbx_poll_queue_availability(uuid) to service_role;

create function public.pbx_report_queue_availability(p_agent_id uuid,p_results jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare org uuid; item jsonb; n integer; total integer=0;
begin
 select organization_id into org from public.pbx_agents where id=p_agent_id and enabled and protocol_version=2;
 if org is null then raise exception 'Agente nao autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'Lote invalido' using errcode='23514'; end if;
 if jsonb_array_length(p_results) not between 1 and 10 then raise exception 'Lote invalido' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(p_results) loop
  if jsonb_typeof(item) is distinct from 'object' or item->>'status' not in ('applied','failed')
   or item->>'status' is null or item->>'queue_id' is null or item->>'extension_id' is null or item->>'revision' is null then
   raise exception 'Confirmacao invalida' using errcode='23514';
  end if;
  update public.pbx_queue_member_controls c set
   status=item->>'status',last_checked_at=now(),
   last_error=case when item->>'status'='failed' then 'Nao foi possivel confirmar a disponibilidade do atendente.' else null end
  where c.agent_id=p_agent_id and c.organization_id=org
   and c.queue_id=(item->>'queue_id')::uuid and c.extension_id=(item->>'extension_id')::uuid
   and c.revision=(item->>'revision')::uuid;
  get diagnostics n=row_count; total=total+n;
 end loop;
 return jsonb_build_object('accepted',true,'acknowledged',total);
end;
$$;
revoke all on function public.pbx_report_queue_availability(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pbx_report_queue_availability(uuid,jsonb) to service_role;
comment on table public.pbx_queue_member_controls is 'Desired pause state; only a verified protocol-2 agent may confirm actual application. No default pause and no global pause command.';

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='pbx_queue_member_controls') then
  alter publication supabase_realtime add table public.pbx_queue_member_controls;
 end if;
end $$;
