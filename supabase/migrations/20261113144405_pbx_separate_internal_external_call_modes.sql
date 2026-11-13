begin;
alter table private.pbx_extension_call_modes
 add column internal_mode text not null default 'both' check(internal_mode in ('both','receive_only','make_only')),
 add column external_mode text not null default 'both' check(external_mode in ('both','receive_only','make_only')),
 add column applied_internal_mode text not null default 'both' check(applied_internal_mode in ('both','receive_only','make_only')),
 add column applied_external_mode text not null default 'both' check(applied_external_mode in ('both','receive_only','make_only'));
update private.pbx_extension_call_modes set internal_mode=mode,external_mode=mode,applied_internal_mode=applied_mode,applied_external_mode=applied_mode;
alter table private.pbx_call_mode_capabilities add column scopes_enabled boolean not null default false;
update private.pbx_call_mode_generations set revision=revision+1;
create function private.pbx_call_modes_v2_ready(p_agent_id uuid) returns boolean language sql stable security definer set search_path='' as $$select private.pbx_call_modes_ready(p_agent_id) and exists(select 1 from private.pbx_call_mode_capabilities where agent_id=p_agent_id and scopes_enabled);$$;
create or replace function private.pbx_admit_call_modes_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; allowed boolean;begin
select * into a from public.pbx_agents where id=p_agent_id for update;
if not found or not private.pbx_agent_runtime_ready(a.id) or p_sequence is null or p_sequence<=0 or a.last_sequence is distinct from p_sequence or a.capability_seen_at<now()-interval '5 seconds' or exists(select 1 from private.pbx_call_mode_capabilities where agent_id=a.id and poll_sequence>=p_sequence) then return false;end if;
allowed=coalesce(jsonb_typeof(p_features)='array' and p_features ? 'call_modes_v1',false);
insert into private.pbx_call_mode_capabilities(agent_id,organization_id,poll_sequence,seen_at,enabled) values(a.id,a.organization_id,p_sequence,now(),allowed) on conflict(agent_id) do update set organization_id=excluded.organization_id,poll_sequence=excluded.poll_sequence,seen_at=excluded.seen_at,enabled=excluded.enabled,scopes_enabled=false;
return allowed;end;$$;
create function private.pbx_admit_call_modes_poll_v2(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean language plpgsql security definer set search_path='' as $$declare admitted boolean;begin
if jsonb_typeof(p_features) is distinct from 'array' or not p_features ? 'call_modes_v2' then return false;end if;
admitted=private.pbx_admit_call_modes_poll(p_agent_id,p_sequence,'["call_modes_v1"]'::jsonb);
if admitted then update private.pbx_call_mode_capabilities set scopes_enabled=true where agent_id=p_agent_id;end if;
return admitted;end;$$;
create function private.pbx_list_extension_call_modes_v2(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
if not (private.pbx_has_permission(p_organization_id,'pbx.view') or private.pbx_has_permission(p_organization_id,'pbx.manage')) then raise exception 'Sem permissao.' using errcode='42501';end if;
return coalesce((select jsonb_agg(jsonb_build_object('extension_id',e.id,'organization_id',e.organization_id,'endpoint_name',e.endpoint_name,'internal_mode',coalesce(m.internal_mode,'both'),'external_mode',coalesce(m.external_mode,'both'),'applied_internal_mode',coalesce(m.applied_internal_mode,'both'),'applied_external_mode',coalesce(m.applied_external_mode,'both'),'mode',coalesce(m.mode,'both'),'applied_mode',coalesce(m.applied_mode,'both'),'revision',coalesce(g.revision,1),'status',coalesce(m.status,'applied'),'last_error',m.last_error,'can_manage',private.pbx_has_permission(p_organization_id,'pbx.manage') and e.desired_enabled and private.pbx_call_mode_eligible(e) and exists(select 1 from public.pbx_agents a where a.organization_id=e.organization_id and private.pbx_call_modes_v2_ready(a.id))) order by e.number,e.id) from public.pbx_extensions e left join private.pbx_extension_call_modes m on m.extension_id=e.id and m.organization_id=e.organization_id left join private.pbx_call_mode_generations g on g.organization_id=e.organization_id where e.organization_id=p_organization_id),'[]'::jsonb);end;$$;
create function private.pbx_set_extension_call_modes_v2(p_organization_id uuid,p_extension_id uuid,p_internal_mode text,p_external_mode text,p_expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare e public.pbx_extensions%rowtype; r bigint;begin
if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao.' using errcode='42501';end if;
if p_internal_mode is null or p_external_mode is null or p_internal_mode not in ('both','receive_only','make_only') or p_external_mode not in ('both','receive_only','make_only') then raise exception 'Modo invalido.' using errcode='23514';end if;
insert into private.pbx_call_mode_generations(organization_id) values(p_organization_id) on conflict do nothing;
select revision into r from private.pbx_call_mode_generations where organization_id=p_organization_id for update;
select * into e from public.pbx_extensions where id=p_extension_id and organization_id=p_organization_id for share;
if not found or not e.desired_enabled or not private.pbx_call_mode_eligible(e) or not exists(select 1 from public.pbx_agents a where a.organization_id=e.organization_id and private.pbx_call_modes_v2_ready(a.id)) then raise exception 'Ramal indisponivel.' using errcode='42501';end if;
if p_expected_revision is distinct from r then raise exception 'Estado alterado. Atualize a pagina.' using errcode='40001';end if;
if coalesce((select internal_mode from private.pbx_extension_call_modes where extension_id=e.id),'both')=p_internal_mode and coalesce((select external_mode from private.pbx_extension_call_modes where extension_id=e.id),'both')=p_external_mode and not exists(select 1 from private.pbx_extension_call_modes where extension_id=e.id and status='failed') then return r;end if;
update private.pbx_call_mode_generations set revision=revision+1 where organization_id=e.organization_id returning revision into r;
insert into private.pbx_extension_call_modes(extension_id,organization_id,mode,internal_mode,external_mode) values(e.id,e.organization_id,p_internal_mode,p_internal_mode,p_external_mode) on conflict(extension_id) do update set mode=excluded.mode,internal_mode=excluded.internal_mode,external_mode=excluded.external_mode,status='pending',last_error=null;
return r;end;$$;
create function private.pbx_my_call_mode_v2(p_organization_id uuid,p_endpoint_name text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.pbx_extensions%rowtype; m private.pbx_extension_call_modes%rowtype;actual text;begin
select * into e from public.pbx_extensions where organization_id=p_organization_id and endpoint_name=p_endpoint_name;
if not found or not ((private.pbx_has_permission(p_organization_id,'pbx.view') and exists(select 1 from private.pbx_my_assigned_extension(p_organization_id) mine where mine.endpoint_name=e.endpoint_name and mine.number=e.number)) or (private.pbx_has_permission(p_organization_id,'pbx.manage') and private.pbx_call_mode_eligible(e))) then raise exception 'Ramal indisponivel.' using errcode='42501';end if;
select * into m from private.pbx_extension_call_modes where extension_id=e.id and organization_id=e.organization_id;
actual=coalesce(m.applied_mode,'both');return jsonb_build_object('internal_mode',coalesce(m.applied_internal_mode,'both'),'external_mode',coalesce(m.applied_external_mode,'both'),'desired_internal_mode',coalesce(m.internal_mode,'both'),'desired_external_mode',coalesce(m.external_mode,'both'),'mode',actual,'desired_mode',coalesce(m.mode,'both'),'status',coalesce(m.status,'applied'),'can_make_calls',actual<>'receive_only','can_receive_calls',actual<>'make_only');end;$$;
create function private.pbx_poll_call_modes_v2(p_agent_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;r bigint;payload jsonb;begin
select organization_id into org from public.pbx_agents where id=p_agent_id and private.pbx_call_modes_v2_ready(id);
if not found then raise exception 'Agente indisponivel.' using errcode='42501';end if;
insert into private.pbx_call_mode_generations(organization_id) values(org) on conflict do nothing;
select revision into r from private.pbx_call_mode_generations where organization_id=org for share;
if (select count(*) from public.pbx_extensions e where e.organization_id=org and private.pbx_call_mode_catalog_eligible(e))>1000 then raise exception 'Quantidade indisponivel.' using errcode='23514';end if;
select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'endpoint_name',e.endpoint_name,'number',e.number,'internal_mode',coalesce(m.internal_mode,'both'),'external_mode',coalesce(m.external_mode,'both'),'mode',coalesce(m.mode,'both'),'enabled',e.desired_enabled,'is_managed',e.is_managed) order by e.number,e.id),'[]'::jsonb) into payload from public.pbx_extensions e left join private.pbx_extension_call_modes m on m.extension_id=e.id and m.organization_id=e.organization_id where e.organization_id=org and private.pbx_call_mode_catalog_eligible(e);
return jsonb_build_object('organization_id',org,'revision',r,'extensions',payload);end;$$;
create function private.pbx_report_call_modes_v2(p_agent_id uuid,p_revision bigint,p_status text) returns boolean language plpgsql security definer set search_path='' as $$
declare org uuid;r bigint;begin
select organization_id into org from public.pbx_agents where id=p_agent_id and private.pbx_call_modes_v2_ready(id);
if not found then return false;end if;
if p_status is null or p_status not in ('applied','failed') then raise exception 'Confirmacao invalida.' using errcode='23514';end if;
select revision into r from private.pbx_call_mode_generations where organization_id=org for update;
if not found or p_revision is distinct from r then return false;end if;
update private.pbx_extension_call_modes set applied_internal_mode=case when p_status='applied' then internal_mode else applied_internal_mode end,applied_external_mode=case when p_status='applied' then external_mode else applied_external_mode end,applied_mode=case when p_status='applied' then mode else applied_mode end,status=p_status,last_error=case when p_status='failed' then 'Nao foi possivel aplicar o modo de chamada.' else null end where organization_id=org;
return true;end;$$;
create function public.pbx_list_extension_call_modes_v2(p_organization_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.pbx_list_extension_call_modes_v2(p_organization_id);$$;
revoke all on function public.pbx_list_extension_call_modes_v2(uuid),private.pbx_list_extension_call_modes_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pbx_list_extension_call_modes_v2(uuid),private.pbx_list_extension_call_modes_v2(uuid) to authenticated;
create function public.pbx_set_extension_call_modes_v2(p_organization_id uuid,p_extension_id uuid,p_internal_mode text,p_external_mode text,p_expected_revision bigint) returns bigint language sql security invoker set search_path='' as $$select private.pbx_set_extension_call_modes_v2(p_organization_id,p_extension_id,p_internal_mode,p_external_mode,p_expected_revision);$$;
revoke all on function public.pbx_set_extension_call_modes_v2(uuid,uuid,text,text,bigint),private.pbx_set_extension_call_modes_v2(uuid,uuid,text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.pbx_set_extension_call_modes_v2(uuid,uuid,text,text,bigint),private.pbx_set_extension_call_modes_v2(uuid,uuid,text,text,bigint) to authenticated;
create function public.pbx_my_call_mode_v2(p_organization_id uuid,p_endpoint_name text) returns jsonb language sql security invoker set search_path='' as $$select private.pbx_my_call_mode_v2(p_organization_id,p_endpoint_name);$$;
revoke all on function public.pbx_my_call_mode_v2(uuid,text),private.pbx_my_call_mode_v2(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pbx_my_call_mode_v2(uuid,text),private.pbx_my_call_mode_v2(uuid,text) to authenticated;
create function public.pbx_admit_call_modes_poll_v2(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean language sql security invoker set search_path='' as $$select private.pbx_admit_call_modes_poll_v2(p_agent_id,p_sequence,p_features);$$;
revoke all on function public.pbx_admit_call_modes_poll_v2(uuid,bigint,jsonb),private.pbx_admit_call_modes_poll_v2(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pbx_admit_call_modes_poll_v2(uuid,bigint,jsonb),private.pbx_admit_call_modes_poll_v2(uuid,bigint,jsonb) to service_role;
create function public.pbx_poll_call_modes_v2(p_agent_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.pbx_poll_call_modes_v2(p_agent_id);$$;
revoke all on function public.pbx_poll_call_modes_v2(uuid),private.pbx_poll_call_modes_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pbx_poll_call_modes_v2(uuid),private.pbx_poll_call_modes_v2(uuid) to service_role;
create function public.pbx_report_call_modes_v2(p_agent_id uuid,p_revision bigint,p_status text) returns boolean language sql security invoker set search_path='' as $$select private.pbx_report_call_modes_v2(p_agent_id,p_revision,p_status);$$;
revoke all on function public.pbx_report_call_modes_v2(uuid,bigint,text),private.pbx_report_call_modes_v2(uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.pbx_report_call_modes_v2(uuid,bigint,text),private.pbx_report_call_modes_v2(uuid,bigint,text) to service_role;
revoke all on function private.pbx_call_modes_v2_ready(uuid) from public,anon,authenticated,service_role;
create or replace function private.pbx_set_extension_call_mode(p_organization_id uuid,p_extension_id uuid,p_mode text,p_expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$begin raise exception 'Atualize o CRM para configurar chamadas internas e externas.' using errcode='55000'; end;$$;
create or replace function private.pbx_poll_call_modes(p_agent_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'Atualize o agente para permissoes separadas.' using errcode='55000'; end;$$;
create or replace function private.pbx_report_call_modes(p_agent_id uuid,p_revision bigint,p_status text) returns boolean language plpgsql security definer set search_path='' as $$begin return false; end;$$;
commit;
