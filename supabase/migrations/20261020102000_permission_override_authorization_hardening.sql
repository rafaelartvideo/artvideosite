-- Faz a autorização de edição respeitar negações individuais, inclusive no próprio gerente.
CREATE OR REPLACE FUNCTION public.set_user_permission_overrides_v2(p_organization_id uuid, p_user_id uuid, p_granted_ids uuid[] DEFAULT ARRAY[]::uuid[], p_denied_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_can_manage boolean := false;
begin
  v_can_manage := private.has_effective_organization_permission(p_organization_id, 'roles.permissions.manage');

  if not v_can_manage then
    raise exception 'Você não possui permissão para gerenciar acessos individuais.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members target_member
    where target_member.organization_id = p_organization_id
      and target_member.user_id = p_user_id
      and target_member.status = 'active'
  ) then
    raise exception 'Usuário não possui acesso ativo à empresa.';
  end if;

  if exists (select 1 from unnest(coalesce(p_granted_ids, array[]::uuid[])) x where x=any(coalesce(p_denied_ids, array[]::uuid[]))) then
    raise exception 'Uma permissão não pode ser concedida e negada simultaneamente.' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_granted_ids, array[]::uuid[]) || coalesce(p_denied_ids, array[]::uuid[])) permission_id
    left join public.permissions permission on permission.id = permission_id
    where permission.id is null
       or not private.permission_belongs_to_organization(p_organization_id, permission.key)
  ) then
    raise exception 'Uma ou mais permissões informadas não pertencem a esta empresa.';
  end if;

  delete from public.user_permission_overrides
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.user_permission_overrides (organization_id,user_id,permission_id,created_by,is_allowed)
  select distinct p_organization_id,p_user_id,permission_id,(select auth.uid()),true
  from unnest(coalesce(p_granted_ids, array[]::uuid[])) permission_id;

  insert into public.user_permission_overrides (organization_id,user_id,permission_id,created_by,is_allowed)
  select distinct p_organization_id,p_user_id,permission_id,(select auth.uid()),false
  from unnest(coalesce(p_denied_ids, array[]::uuid[])) permission_id;
end;
$function$;
-- Endpoint legado não distingue concessão e negação e não pode restaurar acesso bloqueado.
REVOKE ALL ON FUNCTION public.set_user_permission_overrides(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_permission_overrides_v2(uuid,uuid,uuid[],uuid[]) TO authenticated;
