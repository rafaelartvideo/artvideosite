-- Desired SIP trunk configuration. Existing pbx_trunks/FVX registry is untouched.
-- Vault 0.3.1 must already be installed; never put credentials in public payloads.
begin;
create table public.pbx_sip_trunk_configs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 agent_id uuid not null references public.pbx_agents(id) on delete restrict,
 name text not null check(char_length(name) between 2 and 80),
 provider text not null check(char_length(provider) between 1 and 80),
 host text not null, port integer not null check(port between 1 and 65535),
 transport text not null, username text not null, realm text not null,
 enabled boolean not null default false,
 inbound_enabled boolean not null default false check(not inbound_enabled),
 allowed_extension_ids uuid[] not null default array[]::uuid[],
 revision bigint not null default 1 check(revision>0),
 status text not null default 'pending' check(status in ('pending','applied','failed')),
 last_error text check(last_error is null or last_error='Nao foi possivel aplicar o tronco.'),
 secret_id uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,name)
);
create unique index pbx_sip_one_enabled_org on public.pbx_sip_trunk_configs(organization_id) where enabled;
create index pbx_sip_trunk_agent_idx on public.pbx_sip_trunk_configs(agent_id);
create index pbx_sip_trunk_extensions_idx on public.pbx_sip_trunk_configs using gin(allowed_extension_ids);
alter table public.pbx_sip_trunk_configs enable row level security;
revoke all on public.pbx_sip_trunk_configs from public,anon,authenticated,service_role;
-- Column grants intentionally exclude even the Vault identifier.
grant select(id,organization_id,agent_id,name,provider,host,port,transport,username,realm,
 enabled,inbound_enabled,allowed_extension_ids,revision,status,last_error,created_at,updated_at)
 on public.pbx_sip_trunk_configs to authenticated;
create policy pbx_sip_own_read on public.pbx_sip_trunk_configs for select to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.manage'));

create table private.pbx_sip_agent_capabilities (
 agent_id uuid primary key references public.pbx_agents(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 poll_sequence bigint not null, seen_at timestamptz not null,
 sip_trunks_v1 boolean not null default false
);
alter table private.pbx_sip_agent_capabilities enable row level security;
revoke all on private.pbx_sip_agent_capabilities from public,anon,authenticated,service_role;

create function private.pbx_sip_host_safe(p_value text) returns boolean
 language sql immutable security invoker set search_path='' as $$
 select p_value is not null and char_length(p_value) between 1 and 253
 and p_value ~ '^[A-Za-z0-9.-]+$'
 and not exists(select 1 from unnest(string_to_array(p_value,'.')) s(label)
  where label !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$');
$$;
revoke all on function private.pbx_sip_host_safe(text) from public,anon,authenticated;

create function private.pbx_sip_validate() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,786251));
  if not exists(select 1 from public.pbx_sip_trunk_configs t where t.id=new.id)
   and (select count(*) from public.pbx_sip_trunk_configs t where t.organization_id=new.organization_id)>=100 then
   raise exception 'Limite de 100 troncos por empresa atingido.' using errcode='23514'; end if;
 end if;
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.agent_id<>old.agent_id) then
  raise exception 'Identidade do tronco imutavel.' using errcode='23514';
 end if;
 if not private.pbx_sip_host_safe(new.host) or (new.realm<>'*' and not private.pbx_sip_host_safe(new.realm))
  or new.transport !~ '^[A-Za-z0-9_-]{1,128}$'
  or new.username !~ '^[A-Za-z0-9_.+-]{1,128}$'
  or new.name ~ '[[:cntrl:]]' or new.provider ~ '[[:cntrl:]]' then
  raise exception 'Configuracao de tronco invalida.' using errcode='23514';
 end if;
 if not exists(select 1 from public.pbx_agents a where a.id=new.agent_id and a.organization_id=new.organization_id) then
  raise exception 'Agente indisponivel.' using errcode='23514';
 end if;
 -- Disabling must remain possible after an agent or referenced extension becomes unavailable.
 if new.enabled then
  if private.is_platform_organization(new.organization_id) then
   raise exception 'Ativacao de troncos indisponivel nesta central.' using errcode='23514'; end if;
  if not exists(select 1 from public.pbx_agents a where a.id=new.agent_id and a.enabled)
   or cardinality(new.allowed_extension_ids)=0
   or exists(select 1 from unnest(new.allowed_extension_ids) i(id) where not exists(
    select 1 from public.pbx_extensions e where e.id=i.id and e.organization_id=new.organization_id
    and e.desired_enabled and ((e.is_managed and e.provisioning_status='applied'
      and e.endpoint_name ~ '^uw-[a-f0-9]{32}$')
     or (private.is_platform_organization(new.organization_id) and not e.is_managed
      and e.provisioning_status='manual' and e.number=301 and e.endpoint_name='union-301')))) then
   raise exception 'Selecao de ramais indisponivel.' using errcode='23514';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.pbx_sip_validate() from public,anon,authenticated;
create trigger pbx_sip_validate before insert or update on public.pbx_sip_trunk_configs
 for each row execute function private.pbx_sip_validate();

create function private.pbx_sip_protect_extension() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='DELETE' or new.organization_id is distinct from old.organization_id
  or new.number is distinct from old.number or new.endpoint_name is distinct from old.endpoint_name
  or (old.desired_enabled and not new.desired_enabled))
 and exists(select 1 from public.pbx_sip_trunk_configs t where t.enabled and old.id=any(t.allowed_extension_ids)) then
  raise exception 'Desative o tronco antes de alterar o ramal.' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.pbx_sip_protect_extension() from public,anon,authenticated;
create trigger pbx_sip_protect_extension before update or delete on public.pbx_extensions
 for each row execute function private.pbx_sip_protect_extension();

create function private.pbx_sip_protect_agent() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if new.organization_id is distinct from old.organization_id
  and exists(select 1 from public.pbx_sip_trunk_configs t where t.agent_id=old.id) then
  raise exception 'Identidade do agente imutavel.' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function private.pbx_sip_protect_agent() from public,anon,authenticated;
create trigger pbx_sip_protect_agent before update on public.pbx_agents
 for each row execute function private.pbx_sip_protect_agent();
create function private.pbx_list_sip_trunks(p_organization_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then
  raise exception 'Sem permissao para consultar troncos.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t)-'secret_id' order by t.name,t.id)
  from public.pbx_sip_trunk_configs t where t.organization_id=p_organization_id),'[]'::jsonb);
end;
$$;
revoke all on function private.pbx_list_sip_trunks(uuid) from public,anon,authenticated;
grant execute on function private.pbx_list_sip_trunks(uuid) to authenticated;
create function public.pbx_list_sip_trunks(p_organization_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$select private.pbx_list_sip_trunks(p_organization_id);$$;
revoke all on function public.pbx_list_sip_trunks(uuid) from public,anon,authenticated;
grant execute on function public.pbx_list_sip_trunks(uuid) to authenticated;

create function private.pbx_save_sip_trunk(p_organization_id uuid,p_trunk_id uuid,p_name text,p_provider text,
 p_host text,p_port integer,p_transport text,p_username text,p_realm text,p_enabled boolean,
 p_allowed_extension_ids uuid[],p_password text default null,p_inbound_enabled boolean default false)
 returns uuid language plpgsql security definer set search_path='' as $$
declare t public.pbx_sip_trunk_configs%rowtype; a uuid; sid uuid; tid uuid; ids uuid[];
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then
  raise exception 'Sem permissao para salvar troncos.' using errcode='42501'; end if;
 -- Serialize saves and extension mutations through row locks; one default trunk per org.
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,786251));
 if p_inbound_enabled is distinct from false or p_enabled is null then
  raise exception 'Entrada de chamadas indisponivel.' using errcode='23514'; end if;
 if p_enabled and private.is_platform_organization(p_organization_id) then
  raise exception 'Ativacao de troncos indisponivel nesta central.' using errcode='23514'; end if;
 if p_password is not null and (char_length(p_password) not between 8 and 256
  or p_password !~ '^[A-Za-z0-9_!@%+.,:/?&*(){}~-]+$') then
  raise exception 'Credencial invalida.' using errcode='23514'; end if;
 if p_trunk_id is not null then
  select * into t from public.pbx_sip_trunk_configs where id=p_trunk_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Tronco indisponivel.' using errcode='42501'; end if;
  a=t.agent_id; tid=t.id; sid=t.secret_id;
 else
  select id into a from public.pbx_agents where organization_id=p_organization_id and enabled;
  if a is null or p_password is null then raise exception 'Agente ou credencial indisponivel.' using errcode='23514'; end if;
  if (select count(*) from public.pbx_sip_trunk_configs where organization_id=p_organization_id)>=100 then
   raise exception 'Limite de 100 troncos por empresa atingido.' using errcode='23514'; end if;
  tid=gen_random_uuid();
 end if;
 if p_allowed_extension_ids is null or cardinality(p_allowed_extension_ids)>200
  or array_position(p_allowed_extension_ids,null) is not null then
  raise exception 'Selecao de ramais invalida.' using errcode='23514'; end if;
 select coalesce(array_agg(id order by id),array[]::uuid[]) into ids from (select distinct unnest(p_allowed_extension_ids) id) s;
 if cardinality(ids)<>cardinality(p_allowed_extension_ids) then
  raise exception 'Selecao de ramais invalida.' using errcode='23514'; end if;
 -- Always reject foreign references, including disabled drafts; stale own references can be disabled.
 if not (p_trunk_id is not null and not p_enabled) then
  perform 1 from public.pbx_extensions e where e.id=any(ids) order by e.id for update;
  if cardinality(ids)=0 or exists(select 1 from unnest(ids) i(id) where not exists(
   select 1 from public.pbx_extensions e where e.id=i.id and e.organization_id=p_organization_id
    and e.desired_enabled and ((e.is_managed and e.provisioning_status='applied'
      and e.endpoint_name ~ '^uw-[a-f0-9]{32}$')
     or (private.is_platform_organization(p_organization_id) and not e.is_managed
      and e.provisioning_status='manual' and e.number=301 and e.endpoint_name='union-301')))) then
   raise exception 'Selecao de ramais indisponivel.' using errcode='23514'; end if;
 else
  if ids is distinct from t.allowed_extension_ids then
   raise exception 'Desative mantendo a selecao atual.' using errcode='23514'; end if;
 end if;
 if p_password is not null then
  begin
   if sid is null then sid=vault.create_secret(p_password,'pbx-sip-'||tid::text,'PBX SIP credential');
   else perform vault.update_secret(sid,p_password); end if;
  exception when others then raise exception 'Nao foi possivel salvar a credencial.' using errcode='23514'; end;
 end if;
 insert into public.pbx_sip_trunk_configs(id,organization_id,agent_id,name,provider,host,port,transport,username,realm,
  enabled,inbound_enabled,allowed_extension_ids,secret_id)
 values(tid,p_organization_id,a,btrim(p_name),btrim(p_provider),p_host,p_port,p_transport,p_username,p_realm,p_enabled,false,ids,sid)
 on conflict(id) do update set name=excluded.name,provider=excluded.provider,host=excluded.host,port=excluded.port,
  transport=excluded.transport,username=excluded.username,realm=excluded.realm,enabled=excluded.enabled,
  allowed_extension_ids=excluded.allowed_extension_ids,revision=pbx_sip_trunk_configs.revision+1,status='pending',last_error=null,updated_at=now();
 return tid;
exception when unique_violation then
 raise exception 'Nome ou tronco ativo ja utilizado.' using errcode='23505';
end;
$$;
revoke all on function private.pbx_save_sip_trunk(uuid,uuid,text,text,text,integer,text,text,text,boolean,uuid[],text,boolean) from public,anon,authenticated;
grant execute on function private.pbx_save_sip_trunk(uuid,uuid,text,text,text,integer,text,text,text,boolean,uuid[],text,boolean) to authenticated;
create function public.pbx_save_sip_trunk(p_organization_id uuid,p_trunk_id uuid,p_name text,p_provider text,
 p_host text,p_port integer,p_transport text,p_username text,p_realm text,p_enabled boolean,
 p_allowed_extension_ids uuid[],p_password text default null,p_inbound_enabled boolean default false)
 returns uuid language sql security invoker set search_path='' as $$
 select private.pbx_save_sip_trunk(p_organization_id,p_trunk_id,p_name,p_provider,p_host,p_port,p_transport,p_username,
 p_realm,p_enabled,p_allowed_extension_ids,p_password,p_inbound_enabled);$$;
revoke all on function public.pbx_save_sip_trunk(uuid,uuid,text,text,text,integer,text,text,text,boolean,uuid[],text,boolean) from public,anon,authenticated;
grant execute on function public.pbx_save_sip_trunk(uuid,uuid,text,text,text,integer,text,text,text,boolean,uuid[],text,boolean) to authenticated;

create function private.pbx_retry_sip_trunk(p_organization_id uuid,p_trunk_id uuid) returns bigint
 language plpgsql security definer set search_path='' as $$
declare r bigint;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then
  raise exception 'Sem permissao para repetir tronco.' using errcode='42501'; end if;
 update public.pbx_sip_trunk_configs set revision=revision+1,status='pending',last_error=null,updated_at=now()
 where id=p_trunk_id and organization_id=p_organization_id returning revision into r;
 if r is null then raise exception 'Tronco indisponivel.' using errcode='42501'; end if;
 return r;
end;
$$;
revoke all on function private.pbx_retry_sip_trunk(uuid,uuid) from public,anon,authenticated;
grant execute on function private.pbx_retry_sip_trunk(uuid,uuid) to authenticated;
create function public.pbx_retry_sip_trunk(p_organization_id uuid,p_trunk_id uuid) returns bigint
 language sql security invoker set search_path='' as $$select private.pbx_retry_sip_trunk(p_organization_id,p_trunk_id);$$;
revoke all on function public.pbx_retry_sip_trunk(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_retry_sip_trunk(uuid,uuid) to authenticated;

-- Future runtime opt-in. The Edge calls this only after its signed poll admission;
-- reports cannot refresh the capability lease. Protocol 1/2/3 alone never enables SIP jobs.
create function private.pbx_admit_sip_trunk_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean
 language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; allowed boolean;
begin
 select * into a from public.pbx_agents where id=p_agent_id for update;
 if not found or not private.pbx_agent_runtime_ready(p_agent_id)
  or private.is_platform_organization(a.organization_id) or a.protocol_version<>3
  or a.profile_id is distinct from a.organization_id
  or a.profile_context is distinct from 'uwi-'||replace(a.organization_id::text,'-','') or p_sequence is null or p_sequence<=0 or a.last_sequence<>p_sequence
  or a.capability_seen_at<now()-interval '5 seconds' then return false; end if;
 if exists(select 1 from private.pbx_sip_agent_capabilities c where c.agent_id=p_agent_id and c.poll_sequence>=p_sequence) then return false; end if;
 allowed=coalesce(jsonb_typeof(p_features)='array' and p_features ? 'sip_trunks_v1',false);
 insert into private.pbx_sip_agent_capabilities(agent_id,organization_id,poll_sequence,seen_at,sip_trunks_v1)
 values(a.id,a.organization_id,p_sequence,now(),allowed)
 on conflict(agent_id) do update set organization_id=excluded.organization_id,poll_sequence=excluded.poll_sequence,
 seen_at=excluded.seen_at,sip_trunks_v1=excluded.sip_trunks_v1;
 return allowed;
end;
$$;
revoke all on function private.pbx_admit_sip_trunk_poll(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.pbx_admit_sip_trunk_poll(uuid,bigint,jsonb) to service_role;
create function public.pbx_admit_sip_trunk_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean
 language sql security invoker set search_path='' as $$select private.pbx_admit_sip_trunk_poll(p_agent_id,p_sequence,p_features);$$;
revoke all on function public.pbx_admit_sip_trunk_poll(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.pbx_admit_sip_trunk_poll(uuid,bigint,jsonb) to service_role;

create function private.pbx_sip_agent_ready(p_agent_id uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select private.pbx_agent_runtime_ready(p_agent_id) and exists(
  select 1 from private.pbx_sip_agent_capabilities c join public.pbx_agents a on a.id=c.agent_id
  where c.agent_id=p_agent_id and c.organization_id=a.organization_id and c.sip_trunks_v1
   and not private.is_platform_organization(a.organization_id) and a.protocol_version=3
   and a.profile_id=a.organization_id and a.profile_context='uwi-'||replace(a.organization_id::text,'-','')
   and c.seen_at>now()-interval '95 seconds' and c.seen_at<=now()+interval '5 seconds');$$;
revoke all on function private.pbx_sip_agent_ready(uuid) from public,anon,authenticated;

-- Employee capability only; does not disclose trunk identities or credentials.
create function private.pbx_can_dial_external(p_organization_id uuid,p_endpoint_name text) returns boolean
 language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or p_endpoint_name is null
  or private.is_platform_organization(p_organization_id)
  or not private.pbx_has_permission(p_organization_id,'pbx.view') then return false; end if;
 return exists(
  select 1 from private.pbx_my_assigned_extension(p_organization_id) mine
  join public.pbx_extensions e on e.organization_id=p_organization_id
   and e.endpoint_name=mine.endpoint_name and e.number=mine.number
  join public.pbx_sip_trunk_configs t on t.organization_id=e.organization_id and e.id=any(t.allowed_extension_ids)
  where mine.endpoint_name=p_endpoint_name and e.is_managed and e.desired_enabled and e.provisioning_status='applied'
   and t.enabled and t.status='applied' and private.pbx_sip_agent_ready(t.agent_id));
end;
$$;
revoke all on function private.pbx_can_dial_external(uuid,text) from public,anon,authenticated;
grant execute on function private.pbx_can_dial_external(uuid,text) to authenticated;
create function public.pbx_can_dial_external(p_organization_id uuid,p_endpoint_name text) returns boolean
 language sql stable security invoker set search_path='' as $$
 select private.pbx_can_dial_external(p_organization_id,p_endpoint_name);$$;
revoke all on function public.pbx_can_dial_external(uuid,text) from public,anon,authenticated;
grant execute on function public.pbx_can_dial_external(uuid,text) to authenticated;
create function private.pbx_poll_sip_trunks(p_agent_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 if not private.pbx_sip_agent_ready(p_agent_id) then return '[]'::jsonb; end if;
 if (select count(*) from public.pbx_sip_trunk_configs where agent_id=p_agent_id)>100 then
  raise exception 'Quantidade de troncos indisponivel.' using errcode='23514'; end if;
 -- Whole organization snapshot includes disabled rows, so runtime can remove stale files.
 -- Credentials exist only in this service-only response, never browser reads or errors.
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'organization_id',t.organization_id,
  'revision',t.revision,'status',t.status,'enabled',t.enabled,'host',t.host,'port',t.port,'transport',t.transport,
  'username',t.username,'realm',t.realm,'password',s.decrypted_secret,
  'allowed_extension_ids',t.allowed_extension_ids,'inbound_enabled',false) order by t.id)
  from public.pbx_sip_trunk_configs t join public.pbx_agents a on a.id=t.agent_id and a.organization_id=t.organization_id
  left join vault.decrypted_secrets s on s.id=t.secret_id
  where t.agent_id=p_agent_id),'[]'::jsonb);
end;
$$;
revoke all on function private.pbx_poll_sip_trunks(uuid) from public,anon,authenticated;
grant execute on function private.pbx_poll_sip_trunks(uuid) to service_role;
create function public.pbx_poll_sip_trunks(p_agent_id uuid) returns jsonb
 language sql security invoker set search_path='' as $$select private.pbx_poll_sip_trunks(p_agent_id);$$;
revoke all on function public.pbx_poll_sip_trunks(uuid) from public,anon,authenticated;
grant execute on function public.pbx_poll_sip_trunks(uuid) to service_role;

create function private.pbx_report_sip_trunks(p_agent_id uuid,p_results jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare item jsonb; n integer; total integer=0;
begin
 if not private.pbx_sip_agent_ready(p_agent_id) then
  raise exception 'Agente indisponivel.' using errcode='42501'; end if;
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) not between 1 and 100 then
  raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(p_results) loop
  if jsonb_typeof(item) is distinct from 'object' or item->>'status' is null
   or item->>'status' not in ('applied','failed') or coalesce(item->>'id','') !~ '^[0-9a-f-]{36}$'
   or coalesce(item->>'revision','') !~ '^[1-9][0-9]{0,17}$' then
   raise exception 'Confirmacao invalida.' using errcode='23514'; end if;
  update public.pbx_sip_trunk_configs t set status=item->>'status',
   last_error=case when item->>'status'='failed' then 'Nao foi possivel aplicar o tronco.' else null end
  where t.id=(item->>'id')::uuid and t.agent_id=p_agent_id and t.revision=(item->>'revision')::bigint and t.status='pending'
   and exists(select 1 from public.pbx_agents a where a.id=p_agent_id and a.organization_id=t.organization_id);
  get diagnostics n=row_count; total=total+n;
 end loop;
 return jsonb_build_object('acknowledged',total);
exception when invalid_text_representation then
 raise exception 'Confirmacao invalida.' using errcode='23514';
end;
$$;
revoke all on function private.pbx_report_sip_trunks(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.pbx_report_sip_trunks(uuid,jsonb) to service_role;
create function public.pbx_report_sip_trunks(p_agent_id uuid,p_results jsonb) returns jsonb
 language sql security invoker set search_path='' as $$select private.pbx_report_sip_trunks(p_agent_id,p_results);$$;
revoke all on function public.pbx_report_sip_trunks(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pbx_report_sip_trunks(uuid,jsonb) to service_role;
comment on table public.pbx_sip_trunk_configs is 'Desired-only SIP configuration. Never overrides manual FVX registry. Inbound is fail-closed. Secrets only in Vault; explicit future signed-poll capability required for delivery.';
-- Preserve signed admission and report-only lease semantics for the new report type.
create or replace function private.pbx_admit_agent_request(p_agent_id uuid,p_sequence bigint,p_action text,
 p_protocol_version integer,p_profile_id text,p_profile_context text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; platform boolean; valid boolean;
begin
 select * into a from public.pbx_agents where id=p_agent_id for update;
 if not found or not a.enabled or p_sequence is null or p_sequence<=0 or a.last_sequence is distinct from p_sequence then
  return jsonb_build_object('allowed',false);
 end if;
 platform=private.is_platform_organization(a.organization_id);
 if p_action='poll' then
  valid=private.pbx_org_enabled(a.organization_id) and (
   (platform and p_protocol_version=2 and p_profile_id is null and p_profile_context is null)
   or (not platform and p_protocol_version=3 and p_profile_id=a.organization_id::text
    and p_profile_context='uwi-'||replace(a.organization_id::text,'-','')));
  update public.pbx_agents set
   protocol_version=case when p_protocol_version in (1,2,3) then p_protocol_version else 1 end,
   profile_id=case when coalesce(valid,false) and not platform then a.organization_id else null end,
   profile_context=case when coalesce(valid,false) and not platform then p_profile_context else null end,
   capability_seen_at=case when coalesce(valid,false) then now() else null end
  where id=a.id;
  return jsonb_build_object('allowed',coalesce(valid,false),'is_platform',platform);
 end if;
 if (p_protocol_version is not null and p_protocol_version<>a.protocol_version)
  or (p_profile_id is not null and p_profile_id is distinct from a.profile_id::text)
  or (p_profile_context is not null and p_profile_context is distinct from a.profile_context) then
  return jsonb_build_object('allowed',false,'is_platform',platform);
 end if;
 return jsonb_build_object('allowed',p_action in ('report','report_login','report_queue','report_calls','report_availability','report_sip_trunks')
  and private.pbx_agent_runtime_ready(a.id),'is_platform',platform);
end;
$$;

commit;
