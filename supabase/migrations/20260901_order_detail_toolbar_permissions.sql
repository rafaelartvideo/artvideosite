-- Permissões independentes para as novas áreas dos detalhes da OS.
insert into public.permissions (key, label, description, module_name, sort_order)
values
  (
    'orders.section.financial',
    'Visualizar valores da OS',
    'Permite visualizar a seção financeira com serviço, peças, subtotal, desconto e valor final.',
    'Ordens de Serviço — Seções',
    1112
  ),
  (
    'orders.toolbar.print_entry',
    'Imprimir entrada de equipamento',
    'Permite visualizar a opção de impressão da entrada do equipamento na barra de ferramentas da OS.',
    'Ordens de Serviço — Barra de ferramentas',
    1113
  ),
  (
    'orders.toolbar.print_exit',
    'Imprimir saída de equipamento',
    'Permite visualizar a opção de impressão da saída do equipamento na barra de ferramentas da OS.',
    'Ordens de Serviço — Barra de ferramentas',
    1114
  )
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Preserva inicialmente o acesso financeiro de quem já visualizava as informações da OS.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, financial_permission.id
from public.role_permissions current_access
join public.permissions information_permission
  on information_permission.id = current_access.permission_id
 and information_permission.key = 'orders.section.information'
cross join public.permissions financial_permission
where financial_permission.key = 'orders.section.financial'
on conflict do nothing;

-- Preserva inicialmente a barra de impressão para quem já visualiza ordens de serviço.
-- Depois, cada opção pode ser removida individualmente em Funções e Permissões.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, toolbar_permission.id
from public.role_permissions current_access
join public.permissions view_permission
  on view_permission.id = current_access.permission_id
 and view_permission.key = 'orders.view'
cross join public.permissions toolbar_permission
where toolbar_permission.key in (
  'orders.toolbar.print_entry',
  'orders.toolbar.print_exit'
)
on conflict do nothing;
