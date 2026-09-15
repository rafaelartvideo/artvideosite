begin;

update public.permissions
set key = 'orders.table.os',
    label = 'OS',
    description = 'Exibe a coluna OS na tabela de ordens de serviço.',
    sort_order = 1010
where key = 'orders.table.protocol';

insert into public.permissions (key, label, description, module_name, sort_order)
values ('orders.table.external_os', 'OS Externa', 'Exibe a coluna OS Externa na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1011)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

update public.permissions
set sort_order = sort_order + 1
where module_name = 'Ordens de Serviço — Tabela'
  and key not in ('orders.table.os', 'orders.table.external_os')
  and sort_order between 1011 and 1099;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, external_permission.id
from public.role_permissions rp
join public.permissions table_permission on table_permission.id = rp.permission_id and table_permission.key = 'orders.table.view'
cross join public.permissions external_permission
where external_permission.key = 'orders.table.external_os'
on conflict do nothing;

commit;
