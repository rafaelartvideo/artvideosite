begin;

create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (
      p_key like 'organizations.%'
      and p_key <> 'organizations.audit.view'
    )
    or p_key like 'integrations.%'
    or p_key like 'audit.%';
$$;

revoke all on function private.is_platform_only_permission_key(text) from public;

comment on function private.is_platform_only_permission_key(text)
is 'Permissões reservadas à operação global da plataforma Union World. organizations.audit.view é multiempresa e pertence ao tenant ativo.';

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.organizations organization
  on organization.id = role.organization_id
cross join public.permissions permission
where organization.status = 'active'
  and role.is_active = true
  and lower(btrim(role.name)) = 'gestor'
  and permission.key = 'organizations.audit.view'
on conflict (role_id, permission_id) do nothing;

update public.permissions
set
  label = 'Visualizar auditoria',
  description = 'Consulta o histórico de alterações realizadas nos dados da própria empresa.',
  module_name = 'Auditoria'
where key = 'organizations.audit.view';

commit;
