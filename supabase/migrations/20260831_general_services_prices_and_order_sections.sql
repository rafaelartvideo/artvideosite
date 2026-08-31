begin;

-- Valor e desconto pertencem aos Serviços Gerais da operação.
alter table public.general_services
  add column if not exists price numeric,
  add column if not exists max_discount_percentage numeric(5,2);

alter table public.general_services
  drop constraint if exists general_services_price_check;
alter table public.general_services
  add constraint general_services_price_check
  check (price is null or price >= 0);

alter table public.general_services
  drop constraint if exists general_services_max_discount_percentage_check;
alter table public.general_services
  add constraint general_services_max_discount_percentage_check
  check (max_discount_percentage is null or max_discount_percentage between 0 and 100);

-- Remove o campo criado no módulo incorreto de Serviços do site.
alter table public.services
  drop constraint if exists services_max_discount_percentage_check;
alter table public.services
  drop column if exists max_discount_percentage;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('orders.section.customer', 'Visualizar cliente da OS', 'Permite visualizar a seção Cliente nos detalhes e formulários da ordem de serviço.', 'Ordens de Serviço — Seções', 1101),
  ('orders.section.address', 'Visualizar endereço da OS', 'Permite visualizar os dados de endereço do cliente na ordem de serviço.', 'Ordens de Serviço — Seções', 1102),
  ('orders.section.equipment', 'Visualizar equipamento da OS', 'Permite visualizar a seção Equipamento da ordem de serviço.', 'Ordens de Serviço — Seções', 1103),
  ('orders.section.service_location', 'Visualizar local do atendimento', 'Permite visualizar o local e o endereço externo do atendimento.', 'Ordens de Serviço — Seções', 1104),
  ('orders.section.information', 'Visualizar informações da OS', 'Permite visualizar as informações gerais, responsáveis, datas, status e valores da OS.', 'Ordens de Serviço — Seções', 1105),
  ('orders.section.images', 'Visualizar imagens da OS', 'Permite visualizar imagens da abertura e da solução da OS.', 'Ordens de Serviço — Seções', 1106),
  ('orders.section.history', 'Visualizar histórico da OS', 'Permite visualizar o histórico de alterações e status da OS.', 'Ordens de Serviço — Seções', 1107),
  ('orders.section.internal_notes', 'Visualizar observações internas', 'Permite visualizar observações internas da ordem de serviço.', 'Ordens de Serviço — Seções', 1108),
  ('orders.section.problem', 'Visualizar descrição do problema', 'Permite visualizar a descrição informada pelo cliente.', 'Ordens de Serviço — Seções', 1109),
  ('orders.section.parts', 'Visualizar solicitações de peças', 'Permite visualizar pedidos, quantidades, wizard e custódia das peças da OS.', 'Ordens de Serviço — Seções', 1110),
  ('orders.section.solution', 'Visualizar solução da OS', 'Permite visualizar diagnóstico, solução, resultado e produtos utilizados.', 'Ordens de Serviço — Seções', 1111)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Preserva o comportamento atual: toda função que já visualiza OS recebe inicialmente
-- todas as seções. O administrador poderá removê-las individualmente depois.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, section_permission.id
from public.role_permissions current_access
join public.permissions view_permission
  on view_permission.id = current_access.permission_id
 and view_permission.key = 'orders.view'
cross join public.permissions section_permission
where section_permission.key like 'orders.section.%'
on conflict (role_id, permission_id) do nothing;

commit;
