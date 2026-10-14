-- O Gestor gerencia as novas funcionalidades da empresa, incluindo
-- configuracoes de acesso do Painel do Tecnico, mas as RPCs do Painel
-- continuam mostrando SOMENTE tarefas atribuidas ao proprio funcionario.
begin;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.organizations o on o.id=r.organization_id and o.status='active'
join public.organization_modules m
  on m.organization_id=r.organization_id and m.module_key='orders' and m.is_enabled
join public.permissions p on p.key like 'technician_panel.%'
where lower(btrim(r.name))='gestor'
  and r.is_active
  and private.permission_belongs_to_organization(r.organization_id,p.key)
on conflict (role_id,permission_id) do nothing;

commit;
