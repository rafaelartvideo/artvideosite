begin;
-- O catalogo que a UI exibe usa o MESMO predicado de escopo aplicado
-- ao cadastrar permissoes dos cargos, incluindo modulos contratados e situacoes.
-- SECURITY INVOKER: nao ignora RLS de public.permissions.
grant usage on schema private to authenticated;
grant execute on function private.permission_belongs_to_organization(uuid,text) to authenticated;

create or replace function public.list_organization_permission_catalog_v1(
  p_organization_id uuid
)
returns table (
  id uuid, key text, label text, description text,
  module_name text, sort_order integer
)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.key, p.label, p.description, p.module_name, p.sort_order
  from public.permissions p
  where (select auth.uid()) is not null
    and (
      private.has_effective_organization_permission(p_organization_id, 'roles.view')
      or private.has_effective_organization_permission(p_organization_id, 'roles.permissions.manage')
    )
    and private.permission_belongs_to_organization(p_organization_id, p.key)
  order by p.sort_order nulls last, p.label nulls last, p.key;
$$;

revoke all on function public.list_organization_permission_catalog_v1(uuid)
  from public, anon;
grant execute on function public.list_organization_permission_catalog_v1(uuid)
  to authenticated;
comment on function public.list_organization_permission_catalog_v1(uuid) is
  'Catalogo filtrado pelo escopo real do PostgreSQL, sem replicar regras de permissoes no frontend.';
commit;
