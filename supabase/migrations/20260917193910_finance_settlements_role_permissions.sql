begin;

insert into public.role_permissions(role_id, permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions current_permission
  on current_permission.id=rp.permission_id
 and current_permission.key='finance.accounts.manage'
cross join public.permissions target
where target.key in (
  'finance.settlements.create',
  'finance.settlements.reverse',
  'finance.transfers.create'
)
on conflict (role_id,permission_id) do nothing;

commit;
