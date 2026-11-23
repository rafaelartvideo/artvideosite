-- Universal, opt-in telephony. No legacy route, registration or v1 gate is changed.
begin;
create table private.pbx_universal_configs (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 agent_id uuid not null references public.pbx_agents(id) on delete restrict,
 revision bigint not null check(revision>0), document jsonb not null,
 status text not null default 'pending' check(status in ('pending','applied','failed')),
 applied_revision bigint, applied_hash text, observed jsonb not null default '{}',
 observed_at timestamptz, last_error text check(last_error is null or last_error='Universal telephony application failed'),
 updated_at timestamptz not null default now()
);
-- Tombstones make IDs permanently tenant-owned, including deleted entities.
create table private.pbx_universal_entities (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in ('providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes')),
 unique(organization_id,kind,id)
);
create table private.pbx_universal_secrets (
 connection_id uuid primary key references private.pbx_universal_entities(id),
 organization_id uuid not null references public.organizations(id), secret_id uuid not null
);
create table private.pbx_universal_claims (
 host text not null, username text not null, connection_id uuid not null unique,
 organization_id uuid not null references public.organizations(id),
 primary key(host,username), check(host=lower(host) and username=lower(username))
);
create table private.pbx_universal_ingress_claims (
 connection_id uuid not null, organization_id uuid not null references public.organizations(id),
 network cidr not null, primary key(connection_id,network)
);
create table private.pbx_universal_capabilities (
 agent_id uuid primary key references public.pbx_agents(id), organization_id uuid not null,
 poll_sequence bigint not null, seen_at timestamptz not null, enabled boolean not null,
 delivered_sequence bigint, delivered_revision bigint, delivered_until timestamptz
);
create table private.pbx_universal_audit (
 id bigint generated always as identity primary key, organization_id uuid not null,
 revision bigint not null, actor_id uuid, action text not null check(action in ('save','applied','failed')),
 changed_at timestamptz not null default now()
);
do $$declare t text;begin
 foreach t in array array['configs','entities','secrets','claims','ingress_claims','capabilities','audit'] loop
  execute format('alter table private.pbx_universal_%I enable row level security',t);
  execute format('revoke all on private.pbx_universal_%I from public,anon,authenticated,service_role',t);
 end loop;
end;$$;
revoke all on sequence private.pbx_universal_audit_id_seq from public,anon,authenticated,service_role;
create function private.pbx_universal_error() returns void language plpgsql set search_path='' as $$
begin raise exception 'Invalid universal telephony configuration' using errcode='23514'; end;$$;
create function private.pbx_universal_keys(v jsonb, allowed text[], required text[] default array[]::text[]) returns boolean
 language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and not exists(select 1 from jsonb_object_keys(v) k where not(k=any(allowed)))
 and not exists(select 1 from unnest(required) k where not(v ? k)),false);$$;
create function private.pbx_universal_uuid(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and v<>'00000000-0000-0000-0000-000000000000',false);$$;
create function private.pbx_universal_limit(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(v='null'::jsonb or (jsonb_typeof(v)='number' and v::text ~ '^[1-9][0-9]{0,4}$' and (v::text)::numeric<=10000),false);$$;
create function private.pbx_universal_ref(doc jsonb,kind text,id text) returns boolean language sql immutable set search_path='' as $$
 select private.pbx_universal_uuid(id) and exists(select 1 from jsonb_array_elements(doc->kind) r where r->>'id'=id);$$;

-- Validate the entire graph before touching Vault, claims or persistent state.
create function private.pbx_validate_universal(p_org uuid,d jsonb) returns void
 language plpgsql security definer set search_path='' as $$
declare k text; r jsonb; q jsonb; v jsonb; x jsonb; n integer; ids text[]:=array[]::text[]; cid text; opt jsonb; units text[];
begin
 if not private.pbx_universal_keys(d,array['schema_version','routing_enabled','providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'],array['schema_version','routing_enabled','providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'])
 or d->'schema_version'<>'1'::jsonb or jsonb_typeof(d->'routing_enabled')<>'boolean' or octet_length(d::text)>524288 then perform private.pbx_universal_error(); end if;
 foreach k in array array['providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'] loop
  if jsonb_typeof(d->k)<>'array' or jsonb_array_length(d->k)>100 then perform private.pbx_universal_error(); end if;
  for r in select value from jsonb_array_elements(d->k) loop
   if not private.pbx_universal_uuid(r->>'id') or (r->>'id')=any(ids) then perform private.pbx_universal_error(); end if;
   ids=array_append(ids,r->>'id');
   if k<>'capacity_pools' and k<>'dids' and (jsonb_typeof(r->'name')<>'string' or char_length(r->>'name') not between 1 and 80 or r->>'name' ~ '[[:cntrl:]]') then perform private.pbx_universal_error(); end if;
   if k<>'capacity_pools' and jsonb_typeof(r->'enabled')<>'boolean' then perform private.pbx_universal_error(); end if;
   case k
   when 'providers' then
    if not private.pbx_universal_keys(r,array['id','name','enabled','options'],array['id','name','enabled','options']) then perform private.pbx_universal_error(); end if;
    opt=coalesce(r->'options','{}');
    if not private.pbx_universal_keys(opt,array['codecs','dtmf_mode','direct_media','rtp_symmetric','force_rport','rewrite_contact','destination_rates','cost_unit','did_source']) then perform private.pbx_universal_error(); end if;
    if opt ? 'did_source' and coalesce(opt->>'did_source','') not in ('request_uri','to_header') then perform private.pbx_universal_error(); end if;
    if opt ? 'cost_unit' and (jsonb_typeof(opt->'cost_unit')<>'string' or coalesce(opt->>'cost_unit','') !~ '^[A-Za-z][A-Za-z0-9_]{0,31}$') then perform private.pbx_universal_error(); end if;
    if opt ? 'destination_rates' then
     if jsonb_typeof(opt->'destination_rates')<>'array' or jsonb_array_length(opt->'destination_rates')>100 or not(opt ? 'cost_unit') then perform private.pbx_universal_error(); end if;
     for x in select value from jsonb_array_elements(opt->'destination_rates') loop
      if not private.pbx_universal_keys(x,array['prefix','cost'],array['prefix','cost']) or jsonb_typeof(x->'prefix')<>'string' or coalesce(x->>'prefix','') !~ '^\+?[1-9][0-9]{0,14}$' or jsonb_typeof(x->'cost')<>'number' or coalesce(x->>'cost','') !~ '^[0-9]{1,7}$' or (x->>'cost')::numeric>1000000 then perform private.pbx_universal_error(); end if;
     end loop;
     if (select count(*)<>count(distinct ltrim(a->>'prefix','+')) from jsonb_array_elements(opt->'destination_rates') a) then perform private.pbx_universal_error(); end if;
    end if;
    if opt ? 'codecs' then
     if jsonb_typeof(opt->'codecs')<>'array' or jsonb_array_length(opt->'codecs') not between 1 and 4 then perform private.pbx_universal_error(); end if;
     if exists(select 1 from jsonb_array_elements(opt->'codecs') a where jsonb_typeof(a)<>'string' or a#>>'{}' not in ('ulaw','alaw','g722','opus')) then perform private.pbx_universal_error(); end if;
    end if;
    if (opt ? 'dtmf_mode' and coalesce(opt->>'dtmf_mode','') not in ('rfc4733','info','auto')) or (opt ? 'direct_media' and opt->'direct_media'<>'false'::jsonb) then perform private.pbx_universal_error(); end if;
    foreach cid in array array['rtp_symmetric','force_rport','rewrite_contact'] loop
     if opt ? cid and jsonb_typeof(opt->cid)<>'boolean' then perform private.pbx_universal_error(); end if;
    end loop;
   when 'contracts' then
    if not private.pbx_universal_keys(r,array['id','provider_id','name','enabled'],array['id','provider_id','name','enabled']) or not private.pbx_universal_ref(d,'providers',r->>'provider_id') then perform private.pbx_universal_error(); end if;
   when 'connections' then
    if not private.pbx_universal_keys(r,array['id','provider_id','contract_id','name','auth_mode','host','port','transport','username','realm','inbound_cidrs','enabled','inbound_enabled','outbound_enabled'],array['id','provider_id','contract_id','name','auth_mode','host','port','transport','username','realm','inbound_cidrs','enabled','inbound_enabled','outbound_enabled'])
    or not private.pbx_universal_ref(d,'providers',r->>'provider_id') or not private.pbx_universal_ref(d,'contracts',r->>'contract_id')
    or not exists(select 1 from jsonb_array_elements(d->'contracts') a where a->>'id'=r->>'contract_id' and a->>'provider_id'=r->>'provider_id')
    or coalesce(r->>'auth_mode','') not in ('registration','digest','ip') or jsonb_typeof(r->'host')<>'string' or not private.pbx_sip_host_safe(r->>'host')
    or jsonb_typeof(r->'port')<>'number' or coalesce(r->>'port','') !~ '^[0-9]{1,5}$' or (r->>'port')::integer not between 1 and 65535
    or coalesce(r->>'transport','') not in ('udp','tcp','tls')
    or jsonb_typeof(r->'realm')<>'string' or (r->>'realm'<>'*' and not private.pbx_sip_host_safe(r->>'realm'))
    or jsonb_typeof(r->'inbound_enabled')<>'boolean' or jsonb_typeof(r->'outbound_enabled')<>'boolean'
    or jsonb_typeof(r->'inbound_cidrs')<>'array' or jsonb_array_length(r->'inbound_cidrs')>32 then perform private.pbx_universal_error(); end if;
    if (r->>'auth_mode'<>'ip' and jsonb_typeof(r->'username')<>'string') or (r->>'auth_mode'='ip' and coalesce(r->>'username','')<>'') or (r->>'auth_mode'<>'ip' and coalesce(r->>'username','') !~ '^[A-Za-z0-9_.+-]{1,128}$') then perform private.pbx_universal_error(); end if;
    if r->'enabled'='true' and exists(select 1 from jsonb_array_elements(d->'connections') a
     where a->>'id'<>r->>'id' and a->'enabled'='true' and lower(a->>'host')=lower(r->>'host')
     and lower(coalesce(a->>'username',''))=lower(coalesce(r->>'username',''))) then perform private.pbx_universal_error(); end if;
    for v in select value from jsonb_array_elements(r->'inbound_cidrs') loop
     if jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-fA-F:./]+$' or masklen((v#>>'{}')::cidr)=0 then perform private.pbx_universal_error(); end if;
    end loop;
    if (select count(*)<>count(distinct (a#>>'{}')::cidr) from jsonb_array_elements(r->'inbound_cidrs') a)
    or exists(select 1 from jsonb_array_elements(r->'inbound_cidrs') with ordinality a(value,n)
     cross join jsonb_array_elements(r->'inbound_cidrs') with ordinality b(value,n)
     where a.n<b.n and (a.value#>>'{}')::cidr && (b.value#>>'{}')::cidr) then perform private.pbx_universal_error(); end if;
    if r->'inbound_enabled'='true' and jsonb_array_length(r->'inbound_cidrs')=0 then perform private.pbx_universal_error(); end if;
   when 'trunks' then
    if not private.pbx_universal_keys(r,array['id','name','connection_ids','enabled'],array['id','name','connection_ids','enabled']) or jsonb_typeof(r->'connection_ids')<>'array' or jsonb_array_length(r->'connection_ids')>100 then perform private.pbx_universal_error(); end if;
    for v in select value from jsonb_array_elements(r->'connection_ids') loop
     if not private.pbx_universal_ref(d,'connections',v#>>'{}') then perform private.pbx_universal_error(); end if;
    end loop;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(r->'connection_ids')) then perform private.pbx_universal_error(); end if;
   when 'capacity_pools' then
    if not private.pbx_universal_keys(r,array['id','scope','scope_id','mode','shared_limit','inbound_limit','outbound_limit','confidence'],array['id','scope','scope_id','mode','shared_limit','inbound_limit','outbound_limit','confidence'])
    or not private.pbx_universal_uuid(r->>'scope_id') or coalesce(r->>'scope','') not in ('organization','provider','contract','trunk','connection','group') or coalesce(r->>'mode','') not in ('shared','independent')
    or coalesce(r->>'confidence','') not in ('unknown','contract','tested','provider')
    or not private.pbx_universal_limit(r->'shared_limit') or not private.pbx_universal_limit(r->'inbound_limit') or not private.pbx_universal_limit(r->'outbound_limit') then perform private.pbx_universal_error(); end if;
    if (r->>'mode'='shared' and (r->'inbound_limit'<>'null'::jsonb or r->'outbound_limit'<>'null'::jsonb)) or (r->>'mode'='independent' and r->'shared_limit'<>'null'::jsonb) then perform private.pbx_universal_error(); end if;
    if r->>'scope'='organization' then
     if r->>'scope_id'<>p_org::text then perform private.pbx_universal_error(); end if;
    elsif not private.pbx_universal_ref(d,(r->>'scope')||'s',r->>'scope_id') then perform private.pbx_universal_error(); end if;
    if exists(select 1 from jsonb_array_elements(d->'capacity_pools') a where a->>'id'<>r->>'id' and a->>'scope'=r->>'scope' and a->>'scope_id'=r->>'scope_id') then perform private.pbx_universal_error(); end if;
   when 'dids' then
    if not private.pbx_universal_keys(r,array['id','connection_id','number','destination_kind','destination_id','enabled'],array['id','connection_id','number','destination_kind','destination_id','enabled'])
    or not private.pbx_universal_ref(d,'connections',r->>'connection_id') or jsonb_typeof(r->'number')<>'string' or coalesce(r->>'number','') !~ '^\+?[0-9]{3,15}$'
    or not private.pbx_universal_uuid(r->>'destination_id') then perform private.pbx_universal_error(); end if;
    case r->>'destination_kind'
    when 'extension' then
     if not exists(select 1 from public.pbx_extensions e where e.id=(r->>'destination_id')::uuid and e.organization_id=p_org and e.desired_enabled) then perform private.pbx_universal_error(); end if;
    when 'queue' then
     if not exists(select 1 from public.pbx_queues e where e.id=(r->>'destination_id')::uuid and e.organization_id=p_org) then perform private.pbx_universal_error(); end if;
    when 'flow' then
     if not exists(select 1 from public.pbx_call_flows e where e.id=(r->>'destination_id')::uuid and e.organization_id=p_org) then perform private.pbx_universal_error(); end if;
    else perform private.pbx_universal_error(); end case;
    if exists(select 1 from jsonb_array_elements(d->'dids') a where a->>'id'<>r->>'id' and a->>'number'=r->>'number') then perform private.pbx_universal_error(); end if;
   when 'groups' then
    if not private.pbx_universal_keys(r,array['id','name','strategy','members','extension_ids','enabled'],array['id','name','strategy','members','extension_ids','enabled'])
    or coalesce(r->>'strategy','') not in ('priority','round_robin','failover') or jsonb_typeof(r->'members')<>'array' or jsonb_array_length(r->'members')>100
    or jsonb_typeof(r->'extension_ids')<>'array' or jsonb_array_length(r->'extension_ids')>200 then perform private.pbx_universal_error(); end if;
    for v in select value from jsonb_array_elements(r->'members') loop
     if not private.pbx_universal_keys(v,array['connection_id','trunk_id','priority'],array['connection_id','trunk_id','priority']) or not private.pbx_universal_ref(d,'connections',v->>'connection_id') or not private.pbx_universal_ref(d,'trunks',v->>'trunk_id')
     or not exists(select 1 from jsonb_array_elements(d->'trunks') a where a->>'id'=v->>'trunk_id' and a->'connection_ids' ? (v->>'connection_id'))
     or jsonb_typeof(v->'priority')<>'number' or coalesce(v->>'priority','') !~ '^[1-9][0-9]{0,3}$' then perform private.pbx_universal_error(); end if;
    end loop;
    if (select count(*)<>count(distinct a->>'connection_id') from jsonb_array_elements(r->'members') a) or (select count(*)<>count(distinct a) from jsonb_array_elements(r->'extension_ids') a) then perform private.pbx_universal_error(); end if;
    for v in select value from jsonb_array_elements(r->'extension_ids') loop
     if not private.pbx_universal_uuid(v#>>'{}') or not exists(select 1 from public.pbx_extensions e where e.id=(v#>>'{}')::uuid and e.organization_id=p_org and e.desired_enabled) then perform private.pbx_universal_error(); end if;
    end loop;
   when 'outbound_routes' then
    if not private.pbx_universal_keys(r,array['id','name','group_id','priority','destination_pattern','prefix','caller_id','max_cost','options','enabled'],array['id','name','group_id','priority','destination_pattern','prefix','caller_id','max_cost','options','enabled'])
    or not private.pbx_universal_ref(d,'groups',r->>'group_id') or jsonb_typeof(r->'priority')<>'number' or coalesce(r->>'priority','') !~ '^[1-9][0-9]{0,3}$'
    or coalesce(r->>'destination_pattern','') not in ('br_national','e164_prefix') or coalesce(r->'options','{}')<>'{}'::jsonb then perform private.pbx_universal_error(); end if;
    if (r->>'destination_pattern'='e164_prefix' and (jsonb_typeof(r->'prefix')<>'string' or coalesce(r->>'prefix','') !~ '^[1-9][0-9]{0,14}$')) or (r->>'destination_pattern'='br_national' and coalesce(r->>'prefix','')<>'') then perform private.pbx_universal_error(); end if;
    if r->>'caller_id' is not null and (jsonb_typeof(r->'caller_id')<>'string' or not exists(select 1 from jsonb_array_elements(d->'dids') a join jsonb_array_elements(d->'groups') g on g->>'id'=r->>'group_id' where a->>'number'=r->>'caller_id' and a->'enabled'='true' and exists(select 1 from jsonb_array_elements(g->'members') m where m->>'connection_id'=a->>'connection_id'))) then perform private.pbx_universal_error(); end if;
    if r->>'max_cost' is not null and (jsonb_typeof(r->'max_cost')<>'number' or coalesce(r->>'max_cost','') !~ '^[0-9]{1,7}$' or (r->>'max_cost')::numeric>1000000) then perform private.pbx_universal_error(); end if;
    if r->>'max_cost' is not null then
     select array_agg(distinct pr->'options'->>'cost_unit') filter(where pr->'options'->>'cost_unit' is not null) into units
     from jsonb_array_elements(d->'groups') gr cross join lateral jsonb_array_elements(gr->'members') mm
     join jsonb_array_elements(d->'connections') cc on cc->>'id'=mm->>'connection_id'
     join jsonb_array_elements(d->'providers') pr on pr->>'id'=cc->>'provider_id' where gr->>'id'=r->>'group_id';
     if coalesce(cardinality(units),0)>1 then perform private.pbx_universal_error(); end if;
    end if;
   end case;
  end loop;
 end loop;
exception when invalid_text_representation or numeric_value_out_of_range then perform private.pbx_universal_error();
end;$$;

-- Static activation checks do not renew leases or trust browser observations.
create function private.pbx_universal_capacity_ready(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb; g jsonb; m jsonb; t jsonb; p jsonb; s text; ident text;
begin
 if jsonb_array_length(d->'connections')=0 then return false; end if;
 for c in select value from jsonb_array_elements(d->'connections') where value->'enabled'='true' loop
  if c->'inbound_enabled'<>'true' and c->'outbound_enabled'<>'true' then return false; end if;
  if not exists(select 1 from jsonb_array_elements(d->'providers') a where a->>'id'=c->>'provider_id' and a->'enabled'='true')
  or not exists(select 1 from jsonb_array_elements(d->'contracts') a where a->>'id'=c->>'contract_id' and a->'enabled'='true') then return false; end if;
  foreach s in array array['organization','provider','contract','connection'] loop
   ident=case s when 'organization' then null when 'provider' then c->>'provider_id' when 'contract' then c->>'contract_id' else c->>'id' end;
   select a into p from jsonb_array_elements(d->'capacity_pools') a where a->>'scope'=s and (ident is null or a->>'scope_id'=ident);
   if p is null or p->>'confidence'='unknown' or (p->>'mode'='shared' and p->'shared_limit'='null')
   or (p->>'mode'='independent' and ((c->'inbound_enabled'='true' and p->'inbound_limit'='null') or (c->'outbound_enabled'='true' and p->'outbound_limit'='null'))) then return false; end if;
  end loop;
  if c->'inbound_enabled'='true' and not exists(select 1 from jsonb_array_elements(d->'dids') a where a->>'connection_id'=c->>'id' and a->'enabled'='true') then return false; end if;
 end loop;
 for t in select value from jsonb_array_elements(d->'trunks') where value->'enabled'='true' loop
  select a into p from jsonb_array_elements(d->'capacity_pools') a where a->>'scope'='trunk' and a->>'scope_id'=t->>'id';
  if p is null or p->>'confidence'='unknown' or (p->>'mode'='shared' and p->'shared_limit'='null')
  or (p->>'mode'='independent' and ((p->'outbound_limit'='null' and exists(select 1 from jsonb_array_elements(d->'connections') ac where t->'connection_ids' ? (ac->>'id') and ac->'enabled'='true' and ac->'outbound_enabled'='true'))
   or (p->'inbound_limit'='null' and exists(select 1 from jsonb_array_elements(d->'connections') ac where t->'connection_ids' ? (ac->>'id') and ac->'enabled'='true' and ac->'inbound_enabled'='true')))) then return false; end if;
 end loop;
 for g in select value from jsonb_array_elements(d->'groups') where value->'enabled'='true' loop
  if jsonb_array_length(g->'members')=0 or jsonb_array_length(g->'extension_ids')=0 then return false; end if;
  select a into p from jsonb_array_elements(d->'capacity_pools') a where a->>'scope'='group' and a->>'scope_id'=g->>'id';
  if p is null or p->>'confidence'='unknown' or (p->>'mode'='shared' and p->'shared_limit'='null') or (p->>'mode'='independent' and p->'outbound_limit'='null') then return false; end if;
  for m in select value from jsonb_array_elements(g->'members') loop
   if not exists(select 1 from jsonb_array_elements(d->'connections') a where a->>'id'=m->>'connection_id' and a->'enabled'='true' and a->'outbound_enabled'='true')
   or not exists(select 1 from jsonb_array_elements(d->'trunks') a where a->>'id'=m->>'trunk_id' and a->'enabled'='true') then return false; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(d->'outbound_routes') ar where ar->'enabled'='true' and not exists(select 1 from jsonb_array_elements(d->'groups') ag where ag->>'id'=ar->>'group_id' and ag->'enabled'='true')) then return false; end if;
 return exists(select 1 from jsonb_array_elements(d->'connections') a where a->'enabled'='true');
end;$$;

create function private.pbx_universal_ready(p_agent uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.pbx_agent_runtime_ready(p_agent) and exists(
 select 1 from private.pbx_universal_capabilities c join public.pbx_agents a on a.id=c.agent_id
 where c.agent_id=p_agent and c.organization_id=a.organization_id and c.enabled
 and c.seen_at>now()-interval '95 seconds' and c.seen_at<=now()+interval '5 seconds'
 and ((private.is_platform_organization(a.organization_id) and a.protocol_version=2 and a.profile_id is null and a.profile_context is null)
 or (not private.is_platform_organization(a.organization_id) and a.protocol_version=3 and a.profile_id=a.organization_id and a.profile_context='uwi-'||replace(a.organization_id::text,'-',''))));$$;
create function private.pbx_universal_can_activate(p_org uuid,d jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cfg private.pbx_universal_configs%rowtype; c jsonb; target jsonb;
begin
 select * into cfg from private.pbx_universal_configs where organization_id=p_org;
 if not found or cfg.status<>'applied' or cfg.applied_revision is distinct from cfg.revision
 or (d-'routing_enabled') is distinct from (cfg.document-'routing_enabled')
 or not private.pbx_universal_ready(cfg.agent_id) or not private.pbx_universal_capacity_ready(d)
 or cfg.observed_at is null or cfg.observed_at<now()-interval '30 seconds' or cfg.observed_at>now()+interval '5 seconds'
 or cfg.observed->'ready' is distinct from 'true'::jsonb or cfg.observed->'active_legs' is distinct from '0'::jsonb
 or cfg.observed->'legacy_coverage' is distinct from 'true'::jsonb then return false; end if;
 -- No broad legacy coverage assertion overrides known, separately managed paths.
 if exists(select 1 from private.pbx_legacy_trunk_controls where organization_id=p_org and (enabled or status<>'applied' or observed_enabled is distinct from false))
 or exists(select 1 from public.pbx_sip_trunk_configs where organization_id=p_org and (enabled or status<>'applied')) then return false; end if;
 for c in select value from jsonb_array_elements(d->'connections') where value->'enabled'='true' and value->>'auth_mode'<>'ip' loop
  if not exists(select 1 from private.pbx_universal_secrets s where s.connection_id=(c->>'id')::uuid and s.organization_id=p_org) then return false; end if;
 end loop;
 for target in select value from jsonb_array_elements(d->'dids') where value->'enabled'='true' loop
  if target->>'destination_kind'='flow' then
   if not exists(select 1 from public.pbx_call_flows f where f.organization_id=p_org and f.id=(target->>'destination_id')::uuid and f.enabled and f.provisioning_status='applied') then return false; end if;
  elsif not private.pbx_flow_target_valid(p_org,jsonb_build_object('kind',target->>'destination_kind','id',target->>'destination_id'),true) then return false; end if;
 end loop;
 return true;
end;$$;

-- A legacy/v1 claim insert must see the universal reservation under the SAME lock.
-- This extends admission without replacing any legacy function or active route.
create function private.pbx_universal_guard_legacy_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(786252001);
 if exists(select 1 from private.pbx_universal_claims c where c.host=lower(new.host) and c.username=lower(new.username)) then
  raise exception 'Conta SIP indisponivel para ativacao.' using errcode='23514'; end if;
 return new;
end;$$;
create trigger pbx_universal_guard_legacy_claim before insert or update on private.pbx_sip_account_claims
 for each row execute function private.pbx_universal_guard_legacy_claim();

create function private.pbx_universal_protect_target() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; changes boolean;
begin
 kind=case tg_table_name when 'pbx_extensions' then 'extension' when 'pbx_queues' then 'queue' else 'flow' end;
 if tg_op='DELETE' then changes=true;
 else
  changes=new.organization_id is distinct from old.organization_id;
  if kind='extension' then changes=changes or new.number is distinct from old.number or new.endpoint_name is distinct from old.endpoint_name or new.desired_enabled is distinct from old.desired_enabled;
  else
   changes=changes or new.enabled is distinct from old.enabled or new.test_extension is distinct from old.test_extension;
   if kind='flow' then changes=changes or new.config is distinct from old.config; end if;
  end if;
 end if;
 if changes then perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text,786251)); end if;
 if changes and exists(select 1 from private.pbx_universal_configs c where c.organization_id=old.organization_id
  and (c.document->'routing_enabled'='true' or exists(select 1 from private.pbx_universal_claims cl where cl.organization_id=c.organization_id) or exists(select 1 from private.pbx_universal_ingress_claims cl where cl.organization_id=c.organization_id))
  and ((kind='extension' and exists(select 1 from jsonb_array_elements(c.document->'groups') g where g->'extension_ids' ? old.id::text))
   or exists(select 1 from jsonb_array_elements(c.document->'dids') d where d->>'destination_kind'=kind and d->>'destination_id'=old.id::text))) then
  raise exception 'Disable universal routing and await verified drain before changing referenced destinations' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end;$$;
create trigger pbx_universal_protect_extension before update or delete on public.pbx_extensions for each row execute function private.pbx_universal_protect_target();
create trigger pbx_universal_protect_queue before update or delete on public.pbx_queues for each row execute function private.pbx_universal_protect_target();
create trigger pbx_universal_protect_flow before update or delete on public.pbx_call_flows for each row execute function private.pbx_universal_protect_target();

create function private.pbx_universal_invalidate_extension() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid; org uuid; impactful boolean;
begin
 if tg_table_name='pbx_extensions' then
  if tg_op='DELETE' then eid=old.id; org=old.organization_id; impactful=true;
  elsif tg_op='INSERT' then eid=new.id; org=new.organization_id; impactful=true;
  else
   eid=new.id; org=new.organization_id;
   impactful=new.number is distinct from old.number or new.endpoint_name is distinct from old.endpoint_name
    or new.desired_enabled is distinct from old.desired_enabled
    or new.organization_id is distinct from old.organization_id;
  end if;
 else
  if tg_op='DELETE' then eid=old.extension_id; org=old.organization_id; impactful=true;
  elsif tg_op='INSERT' then eid=new.extension_id; org=new.organization_id; impactful=true;
  else eid=new.extension_id; org=new.organization_id; impactful=new.external_mode is distinct from old.external_mode or new.applied_external_mode is distinct from old.applied_external_mode; end if;
 end if;
 if impactful then
  perform pg_advisory_xact_lock(hashtextextended(org::text,786251));
  with changed as (
   update private.pbx_universal_configs c set revision=c.revision+1,status='pending',last_error=null,updated_at=now()
   where c.organization_id=org and (exists(select 1 from jsonb_array_elements(c.document->'groups') g where g->'extension_ids' ? eid::text)
    or exists(select 1 from jsonb_array_elements(c.document->'dids') d where d->>'destination_kind'='extension' and d->>'destination_id'=eid::text))
   returning organization_id,revision
  ) insert into private.pbx_universal_audit(organization_id,revision,actor_id,action) select organization_id,revision,auth.uid(),'save' from changed;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end;$$;
create trigger pbx_universal_invalidate_extension after insert or update or delete on public.pbx_extensions for each row execute function private.pbx_universal_invalidate_extension();
create trigger pbx_universal_invalidate_call_mode after insert or update or delete on private.pbx_extension_call_modes for each row execute function private.pbx_universal_invalidate_extension();

-- Destination dialling/provisioning changes must invalidate matching snapshots,
-- while observational timestamps and cosmetic labels remain quiet.
create function private.pbx_universal_invalidate_target() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; org uuid; eid uuid; impactful boolean;
begin
 kind=case tg_table_name when 'pbx_queues' then 'queue' else 'flow' end;
 if tg_op='DELETE' then org=old.organization_id; eid=old.id; impactful=true;
 elsif tg_op='INSERT' then org=new.organization_id; eid=new.id; impactful=true;
 else
  org=new.organization_id; eid=new.id;
  impactful=new.organization_id is distinct from old.organization_id or new.enabled is distinct from old.enabled
   or new.test_extension is distinct from old.test_extension or new.provisioning_status is distinct from old.provisioning_status;
  if kind='flow' then impactful=impactful or new.config is distinct from old.config; end if;
 end if;
 if impactful then
  perform pg_advisory_xact_lock(hashtextextended(org::text,786251));
  with changed as (
   update private.pbx_universal_configs c set revision=c.revision+1,status='pending',last_error=null,updated_at=now()
   where c.organization_id=org and exists(select 1 from jsonb_array_elements(c.document->'dids') d where d->>'destination_kind'=kind and d->>'destination_id'=eid::text)
   returning organization_id,revision
  ) insert into private.pbx_universal_audit(organization_id,revision,actor_id,action) select organization_id,revision,auth.uid(),'save' from changed;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end;$$;
create trigger pbx_universal_invalidate_queue after insert or update or delete on public.pbx_queues for each row execute function private.pbx_universal_invalidate_target();
create trigger pbx_universal_invalidate_flow after insert or update or delete on public.pbx_call_flows for each row execute function private.pbx_universal_invalidate_target();

create function private.pbx_list_universal_telephony(p_organization_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare c private.pbx_universal_configs%rowtype;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 select * into c from private.pbx_universal_configs where organization_id=p_organization_id;
 if not found then return jsonb_build_object('organization_id',p_organization_id,'revision',0,'document',jsonb_build_object('schema_version',1,'routing_enabled',false,'providers','[]'::jsonb,'contracts','[]'::jsonb,'connections','[]'::jsonb,'trunks','[]'::jsonb,'capacity_pools','[]'::jsonb,'dids','[]'::jsonb,'groups','[]'::jsonb,'outbound_routes','[]'::jsonb),'status','pending','observed','{}'::jsonb,'can_activate',false,'last_error',null,'audit','[]'::jsonb); end if;
 return jsonb_build_object('organization_id',p_organization_id,'revision',c.revision,'document',c.document,'status',c.status,'observed',c.observed,'can_activate',private.pbx_universal_can_activate(p_organization_id,c.document),'last_error',c.last_error,'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (select revision,changed_at as created_at,actor_id,case action when 'save' then 'pending' else action end as status from private.pbx_universal_audit where organization_id=p_organization_id order by id desc limit 20) a));
end;$$;

create function private.pbx_save_universal_telephony(p_organization_id uuid,p_expected_revision bigint,p_document jsonb,p_secrets jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cfg private.pbx_universal_configs%rowtype; agent uuid; k text; r jsonb; s record; sid uuid; cid uuid; d jsonb:=p_document; n bigint; net cidr; claim record;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,786251));
 perform pg_advisory_xact_lock(786252001);
 select * into cfg from private.pbx_universal_configs where organization_id=p_organization_id for update;
 if p_expected_revision is distinct from coalesce(cfg.revision,0) then raise exception 'Configuration changed; refresh before saving' using errcode='40001'; end if;
 perform private.pbx_validate_universal(p_organization_id,d);
 if jsonb_typeof(p_secrets) is distinct from 'object' or octet_length(p_secrets::text)>30000 then perform private.pbx_universal_error(); end if;
 select id into agent from public.pbx_agents where organization_id=p_organization_id and enabled;
 if agent is null or (cfg.agent_id is not null and cfg.agent_id<>agent) then perform private.pbx_universal_error(); end if;
 -- Disable, verify zero legs and application, THEN change routes/membership/limits.
 if cfg.document->'routing_enabled'='true' then
  if d->'routing_enabled'<>'false' or (d-'routing_enabled') is distinct from (cfg.document-'routing_enabled') or p_secrets<>'{}'::jsonb then
   raise exception 'Disable routing and await application before changing configuration' using errcode='23514'; end if;
 elsif exists(select 1 from private.pbx_universal_claims where organization_id=p_organization_id)
 or exists(select 1 from private.pbx_universal_ingress_claims where organization_id=p_organization_id) then
  raise exception 'Await verified drain before changing configuration' using errcode='23514';
 end if;
 foreach k in array array['providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'] loop
  for r in select value from jsonb_array_elements(d->k) loop
   cid=(r->>'id')::uuid;
   if exists(select 1 from private.pbx_universal_entities where id=cid and (organization_id<>p_organization_id or kind<>k)) then perform private.pbx_universal_error(); end if;
   insert into private.pbx_universal_entities(id,organization_id,kind) values(cid,p_organization_id,k) on conflict(id) do nothing;
  end loop;
 end loop;
 for s in select * from jsonb_each(p_secrets) loop
  if not private.pbx_universal_uuid(s.key) or jsonb_typeof(s.value)<>'string' or not exists(select 1 from jsonb_array_elements(d->'connections') a where a->>'id'=s.key and a->>'auth_mode'<>'ip') then perform private.pbx_universal_error(); end if;
  if s.value#>>'{}'='' then continue; end if;
  if char_length(s.value#>>'{}') not between 8 and 256 or s.value#>>'{}' !~ '^[A-Za-z0-9_!@%+.,:/?&*(){}~-]+$' then perform private.pbx_universal_error(); end if;
  select secret_id into sid from private.pbx_universal_secrets where connection_id=s.key::uuid and organization_id=p_organization_id;
  begin
   if sid is null then sid=vault.create_secret(s.value#>>'{}','pbx-universal-'||s.key,'PBX connection credential');
   else perform vault.update_secret(sid,s.value#>>'{}'); end if;
  exception when others then raise exception 'Credential could not be saved' using errcode='23514'; end;
  insert into private.pbx_universal_secrets(connection_id,organization_id,secret_id) values(s.key::uuid,p_organization_id,sid) on conflict(connection_id) do update set secret_id=excluded.secret_id;
 end loop;
 if d->'routing_enabled'='true' then
  if p_secrets<>'{}'::jsonb then raise exception 'Save credentials in a disabled draft before activation' using errcode='23514'; end if;
  if not private.pbx_universal_can_activate(p_organization_id,d) then raise exception 'Activation prerequisites unavailable' using errcode='23514'; end if;
  if exists(select 1 from private.pbx_legacy_trunk_controls where host is null and (enabled or status<>'applied' or observed_enabled is distinct from false)) then raise exception 'SIP identity admission unavailable' using errcode='23514'; end if;
  for r in select value from jsonb_array_elements(d->'connections') where value->'enabled'='true' loop
   if r->>'auth_mode'<>'ip' then
    if exists(select 1 from private.pbx_sip_account_claims where lower(host)=lower(r->>'host') and lower(username)=lower(r->>'username'))
    or exists(select 1 from private.pbx_universal_claims where host=lower(r->>'host') and username=lower(r->>'username')) then raise exception 'SIP identity admission unavailable' using errcode='23514'; end if;
    insert into private.pbx_universal_claims(host,username,connection_id,organization_id) values(lower(r->>'host'),lower(r->>'username'),(r->>'id')::uuid,p_organization_id);
   end if;
   if r->'inbound_enabled'='true' then
    for net in select (value#>>'{}')::cidr from jsonb_array_elements(r->'inbound_cidrs') loop
     if exists(select 1 from private.pbx_universal_ingress_claims where network && net and connection_id<>(r->>'id')::uuid) then raise exception 'Inbound identity admission unavailable' using errcode='23514'; end if;
     insert into private.pbx_universal_ingress_claims(connection_id,organization_id,network) values((r->>'id')::uuid,p_organization_id,net);
    end loop;
   end if;
  end loop;
 end if;
 n=coalesce(cfg.revision,0)+1;
 insert into private.pbx_universal_configs(organization_id,agent_id,revision,document) values(p_organization_id,agent,n,d)
 on conflict(organization_id) do update set revision=excluded.revision,document=excluded.document,status='pending',last_error=null,updated_at=now();
 insert into private.pbx_universal_audit(organization_id,revision,actor_id,action) values(p_organization_id,n,auth.uid(),'save');
 return private.pbx_list_universal_telephony(p_organization_id);
exception when unique_violation then raise exception 'Telephony identity unavailable' using errcode='23514';
end;$$;

create function private.pbx_admit_universal_telephony_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean
 language plpgsql security definer set search_path='' as $$
declare a public.pbx_agents%rowtype; allow boolean;
begin
 select * into a from public.pbx_agents where id=p_agent_id for update;
 if not found or not private.pbx_agent_runtime_ready(a.id) or a.last_sequence is distinct from p_sequence or p_sequence is null or p_sequence<=0
 or a.capability_seen_at is null or a.capability_seen_at<now()-interval '5 seconds'
 or not ((private.is_platform_organization(a.organization_id) and a.protocol_version=2 and a.profile_id is null and a.profile_context is null)
 or (not private.is_platform_organization(a.organization_id) and a.protocol_version=3 and a.profile_id=a.organization_id and a.profile_context='uwi-'||replace(a.organization_id::text,'-','')))
 or exists(select 1 from private.pbx_universal_capabilities where agent_id=a.id and poll_sequence>=p_sequence) then return false; end if;
 allow=coalesce(jsonb_typeof(p_features)='array' and jsonb_array_length(p_features)<=20 and p_features ? 'universal_telephony_v1',false);
 insert into private.pbx_universal_capabilities(agent_id,organization_id,poll_sequence,seen_at,enabled) values(a.id,a.organization_id,p_sequence,now(),allow)
 -- Retain the previous delivery proof until its original expiry, so a report
 -- embedded in the next admitted poll cannot refresh its own delivery lease.
 on conflict(agent_id) do update set poll_sequence=excluded.poll_sequence,seen_at=excluded.seen_at,enabled=excluded.enabled;
 return allow;
end;$$;
create function private.pbx_poll_universal_telephony(p_agent_id uuid,p_applied_revision bigint default null,p_applied_hash text default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cfg private.pbx_universal_configs%rowtype; cap private.pbx_universal_capabilities%rowtype; ext jsonb; creds jsonb; deadline timestamptz;
begin
 if not private.pbx_universal_ready(p_agent_id) then return null; end if;
 select * into cap from private.pbx_universal_capabilities where agent_id=p_agent_id for update;
 if not exists(select 1 from public.pbx_agents a where a.id=p_agent_id and a.last_sequence=cap.poll_sequence) then return null; end if;
 select * into cfg from private.pbx_universal_configs where agent_id=p_agent_id and organization_id=cap.organization_id;
 if not found then return null; end if;
 perform private.pbx_validate_universal(cfg.organization_id,cfg.document);
 deadline=case when cap.delivered_sequence=cap.poll_sequence then cap.delivered_until else least(cap.seen_at+interval '95 seconds',now()+interval '90 seconds') end;
 if deadline<=now() then return null; end if;
 if cfg.status='applied' and cfg.applied_revision=cfg.revision and p_applied_revision=cfg.revision and p_applied_hash=cfg.applied_hash then
  update private.pbx_universal_capabilities set delivered_sequence=cap.poll_sequence,delivered_revision=cfg.revision,delivered_until=deadline where agent_id=p_agent_id;
  return jsonb_build_object('schema_version',1,'organization_id',cfg.organization_id,'agent_id',p_agent_id,'revision',cfg.revision,'issued_at',extract(epoch from now()),'expires_at',extract(epoch from deadline),'hash',cfg.applied_hash,'unchanged',true);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'number',e.number,'endpoint_name',e.endpoint_name,'enabled',e.desired_enabled,'external_mode',coalesce(m.external_mode,'both')) order by e.id),'[]'::jsonb) into ext
 from public.pbx_extensions e left join private.pbx_extension_call_modes m on m.extension_id=e.id and m.organization_id=e.organization_id where e.organization_id=cfg.organization_id;
 creds='[]'::jsonb;
 if cfg.document->'routing_enabled'='true' then
  select coalesce(jsonb_agg(jsonb_build_object('connection_id',c->>'id','password',s.decrypted_secret) order by c->>'id'),'[]'::jsonb) into creds
  from jsonb_array_elements(cfg.document->'connections') c join private.pbx_universal_secrets k on k.connection_id=(c->>'id')::uuid and k.organization_id=cfg.organization_id
  join vault.decrypted_secrets s on s.id=k.secret_id where c->'enabled'='true' and c->>'auth_mode'<>'ip';
 end if;
 update private.pbx_universal_capabilities set delivered_sequence=cap.poll_sequence,delivered_revision=cfg.revision,delivered_until=deadline where agent_id=p_agent_id;
 return jsonb_build_object('schema_version',1,'organization_id',cfg.organization_id,'agent_id',p_agent_id,'revision',cfg.revision,'document',cfg.document,'extensions',ext,'credentials',creds,'issued_at',extract(epoch from now()),'expires_at',extract(epoch from deadline),'hash',case when cfg.applied_revision=cfg.revision then cfg.applied_hash else null end);
end;$$;

create function private.pbx_report_universal_telephony(p_agent_id uuid,p_revision bigint,p_status text,p_observed jsonb,p_hash text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cfg private.pbx_universal_configs%rowtype; r jsonb;
begin
 if not private.pbx_universal_ready(p_agent_id) then raise exception 'Agent unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended((select organization_id::text from public.pbx_agents where id=p_agent_id),786251));
 perform pg_advisory_xact_lock(786252001);
 select * into cfg from private.pbx_universal_configs where agent_id=p_agent_id for update;
 if not found or cfg.revision is distinct from p_revision then return jsonb_build_object('accepted',false,'stale',true); end if;
 if not exists(select 1 from private.pbx_universal_capabilities where agent_id=p_agent_id and organization_id=cfg.organization_id and delivered_revision=p_revision and delivered_until>now()) then raise exception 'Snapshot lease unavailable' using errcode='42501'; end if;
 if coalesce(p_status,'') not in ('applied','failed') or coalesce(p_hash,'') !~ '^[0-9a-f]{64}$'
 or not private.pbx_universal_keys(p_observed,array['ready','active_legs','legacy_coverage','connections'],array['ready','active_legs','legacy_coverage','connections'])
 or jsonb_typeof(p_observed->'ready')<>'boolean' or jsonb_typeof(p_observed->'legacy_coverage')<>'boolean'
 or jsonb_typeof(p_observed->'active_legs')<>'number' or coalesce(p_observed->>'active_legs','') !~ '^[0-9]{1,6}$' or jsonb_typeof(p_observed->'connections')<>'array' or jsonb_array_length(p_observed->'connections')>100 then perform private.pbx_universal_error(); end if;
 for r in select value from jsonb_array_elements(p_observed->'connections') loop
  if not private.pbx_universal_keys(r,array['connection_id','state','used','inbound_used','outbound_used','available','checked_at'],array['connection_id','state','used','inbound_used','outbound_used','available','checked_at'])
  or not private.pbx_universal_ref(cfg.document,'connections',r->>'connection_id') or coalesce(r->>'state','') not in ('registered','available','registering','unregistered','authentication_failed','network_failed','disabled','divergent','unknown')
  or jsonb_typeof(r->'used')<>'number' or jsonb_typeof(r->'inbound_used')<>'number' or jsonb_typeof(r->'outbound_used')<>'number'
  or coalesce(r->>'used','') !~ '^[0-9]{1,5}$' or coalesce(r->>'inbound_used','') !~ '^[0-9]{1,5}$' or coalesce(r->>'outbound_used','') !~ '^[0-9]{1,5}$'
  or (r->>'used')::integer<>((r->>'inbound_used')::integer+(r->>'outbound_used')::integer)
  or (r->'available'<>'null'::jsonb and (jsonb_typeof(r->'available')<>'number' or coalesce(r->>'available','') !~ '^[0-9]{1,5}$'))
  or jsonb_typeof(r->'checked_at')<>'string' or (r->>'checked_at')::timestamptz>now()+interval '5 seconds' or (r->>'checked_at')::timestamptz<now()-interval '30 seconds' then perform private.pbx_universal_error(); end if;
 end loop;
 if (select count(*)<>count(distinct ar->>'connection_id') from jsonb_array_elements(p_observed->'connections') ar)
 or jsonb_array_length(p_observed->'connections')<>jsonb_array_length(cfg.document->'connections') then perform private.pbx_universal_error(); end if;
 if p_status='applied' and cfg.document->'routing_enabled'='false' and (
  p_observed->'ready' is distinct from 'true'::jsonb or p_observed->'active_legs' is distinct from '0'::jsonb
  or exists(select 1 from jsonb_array_elements(p_observed->'connections') ar where ar->>'state'<>'disabled' or ar->'used'<>'0'::jsonb)) then perform private.pbx_universal_error(); end if;
 update private.pbx_universal_configs set status=p_status,applied_revision=case when p_status='applied' then p_revision else applied_revision end,
 applied_hash=case when p_status='applied' then p_hash else applied_hash end,observed=p_observed,observed_at=now(),last_error=case when p_status='failed' then 'Universal telephony application failed' else null end where organization_id=cfg.organization_id;
 if p_status='applied' and cfg.document->'routing_enabled'='false' then
  perform pg_advisory_xact_lock(786252001);
  delete from private.pbx_universal_claims where organization_id=cfg.organization_id;
  delete from private.pbx_universal_ingress_claims where organization_id=cfg.organization_id;
 end if;
 if cfg.status is distinct from p_status or (p_status='applied' and (cfg.applied_revision is distinct from p_revision or cfg.applied_hash is distinct from p_hash)) then
  insert into private.pbx_universal_audit(organization_id,revision,action) values(cfg.organization_id,p_revision,p_status);
 end if;
 return jsonb_build_object('accepted',true,'stale',false);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then perform private.pbx_universal_error(); return null;
end;$$;

-- Revoke default EXECUTE from all helpers, including roles inheriting PUBLIC.
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'pbx_universal_%' or p.proname like 'pbx_%universal_telephony%' or p.proname='pbx_validate_universal') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end;$$;

create function public.pbx_list_universal_telephony(p_organization_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.pbx_list_universal_telephony(p_organization_id);$$;
create function public.pbx_save_universal_telephony(p_organization_id uuid,p_expected_revision bigint,p_document jsonb,p_secrets jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.pbx_save_universal_telephony(p_organization_id,p_expected_revision,p_document,p_secrets);$$;
create function public.pbx_admit_universal_telephony_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean language sql security invoker set search_path='' as $$select private.pbx_admit_universal_telephony_poll(p_agent_id,p_sequence,p_features);$$;
create function public.pbx_poll_universal_telephony(p_agent_id uuid,p_applied_revision bigint default null,p_applied_hash text default null) returns jsonb language sql security invoker set search_path='' as $$select private.pbx_poll_universal_telephony(p_agent_id,p_applied_revision,p_applied_hash);$$;
create function public.pbx_report_universal_telephony(p_agent_id uuid,p_revision bigint,p_status text,p_observed jsonb,p_hash text) returns jsonb language sql security invoker set search_path='' as $$select private.pbx_report_universal_telephony(p_agent_id,p_revision,p_status,p_observed,p_hash);$$;
revoke all on function public.pbx_list_universal_telephony(uuid),public.pbx_save_universal_telephony(uuid,bigint,jsonb,jsonb),public.pbx_admit_universal_telephony_poll(uuid,bigint,jsonb),public.pbx_poll_universal_telephony(uuid,bigint,text),public.pbx_report_universal_telephony(uuid,bigint,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.pbx_list_universal_telephony(uuid),private.pbx_list_universal_telephony(uuid),public.pbx_save_universal_telephony(uuid,bigint,jsonb,jsonb),private.pbx_save_universal_telephony(uuid,bigint,jsonb,jsonb) to authenticated;
grant execute on function public.pbx_admit_universal_telephony_poll(uuid,bigint,jsonb),private.pbx_admit_universal_telephony_poll(uuid,bigint,jsonb),public.pbx_poll_universal_telephony(uuid,bigint,text),private.pbx_poll_universal_telephony(uuid,bigint,text),public.pbx_report_universal_telephony(uuid,bigint,text,jsonb,text),private.pbx_report_universal_telephony(uuid,bigint,text,jsonb,text) to service_role;
commit;
