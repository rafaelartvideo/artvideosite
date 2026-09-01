-- Histórico colaborativo e permissões visuais dos detalhes da OS.

create table if not exists public.service_order_history_notes (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now(),
  constraint service_order_history_notes_content_check
    check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists service_order_history_notes_order_created_idx
  on public.service_order_history_notes (service_order_id, created_at desc);

alter table public.service_order_history_notes enable row level security;

drop policy if exists service_order_history_notes_select on public.service_order_history_notes;
create policy service_order_history_notes_select
  on public.service_order_history_notes
  for select
  to authenticated
  using (
    private.has_permission('orders.section.history')
    and private.can_view_service_order(service_order_id)
  );

drop policy if exists service_order_history_notes_insert on public.service_order_history_notes;
create policy service_order_history_notes_insert
  on public.service_order_history_notes
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and private.has_permission('orders.history.create')
    and private.can_view_service_order(service_order_id)
  );

grant select, insert on public.service_order_history_notes to authenticated;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  (
    'orders.section.sla_cards',
    'Visualizar cards de situação e tempo da OS',
    'Permite visualizar os cards com o SLA da situação e o tempo total da ordem de serviço.',
    'Ordens de Serviço — Seções',
    1115
  ),
  (
    'orders.history.create',
    'Adicionar registro ao histórico',
    'Permite escrever um novo registro permanente na linha do tempo da ordem de serviço.',
    'Ordens de Serviço — Barra de ferramentas',
    1116
  )
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Reclassifica visualmente as permissões já existentes como ferramentas da OS.
update public.permissions
set
  label = 'Visualizar solicitações de peças',
  description = 'Permite visualizar o botão e a página exclusiva de solicitações de peças da OS.',
  module_name = 'Ordens de Serviço — Barra de ferramentas'
where key = 'orders.section.parts';

update public.permissions
set
  label = 'Visualizar histórico da OS',
  description = 'Permite visualizar o botão e a linha do tempo de alterações e registros da OS.',
  module_name = 'Ordens de Serviço — Barra de ferramentas'
where key = 'orders.section.history';

-- Mantém os cards disponíveis inicialmente para quem já visualiza as informações da OS.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, sla_permission.id
from public.role_permissions current_access
join public.permissions information_permission
  on information_permission.id = current_access.permission_id
 and information_permission.key = 'orders.section.information'
cross join public.permissions sla_permission
where sla_permission.key = 'orders.section.sla_cards'
on conflict do nothing;

-- Quem já visualizava o histórico pode inicialmente adicionar registros.
-- A permissão pode ser removida individualmente na configuração da função.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, create_permission.id
from public.role_permissions current_access
join public.permissions history_permission
  on history_permission.id = current_access.permission_id
 and history_permission.key = 'orders.section.history'
cross join public.permissions create_permission
where create_permission.key = 'orders.history.create'
on conflict do nothing;
