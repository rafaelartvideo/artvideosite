-- Queue the assignment of newly created extensions until their native endpoint exists.
create table if not exists private.pbx_pending_outbound_assignments(
 organization_id uuid not null references public.organizations(id) on delete cascade,
 extension_id uuid primary key references public.pbx_extensions(id) on delete cascade,
 group_id uuid not null,
 actor_id uuid,
 created_at timestamptz not null default now()
);
alter table private.pbx_pending_outbound_assignments enable row level security;
revoke all on private.pbx_pending_outbound_assignments from public,anon,authenticated,service_role;

create or replace function private.pbx_prepare_new_extension_group(p_org uuid,p_extension uuid,p_group uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_org,'pbx.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if not exists(select 1 from public.pbx_extensions e where e.id=p_extension and e.organization_id=p_org and e.desired_enabled and e.is_managed and e.provisioning_status='pending') then raise exception 'Ramal indisponivel' using errcode='23514';end if;
 if p_group is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,786251));
 if not exists(select 1 from private.pbx_universal_configs c cross join jsonb_array_elements(c.document->'groups') g where c.organization_id=p_org and g->>'id'=p_group::text and g->'enabled'='true') then raise exception 'Grupo indisponivel' using errcode='23514';end if;
 insert into private.pbx_pending_outbound_assignments(organization_id,extension_id,group_id,actor_id) values(p_org,p_extension,p_group,auth.uid())
 on conflict(extension_id) do update set group_id=excluded.group_id,actor_id=excluded.actor_id;
end;$$;

create or replace function public.pbx_create_extension_with_group(p_org uuid,p_number integer,p_name text,p_employee uuid,p_group uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare eid uuid;
begin
 insert into public.pbx_extensions(organization_id,number,display_name,employee_id) values(p_org,p_number,p_name,p_employee) returning id into eid;
 perform private.pbx_prepare_new_extension_group(p_org,eid,p_group);
 return eid;
end;$$;

create or replace function private.pbx_apply_pending_outbound_assignments(p_agent uuid) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid;c private.pbx_universal_configs%rowtype;d jsonb;new_groups jsonb;a record;actor uuid;
begin
 select organization_id into org from public.pbx_agents where id=p_agent and enabled;
 if org is null or not private.pbx_hot_groups_ready(org) then return;end if;
 if not exists(select 1 from private.pbx_pending_outbound_assignments p join public.pbx_extensions e on e.id=p.extension_id where p.organization_id=org and e.organization_id=org and e.provisioning_status='applied' and e.desired_enabled) then return;end if;
 if not pg_try_advisory_xact_lock(hashtextextended(org::text,786251)) then return;end if;
 select * into c from private.pbx_universal_configs where organization_id=org and agent_id=p_agent for update;
 if not found or c.status<>'applied' or c.revision is distinct from c.applied_revision then return;end if;
 d:=c.document;
 for a in select p.* from private.pbx_pending_outbound_assignments p join public.pbx_extensions e on e.id=p.extension_id
 where p.organization_id=org and e.organization_id=org and e.provisioning_status='applied' and e.desired_enabled order by p.created_at for update of p loop
  if not exists(select 1 from jsonb_array_elements(d->'groups') g where g->>'id'=a.group_id::text and g->'enabled'='true') then continue;end if;
  select coalesce(jsonb_agg(case when g->>'id'=a.group_id::text and not (g->'extension_ids' ? a.extension_id::text) then jsonb_set(g,'{extension_ids}',(g->'extension_ids')||jsonb_build_array(a.extension_id::text)) else g end order by n),'[]'::jsonb)
    into new_groups from jsonb_array_elements(d->'groups') with ordinality x(g,n);
  d:=jsonb_set(d,'{groups}',new_groups);
  delete from private.pbx_pending_outbound_assignments where extension_id=a.extension_id;
  actor:=a.actor_id;
 end loop;
 if d=c.document then return;end if;
 perform private.pbx_validate_universal(org,d);
 update private.pbx_universal_configs set document=d,revision=revision+1,status='pending',last_error=null,updated_at=now() where organization_id=org returning revision into c.revision;
 insert into private.pbx_universal_audit(organization_id,revision,actor_id,action) values(org,c.revision,actor,'save');
end;$$;

do $migration$
declare body text:=pg_get_functiondef('private.pbx_poll_universal_telephony(uuid,bigint,text)'::regprocedure);
begin
 if strpos(body,'select * into cap from private.pbx_universal_capabilities')=0 then raise exception 'Unexpected poll function';end if;
 execute replace(body,'select * into cap from private.pbx_universal_capabilities','perform private.pbx_apply_pending_outbound_assignments(p_agent_id);
 select * into cap from private.pbx_universal_capabilities');
end
$migration$;

-- Keep the pending selection visible to administrators; do not expose secrets.
do $migration$
declare body text:=pg_get_functiondef('private.pbx_outbound_group_settings(uuid)'::regprocedure);
begin
 if strpos(body,$old$'default_group_id',default_id,'groups'$old$)=0 then raise exception 'Unexpected group settings function';end if;
 execute replace(body,$old$'default_group_id',default_id,'groups'$old$,$new$'default_group_id',default_id,'pending_assignments',(select coalesce(jsonb_agg(jsonb_build_object('extension_id',extension_id,'group_id',group_id)),'[]') from private.pbx_pending_outbound_assignments where organization_id=p_org),'groups'$new$);
end
$migration$;

revoke all on function private.pbx_prepare_new_extension_group(uuid,uuid,uuid),public.pbx_create_extension_with_group(uuid,integer,text,uuid,uuid),private.pbx_apply_pending_outbound_assignments(uuid) from public,anon,authenticated,service_role;
grant execute on function private.pbx_prepare_new_extension_group(uuid,uuid,uuid),public.pbx_create_extension_with_group(uuid,integer,text,uuid,uuid) to authenticated;
