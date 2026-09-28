-- Alinha o RLS ao modelo de acesso da Union World.
select pg_advisory_xact_lock(hashtextextended('unionworld:align_platform_access_with_target_rls', 0));

create or replace function private.can_manage_own_operation_config(
  p_organization_id uuid,
  p_module_key text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_module_enabled(p_organization_id, p_module_key)
    and private.has_effective_organization_permission(p_organization_id, p_permission_key);
$$;

comment on function private.can_manage_own_operation_config(uuid, text, text) is
  'Permite alterar configuração operacional quando a empresa está acessível, o módulo está habilitado e a permissão efetiva existe, incluindo administração da plataforma sobre empresas acessíveis.';

create or replace function private.can_access_shared_organization_resource(
  p_organization_id uuid,
  p_resource_key text,
  p_required_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and (
      private.is_organization_member(p_organization_id)
      or exists (
        select 1
        from public.organizations target
        where target.id = p_organization_id
          and target.status = 'active'
          and private.has_platform_permission('organizations.view')
      )
      or exists (
        select 1
        from public.organization_data_shares data_share
        where data_share.child_organization_id = p_organization_id
          and private.is_platform_organization(data_share.parent_organization_id)
          and private.has_organization_permission(data_share.parent_organization_id, 'organizations.view')
          and data_share.resource_key = p_resource_key
          and case p_required_access_level
            when 'summary' then data_share.access_level in ('summary', 'read', 'manage')
            when 'read' then data_share.access_level in ('read', 'manage')
            when 'manage' then data_share.access_level = 'manage'
            else false
          end
      )
    );
$$;

comment on function private.can_access_shared_organization_resource(uuid, text, text) is
  'Autoriza membros diretos, administração da plataforma sobre empresas ativas e compartilhamentos explícitos conforme o nível solicitado. A permissão específica do recurso continua sendo validada pelas policies chamadoras.';

drop policy if exists organization_data_shares_insert on public.organization_data_shares;
drop policy if exists organization_data_shares_update on public.organization_data_shares;
drop policy if exists organization_data_shares_delete on public.organization_data_shares;

create policy organization_data_shares_insert
on public.organization_data_shares
for insert to authenticated
with check (
  child_organization_id <> parent_organization_id
  and private.is_platform_organization(parent_organization_id)
  and private.has_effective_organization_permission(child_organization_id, 'organizations.data_shares.manage')
);

create policy organization_data_shares_update
on public.organization_data_shares
for update to authenticated
using (
  private.has_effective_organization_permission(child_organization_id, 'organizations.data_shares.manage')
)
with check (
  child_organization_id <> parent_organization_id
  and private.is_platform_organization(parent_organization_id)
  and private.has_effective_organization_permission(child_organization_id, 'organizations.data_shares.manage')
);

create policy organization_data_shares_delete
on public.organization_data_shares
for delete to authenticated
using (
  private.has_effective_organization_permission(child_organization_id, 'organizations.data_shares.manage')
);
