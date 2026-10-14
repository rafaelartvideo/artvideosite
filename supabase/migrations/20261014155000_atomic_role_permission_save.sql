begin;
-- Salva as permissoes visiveis de um cargo como uma unica transacao.
-- As demais permissoes continuam preservadas, inclusive de modulos desligados.
create or replace function public.save_role_permission_selection_v1(
  p_role_id uuid,
  p_selected_permission_ids uuid[],
  p_visible_permission_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select role_row.organization_id into v_organization_id
  from public.roles role_row
  where role_row.id = p_role_id;

  if v_organization_id is null
    or not private.has_effective_organization_permission(
      v_organization_id, 'roles.permissions.manage'
    ) then
    raise exception 'Sem permissão para gerenciar esta função.' using errcode = '42501';
  end if;

  if p_visible_permission_ids is null or p_selected_permission_ids is null then
    raise exception 'Lista de permissões não carregada.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_selected_permission_ids) selected_id
    where selected_id is null or not selected_id = any(p_visible_permission_ids)
  ) then
    raise exception 'Há permissões fora do catálogo de edição.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(p_visible_permission_ids) permitted_id
    left join public.permissions permission on permission.id = permitted_id
    where permitted_id is null
      or permission.id is null
      or not private.permission_belongs_to_organization(
        v_organization_id, permission.key
      )
  ) then
    raise exception 'O catálogo de permissões está desatualizado. Recarregue a página.'
      using errcode = '42501';
  end if;

  delete from public.role_permissions link
  where link.role_id = p_role_id
    and link.permission_id = any(p_visible_permission_ids)
    and not link.permission_id = any(p_selected_permission_ids);

  insert into public.role_permissions (role_id, permission_id)
  select p_role_id, picked.id
  from (select distinct unnest(p_selected_permission_ids) as id) picked
  on conflict (role_id, permission_id) do nothing;

  select count(*) into v_count
  from public.role_permissions link where link.role_id = p_role_id;
  return v_count;
end;
$$;

revoke all on function public.save_role_permission_selection_v1(uuid,uuid[],uuid[])
from public, anon;
grant execute on function public.save_role_permission_selection_v1(uuid,uuid[],uuid[])
to authenticated;
comment on function public.save_role_permission_selection_v1(uuid,uuid[],uuid[]) is
  'Atualização atômica e restrita das permissões editáveis de uma função. Mantém permissões fora do catálogo exibido.';
commit;
