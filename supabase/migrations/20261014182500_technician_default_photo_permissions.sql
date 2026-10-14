-- A coleta de evidências faz parte da execução técnica padrão.
-- Mantém escopo da OS e do serviço atribuído. A função continua editável
-- em Funções e Permissões; outras funções não são alteradas.
begin;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.organizations organization
  on organization.id=role.organization_id and organization.status='active'
join public.organization_modules module
  on module.organization_id=role.organization_id
 and module.module_key='orders' and module.is_enabled
join public.permissions permission
  on permission.key in ('technician_panel.actions.photo','technician_panel.data.photos')
where role.is_active and lower(btrim(role.name))='técnico'
  and private.permission_belongs_to_organization(role.organization_id,permission.key)
on conflict (role_id,permission_id) do nothing;

commit;
