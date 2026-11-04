-- PABX Union - secure one-time browser handoff of managed SIP credentials.
-- The SIP password stays on the VPS. PostgreSQL stores only RSA-OAEP ciphertext for up to two minutes.
create table if not exists public.pbx_browser_login_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  extension_id uuid not null references public.pbx_extensions(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  public_key_base64 text not null check (
    char_length(public_key_base64) between 350 and 700
    and public_key_base64 ~ '^[A-Za-z0-9+/]+={0,2}$'
  ),
  status text not null default 'pending'
    check (status in ('pending','ready','consumed','failed')),
  encrypted_secret text check (
    encrypted_secret is null or
    (char_length(encrypted_secret) between 300 and 800
     and encrypted_secret ~ '^[A-Za-z0-9+/]+={0,2}$')
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+ interval '120 seconds'),
  fulfilled_at timestamptz,
  constraint pbx_browser_request_cipher_status check (
    (status='ready' and encrypted_secret is not null) or
    (status <> 'ready' and encrypted_secret is null)
  )
);
create index if not exists pbx_browser_login_pending_idx
  on public.pbx_browser_login_requests(organization_id,status,expires_at)
  where status='pending';
create index if not exists pbx_browser_login_user_recent_idx
  on public.pbx_browser_login_requests(requester_user_id,created_at desc);
alter table public.pbx_browser_login_requests enable row level security;
revoke all on public.pbx_browser_login_requests from public,anon,authenticated;
grant select,insert,update,delete on public.pbx_browser_login_requests to service_role;

create or replace function public.pbx_my_assigned_extension(p_organization_id uuid)
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
   and private.is_platform_organization(ext.organization_id)
   and private.has_organization_permission(ext.organization_id,'pbx.view')
 limit 1;
$$;
revoke all on function public.pbx_my_assigned_extension(uuid) from public,anon,authenticated;
grant execute on function public.pbx_my_assigned_extension(uuid) to authenticated;

create or replace function public.pbx_request_browser_login(
  p_organization_id uuid, p_public_key_base64 text
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_ext uuid;v_request uuid;
begin
 if (select auth.uid()) is null
   or not private.is_platform_organization(p_organization_id)
   or not private.has_organization_permission(p_organization_id,'pbx.view') then
   raise exception 'Sem permissão para solicitar login SIP.' using errcode='42501';
 end if;
 if p_public_key_base64 is null or
    char_length(p_public_key_base64) not between 350 and 700 or
    p_public_key_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' then
   raise exception 'Chave pública inválida.' using errcode='23514';
 end if;
 if not exists(select 1 from public.pbx_agents
   where organization_id=p_organization_id and enabled=true) then
   raise exception 'Agente PABX da VPS ainda não está disponível.' using errcode='23514';
 end if;

 select ext.id into v_ext
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
   organization_id, extension_id, requester_user_id, public_key_base64
 ) values (
   p_organization_id,v_ext,(select auth.uid()),p_public_key_base64
 ) returning id into v_request;
 return v_request;
end;
$$;
revoke all on function public.pbx_request_browser_login(uuid,text) from public,anon,authenticated;
grant execute on function public.pbx_request_browser_login(uuid,text) to authenticated;

create or replace function public.pbx_take_browser_login(p_request_id uuid)
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
   and private.is_platform_organization(r.organization_id)
   and private.has_organization_permission(r.organization_id,'pbx.view')
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
revoke all on function public.pbx_take_browser_login(uuid) from public,anon,authenticated;
grant execute on function public.pbx_take_browser_login(uuid) to authenticated;

-- Zero user-facing table access; only the authenticated, tenant-bound RPCs can transfer ciphertext.

