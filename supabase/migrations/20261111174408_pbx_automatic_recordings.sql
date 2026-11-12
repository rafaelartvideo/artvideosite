-- Automatic per-organization policy; inert until an authorized, acknowledged save.
begin;
insert into public.permissions(key,label,description,module_name,sort_order) values
('pbx.recordings.manage','Gerenciar gravações','Configurar gravação automática por empresa.','pbx',5030),
('pbx.recordings.view','Ouvir gravações','Consultar e ouvir gravações autorizadas.','pbx',5031) on conflict(key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p.id from public.role_permissions rp join public.permissions prior_permission on prior_permission.id=rp.permission_id and prior_permission.key='pbx.manage' cross join public.permissions p where p.key in ('pbx.recordings.manage','pbx.recordings.view') on conflict do nothing;
insert into public.user_permission_overrides(organization_id,user_id,permission_id,is_allowed)
select m.organization_id,m.user_id,p.id,true from public.organization_members m cross join public.permissions p where m.is_owner and m.status='active' and p.key in ('pbx.recordings.manage','pbx.recordings.view') on conflict do nothing;
-- Preserve explicit user denies while bootstrapping future owners/manager roles.
create function private.pbx_seed_recording_permissions() returns trigger language plpgsql security definer set search_path='' as $$begin
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p.id from public.role_permissions rp join public.permissions prior_permission on prior_permission.id=rp.permission_id and prior_permission.key='pbx.manage' join public.roles r on r.id=rp.role_id cross join public.permissions p where r.organization_id=new.organization_id and p.key in ('pbx.recordings.manage','pbx.recordings.view') on conflict do nothing;
insert into public.user_permission_overrides(organization_id,user_id,permission_id,is_allowed)
select m.organization_id,m.user_id,p.id,true from public.organization_members m cross join public.permissions p where m.organization_id=new.organization_id and m.is_owner and m.status='active' and p.key in ('pbx.recordings.manage','pbx.recordings.view') on conflict do nothing;
return new;end;$$;
revoke all on function private.pbx_seed_recording_permissions() from public,anon,authenticated;
create trigger pbx_recording_owner_bootstrap after insert or update of is_owner,role_id,status on public.organization_members for each row execute function private.pbx_seed_recording_permissions();
create trigger pbx_recording_role_bootstrap after insert or update of is_active,name,is_system on public.roles for each row execute function private.pbx_seed_recording_permissions();
create trigger pbx_recording_module_bootstrap after insert or update of is_enabled on public.organization_modules for each row when(new.module_key='pbx' and new.is_enabled) execute function private.pbx_seed_recording_permissions();
create function private.pbx_seed_recording_manager_grant() returns trigger language plpgsql security definer set search_path='' as $$begin
if exists(select 1 from public.permissions where id=new.permission_id and key='pbx.manage') then
insert into public.role_permissions(role_id,permission_id) select new.role_id,id from public.permissions where key in ('pbx.recordings.manage','pbx.recordings.view') on conflict do nothing;
end if;return new;end;$$;
revoke all on function private.pbx_seed_recording_manager_grant() from public,anon,authenticated;
create trigger pbx_recording_manager_grant after insert on public.role_permissions for each row execute function private.pbx_seed_recording_manager_grant();
create function private.pbx_recording_permission(org uuid,permission text) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and permission in ('pbx.recordings.manage','pbx.recordings.view') and private.pbx_org_enabled(org) and exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.status='active' and (m.role_id is null or exists(select 1 from public.roles r where r.id=m.role_id and r.organization_id=org))) and private.has_organization_permission(org,permission);$$;
create table public.pbx_recording_policies(
 organization_id uuid primary key references public.organizations(id),revision uuid not null unique default gen_random_uuid(),enabled boolean not null default false,
 scopes text[] not null default array['internal','inbound','outbound']::text[] check(scopes <@ array['internal','inbound','outbound']::text[] and (not enabled or cardinality(scopes)>0)),
 notice_enabled boolean not null default true,notice_prompt_id uuid references public.pbx_audio_prompts(id),purpose text not null default '',legal_basis text check(legal_basis in ('consent','contract','legal_obligation','legitimate_interest')),information_reference text not null default '',
 retention_days integer not null default 30 check(retention_days between 1 and 90),quota_bytes bigint not null default 1073741824 check(quota_bytes between 67108864 and 10737418240),max_duration_seconds integer not null default 3600 check(max_duration_seconds between 300 and 7200),
 status text not null default 'pending' check(status in ('pending','applied','failed')),error text,updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id));
alter table public.pbx_recording_policies enable row level security;
revoke all on public.pbx_recording_policies from public,anon,authenticated;
create table private.pbx_recording_policy_versions(revision uuid primary key,organization_id uuid not null references public.organizations(id),policy jsonb not null,created_at timestamptz not null default now());
create table private.pbx_recording_capabilities(agent_id uuid primary key references public.pbx_agents(id),organization_id uuid not null,poll_sequence bigint not null,seen_at timestamptz not null,enabled boolean not null);
create function private.pbx_recording_ready(agent uuid) returns boolean language sql stable security definer set search_path='' as $$select private.pbx_agent_runtime_ready(agent) and exists(select 1 from private.pbx_recording_capabilities c join public.pbx_agents a on a.id=c.agent_id where a.id=agent and c.organization_id=a.organization_id and c.enabled and c.seen_at>now()-interval '95 seconds' and c.seen_at<=now()+interval '5 seconds');$$;
create function private.pbx_admit_recording_poll(p_agent_id uuid,p_sequence bigint,p_features jsonb) returns boolean language plpgsql security definer set search_path='' as $$declare a public.pbx_agents%rowtype; ok boolean;begin
select * into a from public.pbx_agents where id=p_agent_id for update;
if not found or not private.pbx_agent_runtime_ready(a.id) or p_sequence is null or p_sequence<=0 or a.last_sequence is distinct from p_sequence or a.capability_seen_at<now()-interval '5 seconds' or exists(select 1 from private.pbx_recording_capabilities where agent_id=a.id and poll_sequence>=p_sequence) then return false;end if;
ok=coalesce(jsonb_typeof(p_features)='array' and p_features ? 'recordings_v1',false);
insert into private.pbx_recording_capabilities values(a.id,a.organization_id,p_sequence,now(),ok) on conflict(agent_id) do update set organization_id=excluded.organization_id,poll_sequence=excluded.poll_sequence,seen_at=excluded.seen_at,enabled=excluded.enabled;return ok;end;$$;
create function private.pbx_get_recording_policy(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
if not private.pbx_recording_permission(p_organization_id,'pbx.recordings.manage') then raise exception 'Forbidden' using errcode='42501';end if;
select to_jsonb(p) into result from public.pbx_recording_policies p where organization_id=p_organization_id;return coalesce(result,jsonb_build_object('organization_id',p_organization_id,'enabled',false))||jsonb_build_object('runtime_ready',exists(select 1 from public.pbx_agents a where a.organization_id=p_organization_id and private.pbx_recording_ready(a.id)));end;$$;
create function private.pbx_save_recording_policy(p_organization_id uuid,p_policy jsonb,p_acknowledged boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.pbx_recording_policies%rowtype;begin
if not private.pbx_recording_permission(p_organization_id,'pbx.recordings.manage') then raise exception 'Forbidden' using errcode='42501';end if;
perform 1 from public.organizations where id=p_organization_id for update;
select * into p from jsonb_populate_record(null::public.pbx_recording_policies,jsonb_build_object('enabled',false,'scopes',array['internal','inbound','outbound'],'notice_enabled',true,'purpose','','information_reference','','retention_days',30,'quota_bytes',1073741824,'max_duration_seconds',3600)||p_policy);
p.organization_id=p_organization_id;p.revision=gen_random_uuid();p.status='pending';p.error=null;p.updated_at=clock_timestamp();p.updated_by=auth.uid();
if p.notice_prompt_id is not null and not exists(select 1 from public.pbx_audio_prompts where id=p.notice_prompt_id and organization_id=p_organization_id and status='uploaded') then raise exception 'Invalid notice prompt';end if;
if p.enabled and p.notice_enabled and p.notice_prompt_id is null then raise exception 'Recording notice prompt required';end if;
if p.enabled and (p_acknowledged is distinct from true or nullif(btrim(p.purpose),'') is null or p.legal_basis is null or nullif(btrim(p.information_reference),'') is null or not exists(select 1 from public.pbx_agents a where a.organization_id=p_organization_id and private.pbx_recording_ready(a.id))) then raise exception 'Recording activation requirements not met';end if;
insert into public.pbx_recording_policies select p.* on conflict(organization_id) do update set revision=excluded.revision,enabled=excluded.enabled,scopes=excluded.scopes,notice_enabled=excluded.notice_enabled,notice_prompt_id=excluded.notice_prompt_id,purpose=excluded.purpose,legal_basis=excluded.legal_basis,information_reference=excluded.information_reference,retention_days=excluded.retention_days,quota_bytes=excluded.quota_bytes,max_duration_seconds=excluded.max_duration_seconds,status='pending',error=null,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
insert into private.pbx_recording_policy_versions values(p.revision,p.organization_id,to_jsonb(p),p.updated_at);return to_jsonb(p)||jsonb_build_object('runtime_ready',exists(select 1 from public.pbx_agents a where a.organization_id=p_organization_id and private.pbx_recording_ready(a.id)));end;$$;
create function private.pbx_poll_recording_policy(p_agent_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(p)||jsonb_build_object('notice_prompt',(select jsonb_build_object('id',x.id,'storage_path',x.storage_path,'sha256',x.sha256,'size_bytes',x.size_bytes,'duration_seconds',x.duration_seconds) from public.pbx_audio_prompts x where x.id=p.notice_prompt_id and x.organization_id=p.organization_id and x.status='uploaded')) from public.pbx_recording_policies p join public.pbx_agents a on a.organization_id=p.organization_id where a.id=p_agent_id and private.pbx_recording_ready(a.id);$$;
create function private.pbx_report_recording_policy(p_agent_id uuid,p_revision uuid,p_status text,p_error text) returns boolean language plpgsql security definer set search_path='' as $$begin
if not private.pbx_recording_ready(p_agent_id) or p_status not in ('applied','failed') then return false;end if;
update public.pbx_recording_policies p set status=p_status,error=case when p_status='failed' then 'Recording policy application failed' else null end from public.pbx_agents a where a.id=p_agent_id and a.organization_id=p.organization_id and p.revision=p_revision and p.status='pending';return found;end;$$;
create table public.pbx_call_recordings(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),agent_id uuid not null references public.pbx_agents(id),call_log_id uuid not null references public.pbx_call_logs(id),event_id text not null,policy_revision uuid not null references private.pbx_recording_policy_versions(revision),scope text not null check(scope in ('internal','inbound','outbound')),size_bytes bigint not null check(size_bytes between 44 and 134217728),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),duration_seconds numeric not null check(duration_seconds>0),storage_path text not null unique,status text not null default 'uploading' check(status in ('uploading','ready','purging','deleted')),expires_at timestamptz not null,created_at timestamptz not null default now(),unique(agent_id,event_id,scope),check(storage_path=organization_id::text||'/'||id::text||'.wav'));
alter table public.pbx_call_recordings enable row level security;
revoke all on public.pbx_call_recordings from public,anon,authenticated;
create index pbx_recordings_org_expiry on public.pbx_call_recordings(organization_id,expires_at);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pbx-call-recordings','pbx-call-recordings',false,134217728,array['audio/wav']);
-- Restrictive guard also defeats unrelated broad pre-existing Storage policies.
create policy pbx_recordings_no_browser_storage on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'pbx-call-recordings') with check(bucket_id<>'pbx-call-recordings');
create function private.pbx_prepare_recording_upload(p_agent_id uuid,p_record jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.pbx_agents%rowtype;c public.pbx_call_logs%rowtype;v private.pbx_recording_policy_versions%rowtype;r public.pbx_call_recordings%rowtype;old public.pbx_call_recordings%rowtype;begin
select * into a from public.pbx_agents where id=p_agent_id;if not found or not private.pbx_recording_ready(a.id) then raise exception 'Agent not ready';end if;
perform 1 from public.organizations where id=a.organization_id for update;
select * into c from public.pbx_call_logs where ((p_record->>'call_log_id') is null or id=(p_record->>'call_log_id')::uuid) and organization_id=a.organization_id and agent_id=a.id and event_id=p_record->>'event_id';if not found or c.direction is distinct from p_record->>'scope' or c.answered_at is null or c.disposition<>'ANSWERED' then raise exception 'Invalid exact call attribution';end if;
select * into v from private.pbx_recording_policy_versions where revision=(p_record->>'policy_revision')::uuid and organization_id=a.organization_id;
if not found or (v.policy->>'enabled')::boolean is distinct from true or not (v.policy->'scopes' ? c.direction) or c.started_at<v.created_at or c.ended_at>now()+interval '5 seconds' or exists(select 1 from private.pbx_recording_policy_versions newer where newer.organization_id=v.organization_id and newer.created_at>v.created_at and newer.created_at<=c.started_at) then raise exception 'Invalid recording policy';end if;
r.id=gen_random_uuid();r.organization_id=a.organization_id;r.agent_id=a.id;r.call_log_id=c.id;r.event_id=c.event_id;r.policy_revision=v.revision;r.scope=c.direction;r.size_bytes=(p_record->>'size_bytes')::bigint;r.sha256=p_record->>'sha256';r.duration_seconds=(p_record->>'duration_seconds')::numeric;r.expires_at=c.ended_at+make_interval(days=>(v.policy->>'retention_days')::int);r.storage_path=a.organization_id::text||'/'||r.id::text||'.wav';r.status='uploading';r.created_at=now();
if r.expires_at<=now() or r.duration_seconds is null or r.duration_seconds<=0 or r.duration_seconds>least((v.policy->>'max_duration_seconds')::int,c.duration_seconds) then raise exception 'Invalid recording duration or expiry';end if;
select * into old from public.pbx_call_recordings where agent_id=a.id and event_id=c.event_id and scope=c.direction;
if found then if old.call_log_id is distinct from r.call_log_id or old.policy_revision is distinct from r.policy_revision or old.size_bytes is distinct from r.size_bytes or old.sha256 is distinct from r.sha256 or old.duration_seconds is distinct from r.duration_seconds or old.status not in ('uploading','ready') then raise exception 'Recording conflict';end if;return to_jsonb(old);end if;
if coalesce((select sum(size_bytes) from public.pbx_call_recordings where organization_id=a.organization_id and status<>'deleted'),0)+r.size_bytes>least((v.policy->>'quota_bytes')::bigint,coalesce((select quota_bytes from public.pbx_recording_policies where organization_id=a.organization_id),(v.policy->>'quota_bytes')::bigint)) then raise exception 'Recording quota exceeded';end if;
insert into public.pbx_call_recordings select r.*;return to_jsonb(r);end;$$;
create function private.pbx_finish_recording_upload(p_agent_id uuid,p_recording_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
if not private.pbx_recording_ready(p_agent_id) then return false;end if;
update public.pbx_call_recordings r set status='ready' from public.pbx_agents a where a.id=p_agent_id and r.agent_id=a.id and r.organization_id=a.organization_id and r.id=p_recording_id and r.status='uploading' and r.expires_at>now() and exists(select 1 from storage.objects o where o.bucket_id='pbx-call-recordings' and o.name=r.storage_path and o.metadata->>'size'=r.size_bytes::text);return found;end;$$;
create function private.pbx_list_recordings(p_organization_id uuid,p_limit int default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
if not private.pbx_recording_permission(p_organization_id,'pbx.recordings.view') then raise exception 'Forbidden' using errcode='42501';end if;
select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (select r.id,r.call_log_id,r.event_id,r.policy_revision,r.scope,r.size_bytes,r.duration_seconds,r.status,r.expires_at,c.started_at,c.ended_at,c.source,c.destination,c.direction from public.pbx_call_recordings r join public.pbx_call_logs c on c.id=r.call_log_id and c.organization_id=r.organization_id and c.agent_id=r.agent_id where r.organization_id=p_organization_id and r.status='ready' and r.expires_at>now() order by c.started_at desc,r.id limit greatest(1,least(coalesce(p_limit,50),100))) x;return result;end;$$;
create function private.pbx_authorize_recording_playback(p_recording_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('path',storage_path,'expires_at',expires_at) from public.pbx_call_recordings r where id=p_recording_id and status='ready' and expires_at>now() and private.pbx_recording_permission(r.organization_id,'pbx.recordings.view');$$;
-- The always-on platform worker performs expiry housekeeping for offline or
-- disabled companies too. Partner agents can purge only their own expired rows.
create function private.pbx_claim_recording_purge(p_agent_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; platform_worker boolean; result jsonb;
begin
 select a.organization_id,(private.is_platform_organization(a.organization_id) and a.protocol_version=2 and a.profile_id is null)
 into org,platform_worker from public.pbx_agents a where a.id=p_agent_id and private.pbx_agent_runtime_ready(a.id) and
  ((private.is_platform_organization(a.organization_id) and a.protocol_version=2 and a.profile_id is null) or private.pbx_recording_ready(a.id));
 if org is null then return '[]'::jsonb;end if;
 with jobs as (
  select id from public.pbx_call_recordings
  where (platform_worker or (organization_id=org and agent_id=p_agent_id))
   and expires_at<=now() and status in ('uploading','ready','purging')
  order by expires_at limit 10 for update skip locked
 ), claimed as (
  update public.pbx_call_recordings r set status='purging' from jobs
  where r.id=jobs.id returning r.id,r.organization_id,r.storage_path
 ) select coalesce(jsonb_agg(claimed),'[]'::jsonb) into result from claimed;
 return result;
end;$$;
create function private.pbx_finish_recording_purge(p_agent_id uuid,p_recording_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not private.pbx_agent_runtime_ready(p_agent_id) then return false;end if;
 update public.pbx_call_recordings r set status='deleted' from public.pbx_agents a
 where a.id=p_agent_id and (
  (r.organization_id=a.organization_id and r.agent_id=a.id and private.pbx_recording_ready(a.id)) or
  (private.is_platform_organization(a.organization_id) and a.protocol_version=2 and a.profile_id is null))
 and r.id=p_recording_id and r.status='purging' and r.expires_at<=now()
 and not exists(select 1 from storage.objects o where o.bucket_id='pbx-call-recordings' and o.name=r.storage_path);
 return found;
end;$$;
-- Public entrypoints are invokers; privileged implementations stay private.
do $wrappers$
declare f record;audience text;
begin
for f in select * from (values
('pbx_get_recording_policy','p_organization_id uuid','p_organization_id','jsonb',true),
('pbx_save_recording_policy','p_organization_id uuid,p_policy jsonb,p_acknowledged boolean','p_organization_id,p_policy,p_acknowledged','jsonb',true),
('pbx_list_recordings','p_organization_id uuid,p_limit int default 50','p_organization_id,p_limit','jsonb',true),
('pbx_authorize_recording_playback','p_recording_id uuid','p_recording_id','jsonb',true),
('pbx_admit_recording_poll','p_agent_id uuid,p_sequence bigint,p_features jsonb','p_agent_id,p_sequence,p_features','boolean',false),
('pbx_poll_recording_policy','p_agent_id uuid','p_agent_id','jsonb',false),
('pbx_report_recording_policy','p_agent_id uuid,p_revision uuid,p_status text,p_error text','p_agent_id,p_revision,p_status,p_error','boolean',false),
('pbx_prepare_recording_upload','p_agent_id uuid,p_record jsonb','p_agent_id,p_record','jsonb',false),
('pbx_finish_recording_upload','p_agent_id uuid,p_recording_id uuid','p_agent_id,p_recording_id','boolean',false),
('pbx_claim_recording_purge','p_agent_id uuid','p_agent_id','jsonb',false),
('pbx_finish_recording_purge','p_agent_id uuid,p_recording_id uuid','p_agent_id,p_recording_id','boolean',false)
) as functions(name,args,params,result,browser)
loop
execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as %L',f.name,f.args,f.result,'select private.'||f.name||'('||f.params||');');
audience=case when f.browser then 'authenticated,service_role' else 'service_role' end;
-- Resolve signatures through catalogs so defaults and argument names cannot affect ACLs.
execute format('revoke all on function %s from public,anon,authenticated', (select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=f.name));
execute format('revoke all on function %s from public,anon,authenticated', (select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.name));
execute format('grant execute on function %s to %s',(select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=f.name),audience);
execute format('grant execute on function %s to %s',(select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.name),audience);
end loop;
end;$wrappers$;
revoke all on function private.pbx_recording_permission(uuid,text),private.pbx_recording_ready(uuid) from public,anon,authenticated;
alter table private.pbx_recording_policy_versions enable row level security;
alter table private.pbx_recording_capabilities enable row level security;
revoke all on private.pbx_recording_policy_versions,private.pbx_recording_capabilities from public,anon,authenticated;
commit;
