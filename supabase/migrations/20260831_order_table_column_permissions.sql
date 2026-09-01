begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('orders.table.protocol', 'Visualizar coluna Protocolo', 'Exibe o número/protocolo na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1201),
  ('orders.table.customer', 'Visualizar coluna Cliente', 'Exibe o cliente e telefone na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1202),
  ('orders.table.service_type', 'Visualizar coluna Tipo de atendimento', 'Exibe o tipo de atendimento ou serviço na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1203),
  ('orders.table.equipment', 'Visualizar coluna Equipamento', 'Exibe o equipamento vinculado à própria OS, sem liberar o módulo Equipamentos.', 'Ordens de Serviço — Tabela', 1204),
  ('orders.table.priority', 'Visualizar coluna Prioridade', 'Exibe a prioridade na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1205),
  ('orders.table.scheduled_at', 'Visualizar coluna Agendamento', 'Exibe a data de agendamento na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1206),
  ('orders.table.status', 'Visualizar coluna Status', 'Exibe o status e o resultado da OS na tabela.', 'Ordens de Serviço — Tabela', 1207),
  ('orders.table.situation', 'Visualizar coluna Situação', 'Exibe a situação atual na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1208),
  ('orders.table.actions', 'Visualizar coluna Ações', 'Exibe as ações permitidas na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1209)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Preserva inicialmente a tabela atual para toda função que já visualiza OS.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, table_permission.id
from public.role_permissions current_access
join public.permissions view_permission
  on view_permission.id = current_access.permission_id
 and view_permission.key = 'orders.view'
cross join public.permissions table_permission
where table_permission.key like 'orders.table.%'
on conflict (role_id, permission_id) do nothing;

-- Cliente exibido na tabela da OS é independente do módulo Clientes.
drop policy if exists customers_order_sections_view on public.customers;
create policy customers_order_sections_view
on public.customers
as permissive
for select
to authenticated
using (
  (
    private.has_permission('orders.section.customer')
    or private.has_permission('orders.section.address')
    or private.has_permission('orders.table.customer')
  )
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.customer_id = customers.id
      and private.can_view_service_order(service_order.id)
  )
);

-- Tipo de atendimento exibido na tabela é independente do módulo de configuração.
drop policy if exists service_types_order_table_view on public.service_types;
create policy service_types_order_table_view
on public.service_types
as permissive
for select
to authenticated
using (
  private.has_permission('orders.table.service_type')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.service_type_id = service_types.id
      and private.can_view_service_order(service_order.id)
  )
);

drop policy if exists general_services_order_table_view on public.general_services;
create policy general_services_order_table_view
on public.general_services
as permissive
for select
to authenticated
using (
  private.has_permission('orders.table.service_type')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.general_service_id = general_services.id
      and private.can_view_service_order(service_order.id)
  )
);

drop policy if exists services_order_table_view on public.services;
create policy services_order_table_view
on public.services
as permissive
for select
to authenticated
using (
  private.has_permission('orders.table.service_type')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.service_id = services.id
      and private.can_view_service_order(service_order.id)
  )
);

-- Equipamento da OS é independente de equipment.view.
drop policy if exists equipment_types_order_table_view on public.equipment_types;
create policy equipment_types_order_table_view
on public.equipment_types
as permissive
for select
to authenticated
using (
  private.has_permission('orders.table.equipment')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.equipment_type_id = equipment_types.id
      and private.can_view_service_order(service_order.id)
  )
);

drop policy if exists equipment_brands_order_table_view on public.equipment_brands;
create policy equipment_brands_order_table_view
on public.equipment_brands
as permissive
for select
to authenticated
using (
  private.has_permission('orders.table.equipment')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.equipment_brand_id = equipment_brands.id
      and private.can_view_service_order(service_order.id)
  )
);

drop policy if exists equipment_models_order_table_view on public.equipment_models;
create policy equipment_models_order_table_view
on public.equipment_models
as permissive
for select
to authenticated
using (
  private.has_permission('orders.table.equipment')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.equipment_model_id = equipment_models.id
      and private.can_view_service_order(service_order.id)
  )
);

grant select on public.customers to authenticated;
grant select on public.service_types to authenticated;
grant select on public.general_services to authenticated;
grant select on public.services to authenticated;
grant select on public.equipment_types to authenticated;
grant select on public.equipment_brands to authenticated;
grant select on public.equipment_models to authenticated;

commit;
