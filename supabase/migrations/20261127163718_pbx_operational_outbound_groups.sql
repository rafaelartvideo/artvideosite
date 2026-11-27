-- Hot group changes are admitted only by a versioned agent capability.
alter table private.pbx_universal_capabilities add column if not exists hot_groups boolean not null default false;
create table if not exists private.pbx_outbound_defaults(
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 group_id uuid not null
);
alter table private.pbx_outbound_defaults enable row level security;
revoke all on private.pbx_outbound_defaults from public,anon,authenticated,service_role;

do $migration$
declare body text:=pg_get_functiondef('private.pbx_admit_universal_telephony_poll(uuid,bigint,jsonb)'::regprocedure);
begin
 if strpos(body,'return allow;')=0 then raise exception 'Unexpected agent capability function';end if;
 execute replace(body,'return allow;', $new$update private.pbx_universal_capabilities set hot_groups=allow and p_features ? 'universal_hot_groups_v1' where agent_id=a.id;
 return allow;$new$);
end
$migration$;

create or replace function private.pbx_hot_groups_ready(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.pbx_universal_configs c join private.pbx_universal_capabilities a on a.agent_id=c.agent_id
 where c.organization_id=p_org and a.organization_id=p_org and a.hot_groups and private.pbx_universal_ready(a.agent_id));
$$;
create or replace function private.pbx_group_operational_shape(groups jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg((g-'extension_ids'-'strategy'-'members')||jsonb_build_object('members',
   (select coalesce(jsonb_agg(m-'priority' order by m->>'connection_id'),'[]'::jsonb) from jsonb_array_elements(g->'members') m))
   order by g->>'id'),'[]'::jsonb) from jsonb_array_elements(groups) g;
$$;
create or replace function private.pbx_outbound_group_settings(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.pbx_universal_configs%rowtype; default_id uuid;
begin
 if not private.pbx_has_permission(p_org,'pbx.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 select * into c from private.pbx_universal_configs where organization_id=p_org;
 select group_id into default_id from private.pbx_outbound_defaults where organization_id=p_org;
 if not exists(select 1 from jsonb_array_elements(coalesce(c.document->'groups','[]')) g where g->>'id'=default_id::text and g->'enabled'='true') then default_id:=null;end if;
 return jsonb_build_object('revision',coalesce(c.revision,0),'status',coalesce(c.status,'pending'),'active',coalesce(c.document->'routing_enabled','false'),'hot_ready',private.pbx_hot_groups_ready(p_org),
 'default_group_id',default_id,'groups',coalesce(c.document->'groups','[]'));
end;$$;
create or replace function private.pbx_set_default_outbound_group(p_org uuid,p_group uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_org,'pbx.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,786251));
 if p_group is null then delete from private.pbx_outbound_defaults where organization_id=p_org;return;end if;
 if not exists(select 1 from private.pbx_universal_configs c cross join jsonb_array_elements(c.document->'groups') g where c.organization_id=p_org and g->>'id'=p_group::text and g->'enabled'='true') then raise exception 'Grupo indisponivel' using errcode='23514';end if;
 insert into private.pbx_outbound_defaults values(p_org,p_group) on conflict(organization_id) do update set group_id=excluded.group_id;
end;$$;
create or replace function private.pbx_save_operational_groups(p_org uuid,p_revision bigint,p_groups jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare c private.pbx_universal_configs%rowtype; d jsonb;
begin
 if not private.pbx_has_permission(p_org,'pbx.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,786251));
 select * into c from private.pbx_universal_configs where organization_id=p_org for update;
 if not found or c.revision<>p_revision then raise exception 'Configuration changed; refresh before saving' using errcode='40001';end if;
 if jsonb_typeof(p_groups) is distinct from 'array' or private.pbx_group_operational_shape(p_groups) is distinct from private.pbx_group_operational_shape(c.document->'groups') then raise exception 'Only operational group fields may change' using errcode='23514';end if;
 if c.document->'routing_enabled'='true' and not private.pbx_hot_groups_ready(p_org) then raise exception 'Update PBX agent before changing active groups' using errcode='23514';end if;
 if c.status<>'applied' or c.applied_revision is distinct from c.revision then raise exception 'Await current revision before changing groups' using errcode='40001';end if;
 d:=jsonb_set(c.document,'{groups}',p_groups);
 perform private.pbx_validate_universal(p_org,d);
 if d=c.document then return c.revision;end if;
 update private.pbx_universal_configs set document=d,revision=revision+1,status='pending',last_error=null,updated_at=now() where organization_id=p_org returning revision into c.revision;
 insert into private.pbx_universal_audit(organization_id,revision,actor_id,action) values(p_org,c.revision,auth.uid(),'save');
 return c.revision;
end;$$;

-- Empty authorization lists are valid: no extension may originate via that group.
do $migration$
declare body text:=pg_get_functiondef('private.pbx_universal_capacity_ready(jsonb)'::regprocedure);
begin
 if strpos(body,$old$ or jsonb_array_length(g->'extension_ids')=0$old$)=0 then raise exception 'Unexpected capacity validator';end if;
 execute replace(body,$old$ or jsonb_array_length(g->'extension_ids')=0$old$,'');
end
$migration$;

create or replace function public.pbx_outbound_group_settings(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.pbx_outbound_group_settings(p_org);$$;
create or replace function public.pbx_set_default_outbound_group(p_org uuid,p_group uuid) returns void language sql security invoker set search_path='' as $$select private.pbx_set_default_outbound_group(p_org,p_group);$$;
create or replace function public.pbx_save_operational_groups(p_org uuid,p_revision bigint,p_groups jsonb) returns bigint language sql security invoker set search_path='' as $$select private.pbx_save_operational_groups(p_org,p_revision,p_groups);$$;
revoke all on function private.pbx_hot_groups_ready(uuid),private.pbx_group_operational_shape(jsonb),private.pbx_outbound_group_settings(uuid),private.pbx_set_default_outbound_group(uuid,uuid),private.pbx_save_operational_groups(uuid,bigint,jsonb),public.pbx_outbound_group_settings(uuid),public.pbx_set_default_outbound_group(uuid,uuid),public.pbx_save_operational_groups(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.pbx_outbound_group_settings(uuid),private.pbx_set_default_outbound_group(uuid,uuid),private.pbx_save_operational_groups(uuid,bigint,jsonb),public.pbx_outbound_group_settings(uuid),public.pbx_set_default_outbound_group(uuid,uuid),public.pbx_save_operational_groups(uuid,bigint,jsonb) to authenticated;
