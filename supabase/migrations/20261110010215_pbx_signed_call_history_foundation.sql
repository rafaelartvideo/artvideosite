-- Metadata only: no SIP password and no voice recording. Does not change routing.
create table public.pbx_trunks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 agent_id uuid not null references public.pbx_agents(id) on delete restrict,
 name text not null check (char_length(name) between 2 and 80),
 provider text not null check (char_length(provider) between 2 and 80),
 inbound_endpoint text not null unique check (inbound_endpoint ~ '^[A-Za-z0-9_-]{1,80}$'),
 outbound_endpoint text not null unique check (outbound_endpoint ~ '^[A-Za-z0-9_-]{1,80}$'),
 provisioning_status text not null default 'manual' check (provisioning_status in ('manual','pending','applied','failed')),
 created_at timestamptz not null default now(),
 check (inbound_endpoint <> outbound_endpoint),
 unique (organization_id,agent_id,name)
);
create index pbx_trunks_agent_idx on public.pbx_trunks(agent_id,organization_id);
alter table public.pbx_trunks enable row level security;
revoke all on public.pbx_trunks from public,anon,authenticated;
grant select on public.pbx_trunks to authenticated;
grant select,insert,update on public.pbx_trunks to service_role;
create policy pbx_trunks_read on public.pbx_trunks for select to authenticated using (
 (select auth.uid()) is not null and private.is_platform_organization(organization_id)
 and private.has_organization_permission(organization_id,'pbx.manage')
);

-- Register the already-tested, manually maintained FVX endpoints for the platform
-- agent only. No provisioning, secret changes or authorization to dial is implied.
insert into public.pbx_trunks(organization_id,agent_id,name,provider,inbound_endpoint,outbound_endpoint)
select organization_id,id,'FVX Union','FVX','union-fvx-in','union-fvx-out-test'
from public.pbx_agents where enabled and private.is_platform_organization(organization_id);

create table public.pbx_call_logs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 agent_id uuid not null references public.pbx_agents(id) on delete restrict,
 event_id text not null check (event_id ~ '^[A-Za-z0-9_.-]{1,80}:[0-9]{1,10}$'),
 linked_id text not null check (linked_id ~ '^[A-Za-z0-9_.-]{1,80}$'),
 started_at timestamptz not null,
 answered_at timestamptz,
 ended_at timestamptz not null,
 source text not null check (source ~ '^[+0-9*#]{0,32}$'),
 destination text not null check (destination ~ '^[+0-9*#]{0,32}$'),
 source_extension_id uuid references public.pbx_extensions(id) on delete restrict,
 destination_extension_id uuid references public.pbx_extensions(id) on delete restrict,
 trunk_id uuid references public.pbx_trunks(id) on delete restrict,
 direction text not null check (direction in ('internal','inbound','outbound')),
 disposition text not null check (disposition in ('ANSWERED','NO ANSWER','BUSY','FAILED','CONGESTION')),
 duration_seconds integer not null check (duration_seconds between 0 and 172800),
 billable_seconds integer not null check (billable_seconds between 0 and duration_seconds),
 received_at timestamptz not null default now(),
 unique (agent_id,event_id),
 check (ended_at >= started_at and ended_at <= started_at + interval '2 days 1 second'),
 check (answered_at is null or answered_at between started_at and ended_at),
 check (billable_seconds=0 or answered_at is not null),
 check (started_at >= '2020-01-01T00:00:00Z'::timestamptz),
 check (source_extension_id is not null or destination_extension_id is not null or trunk_id is not null)
);
create index pbx_call_logs_org_time_idx on public.pbx_call_logs(organization_id,started_at desc,id desc);
create index pbx_call_logs_org_link_idx on public.pbx_call_logs(organization_id,linked_id);
create index pbx_call_logs_source_extension_idx on public.pbx_call_logs(source_extension_id) where source_extension_id is not null;
create index pbx_call_logs_destination_extension_idx on public.pbx_call_logs(destination_extension_id) where destination_extension_id is not null;
create index pbx_call_logs_trunk_idx on public.pbx_call_logs(trunk_id) where trunk_id is not null;
alter table public.pbx_call_logs enable row level security;
revoke all on public.pbx_call_logs from public,anon,authenticated;
grant select on public.pbx_call_logs to authenticated;
grant select,insert on public.pbx_call_logs to service_role;
create policy pbx_call_logs_read on public.pbx_call_logs for select to authenticated using (
 (select auth.uid()) is not null and private.is_platform_organization(organization_id)
 and private.has_organization_permission(organization_id,'pbx.view')
);

-- Service-only invoker: the Edge Function verifies the Ed25519 request first.
-- Organization, direction and foreign keys are derived here; client values cannot
-- override them. Unknown or ambiguous channel ownership rejects the whole batch.
create function public.pbx_ingest_call_records(p_agent_id uuid,p_records jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 org uuid;
 item jsonb;
 endpoint text;
 endpoints text[];
 ext_ids uuid[];
 trunk_ids uuid[];
 ext_id uuid;
 ext_org uuid;
 trunk uuid;
 trunk_org uuid;
 total integer=0;
 side integer;
 kind text;
 trunk_direction text;
begin
 select organization_id into org from public.pbx_agents where id=p_agent_id and enabled;
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
   ext_ids=array[null::uuid,null::uuid]; trunk_ids=array[null::uuid,null::uuid];
   kind='internal';
   for side in 1..2 loop
     endpoint=endpoints[side];
     if endpoint is null then continue; end if;
     if endpoint !~ '^[A-Za-z0-9_-]{1,80}$' then
       raise exception 'Endpoint invalido' using errcode='23514';
     end if;
     select id,organization_id into ext_id,ext_org from public.pbx_extensions where endpoint_name=endpoint;
     -- Cross-column collisions are also ambiguous, never select an arbitrary row.
     if (select count(*) from public.pbx_trunks where endpoint in (inbound_endpoint,outbound_endpoint)) > 1 then
       raise exception 'Endpoint ambiguo' using errcode='23514';
     end if;
     select id,organization_id,case when endpoint=inbound_endpoint then 'inbound' else 'outbound' end
       into trunk,trunk_org,trunk_direction from public.pbx_trunks
       where endpoint in (inbound_endpoint,outbound_endpoint) and agent_id=p_agent_id;
     if (ext_id is null and trunk is null) or (ext_id is not null and trunk is not null)
       or (ext_id is not null and ext_org<>org) or (trunk is not null and trunk_org<>org) then
       raise exception 'Endpoint nao pertence ao agente' using errcode='23514';
     end if;
     ext_ids[side]=ext_id; trunk_ids[side]=trunk;
     if trunk is not null then kind=trunk_direction; end if;
   end loop;
   if coalesce(ext_ids[1],ext_ids[2],trunk_ids[1],trunk_ids[2]) is null
     or (trunk_ids[1] is not null and trunk_ids[2] is not null) then
     raise exception 'Pernas invalidas' using errcode='23514';
   end if;
   insert into public.pbx_call_logs(organization_id,agent_id,event_id,linked_id,
     started_at,answered_at,ended_at,source,destination,source_extension_id,destination_extension_id,
     trunk_id,direction,disposition,duration_seconds,billable_seconds)
   values(org,p_agent_id,item->>'event_id',item->>'linked_id',
     (item->>'started_at')::timestamptz,(item->>'answered_at')::timestamptz,(item->>'ended_at')::timestamptz,
     item->>'source',item->>'destination',ext_ids[1],ext_ids[2],coalesce(trunk_ids[1],trunk_ids[2]),
     kind,item->>'disposition',(item->>'duration_seconds')::integer,(item->>'billable_seconds')::integer)
   on conflict (agent_id,event_id) do nothing;
   total=total+1;
 end loop;
 return jsonb_build_object('accepted',true,'acknowledged',total);
end;
$$;
revoke all on function public.pbx_ingest_call_records(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pbx_ingest_call_records(uuid,jsonb) to service_role;

comment on table public.pbx_call_logs is 'Signed-agent CDR legs. linked_id groups related legs; rows are not necessarily unique conversations. Metadata only, not recordings.';
comment on table public.pbx_trunks is 'Non-secret runtime endpoint ownership. Registering metadata does not provision or authorize outbound calls.';
