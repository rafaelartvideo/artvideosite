SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('private.pbx_disable_agent(uuid,uuid)'::regprocedure)) <> '24a6f370cc06d2cf721dadc7d6979205' THEN RAISE EXCEPTION 'Agent API changed; review before applying'; END IF;
 IF md5(pg_get_functiondef('private.pbx_list_agents(uuid)'::regprocedure)) <> '927d9db2e432dce82696ee1e9f88cd3d' THEN RAISE EXCEPTION 'Agent API changed; review before applying'; END IF;
 IF md5(pg_get_functiondef('private.pbx_register_agent(uuid,text,text)'::regprocedure)) <> 'c286fe6d89178720d1722c8f57637c2e' THEN RAISE EXCEPTION 'Agent API changed; review before applying'; END IF;
END;
$guard$;

-- Administrative authority is independent of membership in the target company.
-- Target membership remains required for all ordinary PBX operations.
CREATE OR REPLACE FUNCTION private.pbx_can_administer_agents(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $admin$
 select (select auth.uid()) is not null
 and exists(select 1 from public.organizations o where o.id=p_organization_id)
 and exists(select 1 from public.organization_members m
   where m.user_id=(select auth.uid()) and m.status='active'
   and private.is_platform_organization(m.organization_id)
   and private.has_effective_organization_permission(m.organization_id,'platform.management.manage'));
$admin$;
REVOKE ALL ON FUNCTION private.pbx_can_administer_agents(uuid) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.pbx_disable_agent(p_organization_id uuid, p_agent_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.pbx_can_administer_agents(p_organization_id) then
    raise exception 'Sem permissao para revogar agente.' using errcode='42501';
  end if;
  update public.pbx_agents a set enabled=false,capability_seen_at=null,profile_id=null,profile_context=null
  where a.id=p_agent_id and a.organization_id=p_organization_id and a.enabled
  returning a.id into v_id;
  return v_id is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.pbx_list_agents(p_organization_id uuid)
 RETURNS TABLE(id uuid, label text, enabled boolean, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null
     or not (private.pbx_can_administer_agents(p_organization_id) or private.pbx_has_permission(p_organization_id,'pbx.manage')) then
    raise exception 'Sem permissao para consultar os agentes.' using errcode='42501';
  end if;
  return query
    select a.id, a.label, a.enabled, a.last_seen_at
    from public.pbx_agents a
    where a.organization_id=p_organization_id
    order by a.created_at desc
    limit 20;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.pbx_register_agent(p_organization_id uuid, p_label text, p_public_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_agent_id uuid;
begin
  if (select auth.uid()) is null
     or not private.pbx_can_administer_agents(p_organization_id) or not private.pbx_org_enabled(p_organization_id) then
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
$function$
;
