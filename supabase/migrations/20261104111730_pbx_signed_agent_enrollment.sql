-- PABX Union: outbound, signed provisioning agent identity.
-- This does not change any SIP trunk, dialplan, or existing WebRTC endpoint.
create table if not exists public.pbx_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 2 and 80),
  public_key text not null unique
    check (public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  enabled boolean not null default true,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pbx_agents_org_idx on public.pbx_agents (organization_id,enabled);
alter table public.pbx_agents enable row level security;
revoke all on public.pbx_agents from public,anon,authenticated;
grant select,update on public.pbx_agents to service_role;

-- Only authenticated PBX managers of the Union platform may enroll an agent.
-- A public key is not a password; the private signing key stays only on the VPS.
create or replace function public.pbx_register_agent(
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
     or not private.is_platform_organization(p_organization_id)
     or not private.has_organization_permission(p_organization_id, 'pbx.manage') then
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
revoke all on function public.pbx_register_agent(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pbx_register_agent(uuid,text,text) to authenticated;

create or replace function public.pbx_list_agents(p_organization_id uuid)
returns table(id uuid,label text,enabled boolean,last_seen_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.is_platform_organization(p_organization_id)
     or not private.has_organization_permission(p_organization_id,'pbx.manage') then
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
revoke all on function public.pbx_list_agents(uuid) from public,anon,authenticated;
grant execute on function public.pbx_list_agents(uuid) to authenticated;

create or replace function public.pbx_disable_agent(
 p_organization_id uuid, p_agent_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.is_platform_organization(p_organization_id)
     or not private.has_organization_permission(p_organization_id,'pbx.manage') then
    raise exception 'Sem permissao para revogar agente.' using errcode='42501';
  end if;
  update public.pbx_agents a set enabled=false
  where a.id=p_agent_id and a.organization_id=p_organization_id and a.enabled
  returning a.id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.pbx_disable_agent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_disable_agent(uuid,uuid) to authenticated;

create or replace function public.pbx_retry_extension(
 p_organization_id uuid, p_extension_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.is_platform_organization(p_organization_id)
     or not private.has_organization_permission(p_organization_id,'pbx.manage') then
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
revoke all on function public.pbx_retry_extension(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pbx_retry_extension(uuid,uuid) to authenticated;

