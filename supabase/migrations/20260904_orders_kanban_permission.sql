begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values ('orders.kanban.view', 'Visualizar Kanban da OS', 'Permite visualizar o quadro Kanban das ordens de serviço.', 'Ordens de Serviço — Kanban', 1075)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select rp.role_id, child.id
from public.role_permissions rp
join public.permissions parent on parent.id = rp.permission_id and parent.key = 'orders.view'
join public.permissions child on child.key = 'orders.kanban.view'
on conflict (role_id, permission_id) do nothing;

commit;
