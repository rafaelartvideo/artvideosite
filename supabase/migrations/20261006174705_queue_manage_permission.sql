begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values (
  'queue.manage',
  'Gerenciar Union Senhas',
  'Permite ativar, desativar e alterar as configurações da integração com o Union Senhas.',
  'Union Fila — Configurações',
  5011
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct role_permission.role_id, queue_manage.id
from public.role_permissions role_permission
join public.permissions source_permission
  on source_permission.id = role_permission.permission_id
 and source_permission.key = 'settings.update'
join public.roles role
  on role.id = role_permission.role_id
join public.organization_modules organization_module
  on organization_module.organization_id = role.organization_id
 and organization_module.module_key = 'queue'
 and organization_module.is_enabled
cross join public.permissions queue_manage
where queue_manage.key = 'queue.manage'
  and exists (
    select 1
    from public.role_permissions queue_access
    join public.permissions queue_access_permission
      on queue_access_permission.id = queue_access.permission_id
    where queue_access.role_id = role.id
      and queue_access_permission.key = 'queue.view'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.user_permission_overrides (
  organization_id,
  user_id,
  permission_id,
  created_by
)
select distinct
  override_permission.organization_id,
  override_permission.user_id,
  queue_manage.id,
  override_permission.created_by
from public.user_permission_overrides override_permission
join public.permissions source_permission
  on source_permission.id = override_permission.permission_id
 and source_permission.key = 'settings.update'
join public.organization_modules organization_module
  on organization_module.organization_id = override_permission.organization_id
 and organization_module.module_key = 'queue'
 and organization_module.is_enabled
cross join public.permissions queue_manage
where queue_manage.key = 'queue.manage'
on conflict (organization_id, user_id, permission_id) do nothing;

drop policy if exists queue_integration_settings_insert on public.queue_integration_settings;
create policy queue_integration_settings_insert
on public.queue_integration_settings
for insert to authenticated
with check (
  private.can_access_organization(organization_id)
  and private.has_effective_organization_permission(organization_id, 'queue.manage')
);

drop policy if exists queue_integration_settings_update on public.queue_integration_settings;
create policy queue_integration_settings_update
on public.queue_integration_settings
for update to authenticated
using (
  private.can_access_organization(organization_id)
  and private.has_effective_organization_permission(organization_id, 'queue.manage')
)
with check (
  private.can_access_organization(organization_id)
  and private.has_effective_organization_permission(organization_id, 'queue.manage')
);

comment on policy queue_integration_settings_insert on public.queue_integration_settings
is 'Somente usuários com queue.manage podem criar as configurações da integração Union Senhas.';

comment on policy queue_integration_settings_update on public.queue_integration_settings
is 'Somente usuários com queue.manage podem alterar, ativar ou desativar a integração Union Senhas.';

commit;
