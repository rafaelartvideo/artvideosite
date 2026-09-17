begin;

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, finance_permission.id
from public.role_permissions existing
join public.permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.key = 'roles.permissions.manage'
cross join public.permissions finance_permission
where finance_permission.key in (
  'finance.receivables.view',
  'finance.receivables.create',
  'finance.receivables.edit',
  'finance.payables.view',
  'finance.payables.create',
  'finance.payables.edit'
)
on conflict (role_id, permission_id) do nothing;

commit;
