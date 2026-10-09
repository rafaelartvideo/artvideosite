-- Restabelece o acesso da função Gestor a todas as operações da Agenda.
-- Não cria permissões para outros cargos e respeita os módulos habilitados
-- por empresa, inclusive a isenção de módulos da operadora Union World.
begin;

insert into public.role_permissions (role_id, permission_id)
select role_record.id, permission_record.id
from public.roles role_record
join public.organizations organization
  on organization.id = role_record.organization_id
cross join public.permissions permission_record
where lower(btrim(role_record.name)) = 'gestor'
  and role_record.is_active = true
  and organization.status = 'active'
  and permission_record.key in (
    'agenda.view',
    'agenda.table.view',
    'agenda.calendar.view',
    'agenda.details.view',
    'agenda.create',
    'agenda.edit',
    'agenda.reschedule',
    'agenda.delete',
    'agenda.view_others'
  )
  and private.permission_belongs_to_organization(
    role_record.organization_id,
    permission_record.key
  )
on conflict (role_id, permission_id) do nothing;

commit;
