begin;
-- Separate operational state; historical public.pbx_trunks never changes.
create table private.pbx_legacy_trunk_controls (
 id uuid primary key references public.pbx_trunks(id) on delete restrict,
 organization_id uuid not null references public.organizations(id),
 agent_id uuid not null references public.pbx_agents(id),
 host text, username text, port integer not null default 5060 check(port between 1 and 65535),
 enabled boolean not null default true, revision bigint not null default 1 check(revision>0),
 status text not null default 'pending' check(status in ('pending','applied','failed')),
 last_error text check(last_error is null or last_error='Nao foi possivel aplicar o tronco.'),
 observed_enabled boolean, registration_state text not null default 'unknown' check(registration_state in ('registered','unregistered','unknown')),
 checked_at timestamptz,
 check((host is null)=(username is null)),
 check(host is null or private.pbx_sip_host_safe(host)),
 check(username is null or username ~ '^[A-Za-z0-9_.+-]{1,128}$')
);
insert into private.pbx_legacy_trunk_controls(id,organization_id,agent_id)
select t.id,t.organization_id,t.agent_id from public.pbx_trunks t
join public.pbx_agents a on a.id=t.agent_id and a.organization_id=t.organization_id
where private.is_platform_organization(t.organization_id)
 and t.inbound_endpoint='union-fvx-in' and t.outbound_endpoint='union-fvx-out-test';
create table private.pbx_legacy_agent_capabilities (
 agent_id uuid primary key references public.pbx_agents(id), organization_id uuid not null,
 poll_sequence bigint not null, synced_sequence bigint, seen_at timestamptz not null,
 legacy_trunks_v1 boolean not null
);
create table private.pbx_sip_account_claims (
 host text not null, username text not null, source text not null check(source in ('managed','legacy')),
 trunk_id uuid not null, primary key(host,username), unique(source,trunk_id),
 check(host=lower(host))
);
alter table private.pbx_legacy_trunk_controls enable row level security;
alter table private.pbx_legacy_agent_capabilities enable row level security;
alter table private.pbx_sip_account_claims enable row level security;
revoke all on private.pbx_legacy_trunk_controls,private.pbx_legacy_agent_capabilities,private.pbx_sip_account_claims from public,anon,authenticated,service_role;
-- One global lock covers both known account claims and the unknown legacy barrier.
create function private.pbx_claim_sip_account(p_source text,p_id uuid,p_host text,p_username text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(786252001);
 if exists(select 1 from private.pbx_sip_account_claims where host=lower(p_host) and username=p_username and (source<>p_source or trunk_id<>p_id)) then
  raise exception 'Conta SIP indisponivel para ativacao.' using errcode='23514'; end if;
 insert into private.pbx_sip_account_claims(host,username,source,trunk_id) values(lower(p_host),p_username,p_source,p_id)
 on conflict(host,username) do nothing;
end;$$;
create function private.pbx_managed_account_claim() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(786252001);
 if tg_op='DELETE' then
  if exists(select 1 from private.pbx_sip_account_claims where source='managed' and trunk_id=old.id) then
   raise exception 'Desative e aguarde confirmacao do tronco.' using errcode='23514'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and (lower(new.host) is distinct from lower(old.host) or new.username is distinct from old.username)
 and exists(select 1 from private.pbx_sip_account_claims where source='managed' and trunk_id=old.id) then
  raise exception 'Desative e aguarde confirmacao do tronco.' using errcode='23514'; end if;
 if new.enabled then
  if exists(select 1 from private.pbx_legacy_trunk_controls where host is null and (enabled or status<>'applied' or observed_enabled is distinct from false)) then
   raise exception 'Conta SIP indisponivel para ativacao.' using errcode='23514'; end if;
  perform private.pbx_claim_sip_account('managed',new.id,new.host,new.username);
 elsif new.status='applied' then
  delete from private.pbx_sip_account_claims where source='managed' and trunk_id=new.id;
 end if;
 return new;
end;$$;
-- Reserve existing enabled rows. New disabled drafts never claim an account.
do $$declare t record;begin
 for t in select * from public.pbx_sip_trunk_configs where enabled loop
  perform private.pbx_claim_sip_account('managed',t.id,t.host,t.username);
 end loop;
end;$$;
create trigger pbx_managed_account_claim before insert or update or delete on public.pbx_sip_trunk_configs
for each row execute function private.pbx_managed_account_claim();
create function private.pbx_legacy_agent_ready(p_agent_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
select private.pbx_agent_runtime_ready(p_agent_id) and exists(
 select 1 from private.pbx_legacy_agent_capabilities c join public.pbx_agents a on a.id=c.agent_id
 where c.agent_id=p_agent_id and c.organization_id=a.organization_id and c.legacy_trunks_v1
 and private.is_platform_organization(a.organization_id) and a.protocol_version=2
 and a.profile_id is null and a.profile_context is null
 and c.seen_at>now()-interval '95 seconds' and c.seen_at<=now()+interval '5 seconds');$$;
create function private.pbx_admit_legacy_trunk_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; allowed boolean;
begin
 select * into a from public.pbx_agents where id=p_agent_id for update;
 if not found or not private.pbx_agent_runtime_ready(a.id) or not private.is_platform_organization(a.organization_id)
 or a.protocol_version<>2 or a.profile_id is not null or a.profile_context is not null
 or p_sequence is null or p_sequence<=0 or a.last_sequence is distinct from p_sequence
 or a.capability_seen_at<now()-interval '5 seconds'
 or exists(select 1 from private.pbx_legacy_agent_capabilities where agent_id=a.id and poll_sequence>=p_sequence) then return false; end if;
 allowed=coalesce(jsonb_typeof(p_features)='array' and p_features ? 'legacy_trunks_v1',false);
 insert into private.pbx_legacy_agent_capabilities(agent_id,organization_id,poll_sequence,seen_at,legacy_trunks_v1)
 values(a.id,a.organization_id,p_sequence,now(),allowed)
 on conflict(agent_id) do update set organization_id=excluded.organization_id,poll_sequence=excluded.poll_sequence,seen_at=excluded.seen_at,legacy_trunks_v1=excluded.legacy_trunks_v1;
 return allowed;
end;$$;
create function private.pbx_list_legacy_trunks(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao para consultar troncos.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'organization_id',c.organization_id,'agent_id',c.agent_id,
 'name',t.name,'provider',t.provider,'management_source','vps','host',c.host,'username',c.username,'port',c.port,
 'enabled',c.enabled,'revision',c.revision,'status',c.status,'last_error',c.last_error,'observed_enabled',c.observed_enabled,
 'registration_state',c.registration_state,'checked_at',c.checked_at,'can_control',private.pbx_legacy_agent_ready(c.agent_id)) order by t.name,c.id)
 from private.pbx_legacy_trunk_controls c join public.pbx_trunks t on t.id=c.id
 where c.organization_id=p_organization_id),'[]'::jsonb);
end;$$;
create function private.pbx_set_legacy_trunk_enabled(p_organization_id uuid,p_trunk_id uuid,p_enabled boolean,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare c private.pbx_legacy_trunk_controls%rowtype;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Sem permissao para alterar troncos.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(786252001);
 select * into c from private.pbx_legacy_trunk_controls where id=p_trunk_id and organization_id=p_organization_id for update;
 if not found or not private.is_platform_organization(c.organization_id) or not private.pbx_legacy_agent_ready(c.agent_id) then
  raise exception 'Tronco indisponivel.' using errcode='42501'; end if;
 if p_enabled is null or p_expected_revision is distinct from c.revision then raise exception 'Estado do tronco alterado. Atualize a pagina.' using errcode='40001'; end if;
 if p_enabled then
  if c.host is null then raise exception 'Tronco indisponivel.' using errcode='23514'; end if;
  perform private.pbx_claim_sip_account('legacy',c.id,c.host,c.username);
 end if;
 update private.pbx_legacy_trunk_controls set enabled=p_enabled,revision=revision+1,status='pending',last_error=null where id=c.id returning revision into c.revision;
 return c.revision;
end;$$;
create function private.pbx_sync_legacy_trunks(p_agent_id uuid,p_sequence bigint,p_reports jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; c private.pbx_legacy_trunk_controls%rowtype; item jsonb; h text; u text; port_value integer; actual boolean;
begin
 select * into a from public.pbx_agents where id=p_agent_id for update;
 if not found or not private.pbx_legacy_agent_ready(a.id) or a.last_sequence is distinct from p_sequence
 or not exists(select 1 from private.pbx_legacy_agent_capabilities where agent_id=a.id and poll_sequence=p_sequence and synced_sequence is distinct from p_sequence) then
  raise exception 'Agente indisponivel.' using errcode='42501'; end if;
 if jsonb_typeof(p_reports) is distinct from 'array' or jsonb_array_length(p_reports)>100 then raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(786252001);
 update private.pbx_legacy_agent_capabilities set synced_sequence=p_sequence where agent_id=a.id;
 for item in select value from jsonb_array_elements(p_reports) loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ '^[0-9a-f-]{36}$'
  or coalesce(item->>'revision','') !~ '^[1-9][0-9]{0,17}$' or coalesce(item->>'status','') not in ('applied','failed')
  or jsonb_typeof(item->'enabled') is distinct from 'boolean'
  or coalesce(item->>'registration_state','') not in ('registered','unregistered','unknown') then raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
  select * into c from private.pbx_legacy_trunk_controls where id=(item->>'id')::uuid and agent_id=a.id and organization_id=a.organization_id for update;
  if not found or c.revision<>(item->>'revision')::bigint then continue; end if;
  actual=(item->>'enabled')::boolean;
  if item->>'status'='applied' and (actual<>c.enabled or (not actual and item->>'registration_state'<>'unregistered')) then
   raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
  h=item->>'host'; u=item->>'username';
  if not private.pbx_sip_host_safe(h) or coalesce(u,'') !~ '^[A-Za-z0-9_.+-]{1,128}$'
   or coalesce(item->>'port','') !~ '^[0-9]{1,5}$' then raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
  port_value=(item->>'port')::integer;
  if port_value not between 1 and 65535 or (c.host is not null and (lower(h)<>lower(c.host) or u<>c.username or port_value<>c.port)) then
   raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
  if c.enabled or actual or item->>'status'<>'applied' then perform private.pbx_claim_sip_account('legacy',c.id,h,u);
  else delete from private.pbx_sip_account_claims where source='legacy' and trunk_id=c.id; end if;
  update private.pbx_legacy_trunk_controls set host=coalesce(host,lower(h)),username=coalesce(username,u),port=port_value,
   status=item->>'status',observed_enabled=actual,registration_state=item->>'registration_state',checked_at=now(),
   last_error=case when item->>'status'='failed' then 'Nao foi possivel aplicar o tronco.' else null end where id=c.id;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'revision',revision,'enabled',enabled) order by id)
 from private.pbx_legacy_trunk_controls where agent_id=a.id and organization_id=a.organization_id and status='pending'),'[]'::jsonb);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Confirmacao invalida.' using errcode='23514';
end;$$;
create function public.pbx_admit_legacy_trunk_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean
language sql security invoker set search_path='' as $$select private.pbx_admit_legacy_trunk_poll(p_agent_id,p_sequence,p_features);$$;
create function public.pbx_list_legacy_trunks(p_organization_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.pbx_list_legacy_trunks(p_organization_id);$$;
create function public.pbx_set_legacy_trunk_enabled(p_organization_id uuid,p_trunk_id uuid,p_enabled boolean,p_expected_revision bigint) returns bigint
language sql security invoker set search_path='' as $$select private.pbx_set_legacy_trunk_enabled(p_organization_id,p_trunk_id,p_enabled,p_expected_revision);$$;
create function public.pbx_sync_legacy_trunks(p_agent_id uuid,p_sequence bigint,p_reports jsonb default '[]'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.pbx_sync_legacy_trunks(p_agent_id,p_sequence,p_reports);$$;
revoke all on function private.pbx_list_legacy_trunks(uuid),private.pbx_set_legacy_trunk_enabled(uuid,uuid,boolean,bigint),private.pbx_admit_legacy_trunk_poll(uuid,bigint,jsonb),private.pbx_sync_legacy_trunks(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.pbx_list_legacy_trunks(uuid),private.pbx_set_legacy_trunk_enabled(uuid,uuid,boolean,bigint) to authenticated;
grant execute on function private.pbx_admit_legacy_trunk_poll(uuid,bigint,jsonb),private.pbx_sync_legacy_trunks(uuid,bigint,jsonb) to service_role;
revoke all on function private.pbx_claim_sip_account(text,uuid,text,text),private.pbx_managed_account_claim(),private.pbx_legacy_agent_ready(uuid) from public,anon,authenticated,service_role;
revoke all on function public.pbx_list_legacy_trunks(uuid),public.pbx_set_legacy_trunk_enabled(uuid,uuid,boolean,bigint),public.pbx_admit_legacy_trunk_poll(uuid,bigint,jsonb),public.pbx_sync_legacy_trunks(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pbx_list_legacy_trunks(uuid),public.pbx_set_legacy_trunk_enabled(uuid,uuid,boolean,bigint) to authenticated;
grant execute on function public.pbx_admit_legacy_trunk_poll(uuid,bigint,jsonb),public.pbx_sync_legacy_trunks(uuid,bigint,jsonb) to service_role;
commit;
