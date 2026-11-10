-- Internal-only tenant admission. No trunks, inbound routes, SIP secrets or audio.
begin;

lock table public.pbx_agents in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.pbx_agents where enabled group by organization_id having count(*)>1) then
  raise exception 'Multiple enabled PBX agents: resolve ownership before migration.' using errcode='23505';
 end if;
end $$;
create unique index pbx_agents_one_enabled_org on public.pbx_agents(organization_id) where enabled;
alter table public.pbx_agents drop constraint pbx_agents_protocol_version_check;
alter table public.pbx_agents add constraint pbx_agents_protocol_version_check check(protocol_version in (1,2,3));
alter table public.pbx_agents add column profile_id uuid, add column profile_context text,
 add column capability_seen_at timestamptz;
alter table public.pbx_agents add constraint pbx_agents_profile_identity check (
 (profile_id is null and profile_context is null) or
 (profile_id is not null and profile_context is not null and
  profile_id=organization_id and profile_context='uwi-'||replace(organization_id::text,'-',''))
);
-- There are deliberately no authenticated table or column grants, nor SELECT policies.
revoke all on public.pbx_agents from public,anon,authenticated;
revoke all (id,organization_id,label,public_key,enabled,last_sequence,last_seen_at,created_at,
 protocol_version,profile_id,profile_context,capability_seen_at) on public.pbx_agents from public,anon,authenticated;

create function private.pbx_org_enabled(p_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations o where o.id=p_organization_id and o.status='active'
  and (private.is_platform_organization(o.id) or exists(
   select 1 from public.organization_modules m join public.system_modules s on s.key=m.module_key
   where m.organization_id=o.id and m.module_key='pbx' and m.is_enabled and s.is_active)));
$$;
revoke all on function private.pbx_org_enabled(uuid) from public,anon,authenticated;

create function private.pbx_has_permission(p_organization_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and p_permission in ('pbx.view','pbx.manage')
  and private.pbx_org_enabled(p_organization_id)
  and exists(select 1 from public.organization_members m where m.organization_id=p_organization_id
   and m.user_id=(select auth.uid()) and m.status='active'
   and (m.role_id is null or exists(select 1 from public.roles r where r.id=m.role_id and r.organization_id=m.organization_id)))
  and private.has_organization_permission(p_organization_id,p_permission);
$$;
revoke all on function private.pbx_has_permission(uuid,text) from public,anon,authenticated;
grant execute on function private.pbx_has_permission(uuid,text) to authenticated;

-- Bootstrap is independent of online status. Preserve the existing role-permission
-- model; explicit per-user denies continue to override these two PBX grants.
create function private.pbx_seed_manager_permissions(p_organization_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p
 where r.organization_id=p_organization_id and r.is_active
  and private.pbx_org_enabled(p_organization_id) and p.key in ('pbx.view','pbx.manage')
  and r.is_system and lower(btrim(r.name))='gestor'
 on conflict do nothing;
 -- Owners may share a non-administrative role. Grant only to the owner through
 -- the existing override model, preserving every explicit allow/deny decision.
 insert into public.user_permission_overrides(organization_id,user_id,permission_id,is_allowed)
 select m.organization_id,m.user_id,p.id,true
 from public.organization_members m cross join public.permissions p
 where m.organization_id=p_organization_id and m.is_owner and m.status='active'
  and private.pbx_org_enabled(p_organization_id) and p.key in ('pbx.view','pbx.manage')
 on conflict(organization_id,user_id,permission_id) do nothing;
end;
$$;
revoke all on function private.pbx_seed_manager_permissions(uuid) from public,anon,authenticated;
create function private.pbx_seed_manager_permissions_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.pbx_seed_manager_permissions(new.organization_id);
 return new;
end;
$$;
revoke all on function private.pbx_seed_manager_permissions_trigger() from public,anon,authenticated;
create trigger pbx_module_permission_bootstrap after insert or update of is_enabled on public.organization_modules
 for each row when (new.module_key='pbx' and new.is_enabled) execute function private.pbx_seed_manager_permissions_trigger();
create trigger pbx_role_permission_bootstrap after insert or update of is_active,name,is_system on public.roles
 for each row execute function private.pbx_seed_manager_permissions_trigger();
create trigger pbx_owner_permission_bootstrap after insert or update of is_owner,role_id,status on public.organization_members
 for each row when (new.is_owner and new.status='active') execute function private.pbx_seed_manager_permissions_trigger();
select private.pbx_seed_manager_permissions(id) from public.organizations where private.pbx_org_enabled(id);

create function private.pbx_agent_runtime_ready(p_agent_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pbx_agents a where a.id=p_agent_id and a.enabled
  and private.pbx_org_enabled(a.organization_id)
  and a.capability_seen_at>now()-interval '95 seconds' and a.capability_seen_at<=now()+interval '5 seconds'
  and ((private.is_platform_organization(a.organization_id) and a.protocol_version=2
    and a.profile_id is null and a.profile_context is null)
   or (not private.is_platform_organization(a.organization_id) and a.protocol_version=3
    and a.profile_id=a.organization_id and a.profile_context='uwi-'||replace(a.organization_id::text,'-',''))));
$$;
revoke all on function private.pbx_agent_runtime_ready(uuid) from public,anon,authenticated;
grant execute on function private.pbx_agent_runtime_ready(uuid) to service_role;

-- Called only by the Edge service after Ed25519 verification and atomic replay
-- advancement. Generic reports never renew the capability lease.
create function private.pbx_admit_agent_request(p_agent_id uuid,p_sequence bigint,p_action text,
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
 return jsonb_build_object('allowed',p_action in ('report','report_login','report_queue','report_calls','report_availability')
  and private.pbx_agent_runtime_ready(a.id),'is_platform',platform);
end;
$$;
revoke all on function private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text) from public,anon,authenticated;
grant execute on function private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text) to service_role;
create function public.pbx_admit_agent_request(p_agent_id uuid,p_sequence bigint,p_action text,
 p_protocol_version integer,p_profile_id text,p_profile_context text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.pbx_admit_agent_request(p_agent_id,p_sequence,p_action,p_protocol_version,p_profile_id,p_profile_context);
$$;
revoke all on function public.pbx_admit_agent_request(uuid,bigint,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.pbx_admit_agent_request(uuid,bigint,text,integer,text,text) to service_role;

alter table public.pbx_browser_login_requests add column agent_id uuid references public.pbx_agents(id) on delete restrict;
create index pbx_browser_login_agent_pending_idx on public.pbx_browser_login_requests(agent_id,expires_at) where status='pending';

create or replace function private.pbx_queue_controls_ready(p_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.pbx_has_permission(p_organization_id,'pbx.manage') and exists(
  select 1 from public.pbx_agents a where a.organization_id=p_organization_id and private.pbx_agent_runtime_ready(a.id));
$$;

-- Fail rather than silently renumber existing data. This reservation closes the
-- extension/queue shadowing race in both directions (900 is the echo service).
do $$ begin
 if exists(select 1 from public.pbx_extensions where number between 850 and 899 or number=900) then
  raise exception 'Reserved PBX extension number already in use.' using errcode='23514';
 end if;
end $$;
alter table public.pbx_extensions add constraint pbx_extensions_internal_reserved_numbers
 check(number not between 850 and 899 and number<>900);

create or replace function private.validate_pbx_extension()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.employee_id is not null and not exists(select 1 from public.employees e
  where e.id=new.employee_id and e.organization_id=new.organization_id and e.is_active) then
  raise exception 'Funcionario de outra empresa ou inativo.' using errcode='23514';
 end if;
 if not private.is_platform_organization(new.organization_id)
  and (not new.is_managed or new.endpoint_name='union-301' or new.provisioning_status='manual') then
  raise exception 'Ramal manual reservado a plataforma.' using errcode='23514';
 end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id
  or new.endpoint_name<>old.endpoint_name or new.is_managed<>old.is_managed or new.number<>old.number) then
  raise exception 'Identidade do ramal imutavel.' using errcode='23514';
 end if;
 new.updated_at=now();
 if tg_op='UPDATE' then
  if old.desired_enabled and not new.desired_enabled and exists(
   select 1 from public.pbx_queue_members m join public.pbx_queues q on q.id=m.queue_id
   where m.extension_id=new.id and q.organization_id=new.organization_id and q.enabled) then
   raise exception 'Remova o ramal das filas ativas antes de desativar.' using errcode='23514';
  end if;
  if not old.is_managed and new.desired_enabled is distinct from old.desired_enabled then
   raise exception 'Ramal manual gerenciado na VPS.' using errcode='23514';
  end if;
  if old.is_managed and (new.display_name is distinct from old.display_name or new.desired_enabled is distinct from old.desired_enabled) then
   new.provisioning_status='pending'; new.last_error=null;
  end if;
 end if;
 return new;
end;
$$;

drop policy pbx_extensions_select on public.pbx_extensions;
create policy pbx_extensions_select on public.pbx_extensions for select to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.view'));
drop policy pbx_extensions_insert on public.pbx_extensions;
create policy pbx_extensions_insert on public.pbx_extensions for insert to authenticated
 with check(private.pbx_has_permission(organization_id,'pbx.manage'));
drop policy pbx_extensions_update on public.pbx_extensions;
create policy pbx_extensions_update on public.pbx_extensions for update to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.manage')) with check(private.pbx_has_permission(organization_id,'pbx.manage'));
drop policy pbx_queues_read on public.pbx_queues;
create policy pbx_queues_read on public.pbx_queues for select to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.manage'));
drop policy pbx_queue_members_read on public.pbx_queue_members;
create policy pbx_queue_members_read on public.pbx_queue_members for select to authenticated using(
 exists(select 1 from public.pbx_queues q join public.pbx_extensions e on e.id=extension_id
  where q.id=queue_id and e.organization_id=q.organization_id and private.pbx_has_permission(q.organization_id,'pbx.manage')));
drop policy pbx_queue_live_manager_select on public.pbx_queue_live_status;
create policy pbx_queue_live_manager_select on public.pbx_queue_live_status for select to authenticated using(
 private.pbx_has_permission(organization_id,'pbx.manage') and exists(select 1 from public.pbx_queues q
  where q.id=queue_id and q.organization_id=pbx_queue_live_status.organization_id));
drop policy pbx_queue_controls_read on public.pbx_queue_member_controls;
create policy pbx_queue_controls_read on public.pbx_queue_member_controls for select to authenticated using(
 private.pbx_has_permission(organization_id,'pbx.manage') and exists(select 1 from public.pbx_queues q
  join public.pbx_extensions e on e.id=extension_id where q.id=queue_id
   and q.organization_id=pbx_queue_member_controls.organization_id and e.organization_id=q.organization_id));
drop policy pbx_call_logs_read on public.pbx_call_logs;
create policy pbx_call_logs_read on public.pbx_call_logs for select to authenticated
 using(private.pbx_has_permission(organization_id,'pbx.view'));


-- Authenticated APIs: invoker facade; tenant authorization stays in private helpers.

alter table public.pbx_browser_login_requests add column requester_employee_id uuid references public.employees(id) on delete set null;

create or replace function private.pbx_register_agent(
  p_organization_id uuid,
  p_label text,
  p_public_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  if (select auth.uid()) is null
     or not private.pbx_has_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissao para registrar agentes do PABX.' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_label,''))) not between 2 and 80 then
    raise exception 'Nome de agente invalido.' using errcode='23514';
  end if;
  if p_public_key is null
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$'
     or octet_length(decode(p_public_key,'base64')) <> 32 then
    raise exception 'Chave publica Ed25519 invalida.' using errcode='23514';
  end if;
  if exists(
    select 1 from public.pbx_agents
    where organization_id=p_organization_id and enabled
  ) then
    raise exception 'Ja existe um agente ativo para esta empresa. Revogue-o antes de cadastrar outro.' using errcode='23505';
  end if;
  insert into public.pbx_agents(organization_id,label,public_key)
  values(p_organization_id,btrim(p_label),p_public_key)
  returning id into v_agent_id;
  return v_agent_id;
end;
$$;

revoke all on function private.pbx_register_agent(uuid,text,text) from public,anon,authenticated;
grant execute on function private.pbx_register_agent(uuid,text,text) to authenticated;

create or replace function public.pbx_register_agent(
  p_organization_id uuid,
  p_label text,
  p_public_key text
)
returns uuid
language sql security invoker set search_path='' as $$
 select private.pbx_register_agent(p_organization_id,p_label,p_public_key);
$$;

revoke all on function public.pbx_register_agent(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pbx_register_agent(uuid,text,text) to authenticated;

create or replace function private.pbx_list_agents(p_organization_id uuid)
returns table(id uuid,label text,enabled boolean,last_seen_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.pbx_has_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissao para consultar os agentes.' using errcode='42501';
  end if;
  return query
    select a.id, a.label, a.enabled, a.last_seen_at
    from public.pbx_agents a
    where a.organization_id=p_organization_id
    order by a.created_at desc
    limit 20;
end;
$$;

revoke all on function private.pbx_list_agents(uuid) from public,anon,authenticated;
grant execute on function private.pbx_list_agents(uuid) to authenticated;

create or replace function public.pbx_list_agents(p_organization_id uuid)
returns table(id uuid,label text,enabled boolean,last_seen_at timestamptz)
language sql security invoker set search_path='' as $$
 select * from private.pbx_list_agents(p_organization_id);
$$;

revoke all on function public.pbx_list_agents(uuid) from public,anon,authenticated;
grant execute on function public.pbx_list_agents(uuid) to authenticated;

create or replace function private.pbx_disable_agent(
 p_organization_id uuid, p_agent_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.pbx_has_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissao para revogar agente.' using errcode='42501';
  end if;
  update public.pbx_agents a set enabled=false,capability_seen_at=null,profile_id=null,profile_context=null
  where a.id=p_agent_id and a.organization_id=p_organization_id and a.enabled
  returning a.id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function private.pbx_disable_agent(uuid,uuid) from public,anon,authenticated;
grant execute on function private.pbx_disable_agent(uuid,uuid) to authenticated;

create or replace function public.pbx_disable_agent(
 p_organization_id uuid, p_agent_id uuid
)
returns boolean
language sql security invoker set search_path='' as $$
 select private.pbx_disable_agent(p_organization_id,p_agent_id);
$$;

revoke all on function public.pbx_disable_agent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_disable_agent(uuid,uuid) to authenticated;

create or replace function private.pbx_retry_extension(
 p_organization_id uuid, p_extension_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.pbx_has_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissao para repetir o provisionamento.' using errcode='42501';
  end if;
  update public.pbx_extensions e
  set provisioning_status='pending',last_error=null
  where e.id=p_extension_id and e.organization_id=p_organization_id
    and e.is_managed and e.provisioning_status='failed'
  returning e.id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function private.pbx_retry_extension(uuid,uuid) from public,anon,authenticated;
grant execute on function private.pbx_retry_extension(uuid,uuid) to authenticated;

create or replace function public.pbx_retry_extension(
 p_organization_id uuid, p_extension_id uuid
)
returns boolean
language sql security invoker set search_path='' as $$
 select private.pbx_retry_extension(p_organization_id,p_extension_id);
$$;

revoke all on function public.pbx_retry_extension(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_retry_extension(uuid,uuid) to authenticated;

create or replace function private.pbx_my_assigned_extension(p_organization_id uuid)
returns table(number integer,endpoint_name text,display_name text,provisioning_status text)
language sql security definer set search_path=''
as $$
 select ext.number,ext.endpoint_name,ext.display_name,ext.provisioning_status
 from public.pbx_extensions ext
 join public.employees employee
   on employee.id=ext.employee_id and employee.organization_id=ext.organization_id
 where ext.organization_id=p_organization_id
   and employee.profile_id=(select auth.uid())
   and employee.is_active
   and ext.is_managed
   and ext.desired_enabled
   and private.pbx_has_permission(ext.organization_id,'pbx.view')
 limit 1;
$$;

revoke all on function private.pbx_my_assigned_extension(uuid) from public,anon,authenticated;
grant execute on function private.pbx_my_assigned_extension(uuid) to authenticated;

create or replace function public.pbx_my_assigned_extension(p_organization_id uuid)
returns table(number integer,endpoint_name text,display_name text,provisioning_status text)
language sql security invoker set search_path='' as $$
 select * from private.pbx_my_assigned_extension(p_organization_id);
$$;

revoke all on function public.pbx_my_assigned_extension(uuid) from public,anon,authenticated;
grant execute on function public.pbx_my_assigned_extension(uuid) to authenticated;

create or replace function private.pbx_request_browser_login(
  p_organization_id uuid, p_public_key_base64 text
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_ext uuid;v_request uuid;v_agent uuid;v_employee uuid;
begin
 if (select auth.uid()) is null
   or not private.pbx_has_permission(p_organization_id,'pbx.view') then
   raise exception 'Sem permissão para solicitar login SIP.' using errcode='42501';
 end if;
 if p_public_key_base64 is null or
    char_length(p_public_key_base64) not between 350 and 700 or
    p_public_key_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' then
   raise exception 'Chave pública inválida.' using errcode='23514';
 end if;
 select id into v_agent from public.pbx_agents where organization_id=p_organization_id and private.pbx_agent_runtime_ready(id);
 if v_agent is null then raise exception 'Agente PABX interno indisponivel.' using errcode='23514'; end if;

 select ext.id,e.id into v_ext,v_employee
 from public.pbx_extensions ext
 join public.employees e
   on e.id=ext.employee_id and e.organization_id=ext.organization_id
 where ext.organization_id=p_organization_id
   and e.profile_id=(select auth.uid()) and e.is_active
   and ext.is_managed and ext.desired_enabled
   and ext.provisioning_status='applied'
 limit 1;

 if v_ext is null then
   raise exception 'Nenhum ramal ativo está vinculado ao seu funcionário.' using errcode='23514';
 end if;
 if exists(
   select 1 from public.pbx_browser_login_requests r
   where r.requester_user_id=(select auth.uid())
     and r.created_at>now()-interval '15 seconds'
 ) or (
   select count(*) from public.pbx_browser_login_requests r
   where r.requester_user_id=(select auth.uid())
     and r.created_at>now()-interval '1 hour'
 ) >= 20 then
   raise exception 'Aguarde antes de solicitar novo acesso ao ramal.' using errcode='23514';
 end if;
 insert into public.pbx_browser_login_requests (
   organization_id, extension_id, requester_user_id, public_key_base64,agent_id,requester_employee_id
 ) values (
   p_organization_id,v_ext,(select auth.uid()),p_public_key_base64,v_agent,v_employee
 ) returning id into v_request;
 return v_request;
end;
$$;

revoke all on function private.pbx_request_browser_login(uuid,text) from public,anon,authenticated;
grant execute on function private.pbx_request_browser_login(uuid,text) to authenticated;

create or replace function public.pbx_request_browser_login(
  p_organization_id uuid, p_public_key_base64 text
)
returns uuid
language sql security invoker set search_path='' as $$
 select private.pbx_request_browser_login(p_organization_id,p_public_key_base64);
$$;

revoke all on function public.pbx_request_browser_login(uuid,text) from public,anon,authenticated;
grant execute on function public.pbx_request_browser_login(uuid,text) to authenticated;

create or replace function private.pbx_take_browser_login(p_request_id uuid)
returns table(status text, encrypted_secret text, endpoint_name text)
language plpgsql security definer set search_path=''
as $$
declare
  v_status text;
  v_secret text;
  v_endpoint text;
begin
 if (select auth.uid()) is null then
   raise exception 'Login requerido.' using errcode='42501';
 end if;
 select r.status,r.encrypted_secret,e.endpoint_name
 into v_status,v_secret,v_endpoint
 from public.pbx_browser_login_requests r
 join public.pbx_extensions e on e.id=r.extension_id
 join public.employees emp on emp.id=e.employee_id and emp.organization_id=e.organization_id
 where r.id=p_request_id
   and r.requester_user_id=(select auth.uid())
   and r.organization_id=e.organization_id
   and r.expires_at>now()
   and e.is_managed and e.desired_enabled and e.provisioning_status='applied'
   and emp.profile_id=(select auth.uid()) and emp.is_active
   and private.pbx_has_permission(r.organization_id,'pbx.view')
   and emp.id=r.requester_employee_id
   and exists(select 1 from public.pbx_agents a where a.id=r.agent_id and a.organization_id=r.organization_id
    and private.pbx_agent_runtime_ready(a.id))
 for update of r;
 if not found then
   return query select 'unavailable'::text,null::text,null::text;
   return;
 end if;
 if v_status='ready' and v_secret is not null then
   update public.pbx_browser_login_requests set
      status='consumed',encrypted_secret=null
   where id=p_request_id;
   return query select 'ready'::text,v_secret,v_endpoint;
 elsif v_status='pending' then
   return query select 'pending'::text,null::text,null::text;
 else
   return query select 'unavailable'::text,null::text,null::text;
 end if;
end;
$$;

revoke all on function private.pbx_take_browser_login(uuid) from public,anon,authenticated;
grant execute on function private.pbx_take_browser_login(uuid) to authenticated;

create or replace function public.pbx_take_browser_login(p_request_id uuid)
returns table(status text, encrypted_secret text, endpoint_name text)
language sql security invoker set search_path='' as $$
 select * from private.pbx_take_browser_login(p_request_id);
$$;

revoke all on function public.pbx_take_browser_login(uuid) from public,anon,authenticated;
grant execute on function public.pbx_take_browser_login(uuid) to authenticated;

create or replace function private.pbx_save_queue(
  p_organization_id uuid,
  p_queue_id uuid,
  p_name text,
  p_test_extension integer,
  p_strategy text,
  p_ring_seconds integer,
  p_max_wait_seconds integer,
  p_enabled boolean,
  p_extension_ids uuid[]
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid;
  v_len integer := coalesce(cardinality(p_extension_ids),0);
  v_valid integer;
begin
  if (select auth.uid()) is null
    or not private.pbx_has_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissão para gerenciar filas.' using errcode='42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80
    or p_test_extension is null or p_test_extension not between 850 and 899
    or p_strategy is null or p_strategy not in ('ringall','rrmemory','linear')
    or p_ring_seconds is null or p_ring_seconds not between 10 and 40
    or p_max_wait_seconds is null or p_max_wait_seconds not between 30 and 300
    or p_enabled is null or v_len>20 or (p_enabled and v_len=0) then
    raise exception 'Configuração da fila inválida.' using errcode='23514';
  end if;
  if exists(select 1 from public.pbx_extensions x
    where x.organization_id=p_organization_id and x.number=p_test_extension) then
    raise exception 'Número da fila já utilizado por um ramal.' using errcode='23505';
  end if;
  if v_len<>(
    select count(distinct x.extension_id)
    from unnest(coalesce(p_extension_ids,array[]::uuid[])) x(extension_id)
  ) then
    raise exception 'Ramais duplicados na fila.' using errcode='23514';
  end if;
  -- Serialize with extension disabling; validate again after acquiring its row lock.
  perform 1 from public.pbx_extensions e
   where e.organization_id=p_organization_id and e.id=any(coalesce(p_extension_ids,array[]::uuid[]))
   order by e.id for update;
  select count(*) into v_valid
    from public.pbx_extensions e
    where e.id=any(coalesce(p_extension_ids,array[]::uuid[]))
      and e.organization_id=p_organization_id
      and e.desired_enabled
      and e.provisioning_status in ('manual','applied');
  if v_valid<>v_len then
    raise exception 'A fila inclui ramal de outra empresa, desativado ou não provisionado.' using errcode='23514';
  end if;

  if p_queue_id is null then
    insert into public.pbx_queues
      (organization_id,name,test_extension,strategy,ring_seconds,max_wait_seconds,enabled)
    values
      (p_organization_id,btrim(p_name),p_test_extension,p_strategy,p_ring_seconds,p_max_wait_seconds,p_enabled)
    returning id into v_id;
  else
    update public.pbx_queues q
    set name=btrim(p_name),test_extension=p_test_extension,
      strategy=p_strategy,ring_seconds=p_ring_seconds,max_wait_seconds=p_max_wait_seconds,
      enabled=p_enabled,provisioning_status='pending',last_error=null,updated_at=now()
    where q.id=p_queue_id and q.organization_id=p_organization_id
    returning q.id into v_id;
    if v_id is null then
      raise exception 'Fila não encontrada nesta empresa.' using errcode='42501';
    end if;
    delete from public.pbx_queue_members where queue_id=v_id;
  end if;

  insert into public.pbx_queue_members(queue_id,extension_id,position)
    select v_id, e.extension_id, e.ord::smallint
    from unnest(coalesce(p_extension_ids,array[]::uuid[])) with ordinality e(extension_id,ord);
  return v_id;
end;
$$;

revoke all on function private.pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function private.pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[]) to authenticated;

create or replace function public.pbx_save_queue(
  p_organization_id uuid,
  p_queue_id uuid,
  p_name text,
  p_test_extension integer,
  p_strategy text,
  p_ring_seconds integer,
  p_max_wait_seconds integer,
  p_enabled boolean,
  p_extension_ids uuid[]
)
returns uuid
language sql security invoker set search_path='' as $$
 select private.pbx_save_queue(p_organization_id,p_queue_id,p_name,p_test_extension,p_strategy,p_ring_seconds,p_max_wait_seconds,p_enabled,p_extension_ids);
$$;

revoke all on function public.pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[]) to authenticated;

create or replace function private.pbx_retry_queue(
  p_organization_id uuid,p_queue_id uuid
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null
    or not private.pbx_has_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissão para repetir provisionamento.' using errcode='42501';
  end if;
  update public.pbx_queues q set provisioning_status='pending',last_error=null,updated_at=now()
  where q.id=p_queue_id and q.organization_id=p_organization_id
    and q.provisioning_status='failed'
  returning q.id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function private.pbx_retry_queue(uuid,uuid) from public,anon,authenticated;
grant execute on function private.pbx_retry_queue(uuid,uuid) to authenticated;

create or replace function public.pbx_retry_queue(
  p_organization_id uuid,p_queue_id uuid
)
returns boolean
language sql security invoker set search_path='' as $$
 select private.pbx_retry_queue(p_organization_id,p_queue_id);
$$;

revoke all on function public.pbx_retry_queue(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_retry_queue(uuid,uuid) to authenticated;

create or replace function private.pbx_available_test_queues(p_organization_id uuid)
returns table(test_extension integer,name text)
language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null
    or not private.pbx_has_permission(p_organization_id,'pbx.view') then
    raise exception 'Sem acesso às filas internas.' using errcode='42501';
  end if;
  return query
    select q.test_extension,q.name
    from public.pbx_queues q
    where q.organization_id=p_organization_id
      and q.enabled and q.provisioning_status='applied'
    order by q.test_extension
    limit 50;
end;
$$;

revoke all on function private.pbx_available_test_queues(uuid) from public,anon,authenticated;
grant execute on function private.pbx_available_test_queues(uuid) to authenticated;

create or replace function public.pbx_available_test_queues(p_organization_id uuid)
returns table(test_extension integer,name text)
language sql security invoker set search_path='' as $$
 select * from private.pbx_available_test_queues(p_organization_id);
$$;

revoke all on function public.pbx_available_test_queues(uuid) from public,anon,authenticated;
grant execute on function public.pbx_available_test_queues(uuid) to authenticated;

create or replace function private.pbx_set_queue_member_paused(p_organization_id uuid,p_queue_id uuid,p_extension_id uuid,p_paused boolean)
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
 select id into strict a from public.pbx_agents where organization_id=p_organization_id and enabled and private.pbx_agent_runtime_ready(id);
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

create or replace function public.pbx_poll_queue_availability(p_agent_id uuid)
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
  where a.id=p_agent_id and a.enabled and private.pbx_agent_runtime_ready(a.id)
   and q.enabled and q.provisioning_status='applied' and e.desired_enabled and e.provisioning_status in ('applied','manual')
  order by c.last_checked_at nulls first,c.updated_at,c.queue_id,c.extension_id limit 10
 ) j;
$$;

create or replace function public.pbx_report_queue_availability(p_agent_id uuid,p_results jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare org uuid; item jsonb; n integer; total integer=0;
begin
 select organization_id into org from public.pbx_agents where id=p_agent_id and enabled and private.pbx_agent_runtime_ready(id);
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

create or replace function public.pbx_ingest_call_records(p_agent_id uuid,p_records jsonb)
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
     -- The readiness guard guarantees that only a partner has a non-null profile.
     if exists(select 1 from public.pbx_agents a where a.id=p_agent_id and a.profile_id is not null)
      and (trunk is not null or endpoint !~ '^uw-[a-f0-9]{32}$'
       or not exists(select 1 from public.pbx_extensions e where e.id=ext_id and e.organization_id=org and e.is_managed)) then
       raise exception 'Parceiro admite somente historico interno gerenciado' using errcode='23514';
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


-- Existing pbx_trunks and inbound-route policies/RPCs remain platform-only.
commit;
