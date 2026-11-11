-- Metadata-only attribution for isolated managed outbound SIP trunks.
-- No credentials, registrations, routing or legacy FVX registry changes.
begin;
alter table public.pbx_call_logs add column managed_trunk_id uuid
 references public.pbx_sip_trunk_configs(id) on delete restrict;
create index pbx_call_logs_managed_trunk_idx on public.pbx_call_logs(managed_trunk_id) where managed_trunk_id is not null;
alter table public.pbx_call_logs add constraint pbx_call_logs_managed_outbound_only check(
 managed_trunk_id is null or (trunk_id is null and direction='outbound' and source_extension_id is not null and destination_extension_id is null));

create function private.pbx_sip_history_endpoints(p_agent_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_sip_agent_ready(p_agent_id) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg('uwt-'||replace(c.organization_id::text,'-','')||'-'||replace(c.id::text,'-','')||'-ep' order by c.id)
  from public.pbx_sip_trunk_configs c join public.pbx_agents a on a.id=c.agent_id and a.organization_id=c.organization_id
  where c.agent_id=p_agent_id),'[]'::jsonb);
end;
$$;
revoke all on function private.pbx_sip_history_endpoints(uuid) from public,anon,authenticated;
grant execute on function private.pbx_sip_history_endpoints(uuid) to service_role;
create function public.pbx_sip_history_endpoints(p_agent_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$select private.pbx_sip_history_endpoints(p_agent_id);$$;
revoke all on function public.pbx_sip_history_endpoints(uuid) from public,anon,authenticated;
grant execute on function public.pbx_sip_history_endpoints(uuid) to service_role;
create or replace function private.pbx_ingest_call_records(p_agent_id uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 org uuid;
 item jsonb;
 endpoint text;
 endpoints text[];
 ext_ids uuid[];
 trunk_ids uuid[]; managed_ids uuid[]; managed uuid; managed_org uuid;
 ext_id uuid;
 ext_org uuid;
 trunk uuid;
 trunk_org uuid;
 total integer=0;
 side integer;
 kind text;
 trunk_direction text;
begin
 select organization_id into org from public.pbx_agents where id=p_agent_id and enabled and private.pbx_agent_runtime_ready(id);
 if org is null then raise exception 'Agente nao autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_records) is distinct from 'array' then
   raise exception 'Lote invalido' using errcode='23514';
 end if;
 if jsonb_array_length(p_records) not between 1 and 10 then
   raise exception 'Lote invalido' using errcode='23514';
 end if;
 for item in select value from jsonb_array_elements(p_records) loop
   if jsonb_typeof(item) is distinct from 'object'
     or coalesce(item->>'event_id','') !~ '^[A-Za-z0-9_.-]{1,80}:[0-9]{1,10}$'
     or coalesce(item->>'linked_id','') !~ '^[A-Za-z0-9_.-]{1,80}$'
     or item->>'started_at' is null or item->>'ended_at' is null
     or item->>'source' is null or item->>'destination' is null
     or item->>'disposition' is null
     or coalesce(item->>'duration_seconds','') !~ '^[0-9]{1,6}$'
     or coalesce(item->>'billable_seconds','') !~ '^[0-9]{1,6}$' then
     raise exception 'Metadados invalidos' using errcode='23514';
   end if;
   endpoints=array[item->>'source_endpoint',item->>'destination_endpoint'];
   ext_ids=array[null::uuid,null::uuid]; trunk_ids=array[null::uuid,null::uuid]; managed_ids=array[null::uuid,null::uuid];
   kind='internal';
   for side in 1..2 loop
     endpoint=endpoints[side];
     if endpoint is null then continue; end if;
     if endpoint !~ '^[A-Za-z0-9_-]{1,80}$' then
       raise exception 'Endpoint invalido' using errcode='23514';
     end if;
     select id,organization_id into ext_id,ext_org from public.pbx_extensions where endpoint_name=endpoint;
     -- Cross-column collisions are also ambiguous, never select an arbitrary row.
     if (select count(*) from public.pbx_trunks where endpoint in (inbound_endpoint,outbound_endpoint))
      +(select count(*) from public.pbx_extensions where endpoint_name=endpoint)
      +(select count(*) from public.pbx_sip_trunk_configs c where endpoint='uwt-'||replace(c.organization_id::text,'-','')||'-'||replace(c.id::text,'-','')||'-ep') > 1 then
       raise exception 'Endpoint ambiguo' using errcode='23514';
     end if;
     select id,organization_id,case when endpoint=inbound_endpoint then 'inbound' else 'outbound' end
       into trunk,trunk_org,trunk_direction from public.pbx_trunks
       where endpoint in (inbound_endpoint,outbound_endpoint) and agent_id=p_agent_id;
     select c.id,c.organization_id into managed,managed_org from public.pbx_sip_trunk_configs c
      where endpoint='uwt-'||replace(c.organization_id::text,'-','')||'-'||replace(c.id::text,'-','')||'-ep'
       and c.agent_id=p_agent_id and c.organization_id=org;
     if (ext_id is null and trunk is null and managed is null) or (ext_id is not null and trunk is not null)
       or (ext_id is not null and ext_org<>org) or (trunk is not null and trunk_org<>org) or (managed is not null and managed_org<>org) then
       raise exception 'Endpoint nao pertence ao agente' using errcode='23514';
     end if;
     -- The readiness guard guarantees that only a partner has a non-null profile.
     if exists(select 1 from public.pbx_agents a where a.id=p_agent_id and a.profile_id is not null)
      and (trunk is not null or (managed is null and (endpoint !~ '^uw-[a-f0-9]{32}$'
       or not exists(select 1 from public.pbx_extensions e where e.id=ext_id and e.organization_id=org and e.is_managed)))) then
       raise exception 'Parceiro admite somente historico interno gerenciado' using errcode='23514';
     end if;
     if managed is not null and (side<>2 or not private.pbx_sip_agent_ready(p_agent_id)) then
      raise exception 'Perna de tronco gerenciado invalida' using errcode='23514'; end if;
     ext_ids[side]=ext_id; trunk_ids[side]=trunk; managed_ids[side]=managed;
     if managed is not null then kind='outbound'; end if;
     if trunk is not null then kind=trunk_direction; end if;
   end loop;
   if managed_ids[2] is not null and not exists(select 1 from public.pbx_extensions e
    where e.id=ext_ids[1] and e.organization_id=org and e.is_managed) then
    raise exception 'Origem de tronco gerenciado invalida' using errcode='23514'; end if;
   if coalesce(ext_ids[1],ext_ids[2],trunk_ids[1],trunk_ids[2],managed_ids[2]) is null
     or (trunk_ids[1] is not null and trunk_ids[2] is not null) then
     raise exception 'Pernas invalidas' using errcode='23514';
   end if;
   insert into public.pbx_call_logs(organization_id,agent_id,event_id,linked_id,
     started_at,answered_at,ended_at,source,destination,source_extension_id,destination_extension_id,
     trunk_id,managed_trunk_id,direction,disposition,duration_seconds,billable_seconds)
   values(org,p_agent_id,item->>'event_id',item->>'linked_id',
     (item->>'started_at')::timestamptz,(item->>'answered_at')::timestamptz,(item->>'ended_at')::timestamptz,
     item->>'source',item->>'destination',ext_ids[1],ext_ids[2],coalesce(trunk_ids[1],trunk_ids[2]),managed_ids[2],
     kind,item->>'disposition',(item->>'duration_seconds')::integer,(item->>'billable_seconds')::integer)
   on conflict (agent_id,event_id) do nothing;
   total=total+1;
 end loop;
 return jsonb_build_object('accepted',true,'acknowledged',total);
end;
$$;


revoke all on function private.pbx_ingest_call_records(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.pbx_ingest_call_records(uuid,jsonb) to service_role;
create or replace function public.pbx_ingest_call_records(p_agent_id uuid,p_records jsonb) returns jsonb
 language sql security invoker set search_path='' as $$select private.pbx_ingest_call_records(p_agent_id,p_records);$$;
revoke all on function public.pbx_ingest_call_records(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pbx_ingest_call_records(uuid,jsonb) to service_role;
comment on column public.pbx_call_logs.managed_trunk_id is 'Isolated managed outbound trunk attribution; legacy trunk_id is preserved separately. No credentials.';
commit;
