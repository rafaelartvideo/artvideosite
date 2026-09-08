-- Multiempresa (fase 4C): isolamento do núcleo de Ordens de Serviço.
-- A empresa ativa continua sendo escolhida no frontend; no banco, esta migration
-- garante que uma OS só seja visível/manipulável dentro de uma empresa acessível,
-- com o módulo Ordens habilitado e respeitando o compartilhamento da controladora.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_orders_scope', 0)
);

lock table public.service_orders in access exclusive mode;

alter table public.service_orders enable row level security;

drop trigger if exists service_orders_prevent_organization_change on public.service_orders;
create trigger service_orders_prevent_organization_change
before update of organization_id on public.service_orders
for each row
execute function private.prevent_organization_id_change();

create or replace function private.ensure_service_order_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    raise exception 'A empresa da OS é obrigatória.' using errcode = '23502';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from public.customers customer
    where customer.id = new.customer_id
      and customer.organization_id = new.organization_id
  ) then
    raise exception 'O cliente selecionado não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.status_id is not null and not exists (
    select 1 from public.order_statuses status
    where status.id = new.status_id
      and status.organization_id = new.organization_id
  ) then
    raise exception 'O status selecionado não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.situation_id is not null and not exists (
    select 1 from public.os_situations situation
    where situation.id = new.situation_id
      and situation.organization_id = new.organization_id
  ) then
    raise exception 'A situação selecionada não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.service_type_id is not null and not exists (
    select 1 from public.service_types service_type
    where service_type.id = new.service_type_id
      and service_type.organization_id = new.organization_id
  ) then
    raise exception 'O tipo de atendimento não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.general_service_id is not null and not exists (
    select 1 from public.general_services general_service
    where general_service.id = new.general_service_id
      and general_service.organization_id = new.organization_id
  ) then
    raise exception 'O serviço operacional não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.equipment_type_id is not null and not exists (
    select 1 from public.equipment_types equipment_type
    where equipment_type.id = new.equipment_type_id
      and equipment_type.organization_id = new.organization_id
  ) then
    raise exception 'O equipamento não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.equipment_brand_id is not null and not exists (
    select 1 from public.equipment_brands equipment_brand
    where equipment_brand.id = new.equipment_brand_id
      and equipment_brand.organization_id = new.organization_id
  ) then
    raise exception 'A marca do equipamento não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.equipment_model_id is not null and not exists (
    select 1 from public.equipment_models equipment_model
    where equipment_model.id = new.equipment_model_id
      and equipment_model.organization_id = new.organization_id
  ) then
    raise exception 'O modelo do equipamento não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.technician_id is not null and not exists (
    select 1 from public.employees employee
    where employee.id = new.technician_id
      and employee.organization_id = new.organization_id
  ) then
    raise exception 'O técnico não pertence à empresa da OS.' using errcode = '42501';
  end if;

  if new.seller_id is not null and not exists (
    select 1 from public.employees employee
    where employee.id = new.seller_id
      and employee.organization_id = new.organization_id
  ) then
    raise exception 'O vendedor não pertence à empresa da OS.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_service_order_organization() from public;

drop trigger if exists service_orders_validate_organization on public.service_orders;
create trigger service_orders_validate_organization
before insert or update of
  customer_id,
  status_id,
  situation_id,
  service_type_id,
  general_service_id,
  equipment_type_id,
  equipment_brand_id,
  equipment_model_id,
  technician_id,
  seller_id,
  organization_id
on public.service_orders
for each row
execute function private.ensure_service_order_organization();

-- Regra central de leitura usada pelas policies das OS e por várias tabelas filhas.
-- view_all libera todas as OS da empresa; view mantém o escopo operacional do
-- usuário (OS atribuída diretamente, técnico ou vendedor vinculado).
create or replace function private.can_view_service_order(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(
        service_order.organization_id,
        'orders'
      )
      and private.can_access_shared_organization_resource(
        service_order.organization_id,
        'orders',
        'read'
      )
      and (
        private.has_effective_organization_permission(
          service_order.organization_id,
          'orders.view_all'
        )
        or (
          private.has_effective_organization_permission(
            service_order.organization_id,
            'orders.view'
          )
          and (
            service_order.assigned_to = (select auth.uid())
            or exists (
              select 1
              from public.employees employee
              where employee.organization_id = service_order.organization_id
                and employee.profile_id = (select auth.uid())
                and employee.id in (
                  service_order.technician_id,
                  service_order.seller_id
                )
            )
            or exists (
              select 1
              from public.service_order_technicians technician_link
              join public.employees employee
                on employee.id = technician_link.employee_id
               and employee.organization_id = service_order.organization_id
              where technician_link.service_order_id = service_order.id
                and technician_link.organization_id = service_order.organization_id
                and employee.profile_id = (select auth.uid())
            )
            or exists (
              select 1
              from public.service_order_sellers seller_link
              join public.employees employee
                on employee.id = seller_link.employee_id
               and employee.organization_id = service_order.organization_id
              where seller_link.service_order_id = service_order.id
                and seller_link.organization_id = service_order.organization_id
                and employee.profile_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_view_service_order(uuid) from public;
grant execute on function private.can_view_service_order(uuid) to authenticated;

-- Remove somente policies que concediam acesso ao papel authenticated. Policies
-- públicas/anon usadas pelo acompanhamento público não são tocadas aqui.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_orders'
      and 'authenticated' = any (roles)
  loop
    execute format(
      'drop policy if exists %I on public.service_orders',
      policy_row.policyname
    );
  end loop;
end;
$$;

create policy service_orders_tenant_select
on public.service_orders
as permissive
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.can_access_shared_organization_resource(
    organization_id,
    'orders',
    'read'
  )
  and (
    -- Mantém INSERT ... RETURNING funcional antes da criação dos vínculos.
    assigned_to = (select auth.uid())
    or private.can_view_service_order(id)
  )
);

create policy service_orders_tenant_insert
on public.service_orders
as permissive
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.can_access_shared_organization_resource(
    organization_id,
    'orders',
    'manage'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'orders.create'
  )
  and assigned_to = (select auth.uid())
);

create policy service_orders_tenant_update
on public.service_orders
as permissive
for update
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.can_access_shared_organization_resource(
    organization_id,
    'orders',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'orders.edit'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'orders.update'
    )
  )
  and private.can_view_service_order(id)
)
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'orders')
  and private.can_access_shared_organization_resource(
    organization_id,
    'orders',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'orders.edit'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'orders.update'
    )
  )
  and private.can_view_service_order(id)
);

-- Exclusão continua sem policy authenticated. O sistema já trata OS como
-- registro de negócio protegido e não deve permitir remoção direta.

grant select, insert, update on public.service_orders to authenticated;

comment on function private.ensure_service_order_organization() is
  'Valida que cliente, status, situação, atendimento, equipamento e responsáveis pertençam à mesma empresa da OS.';
comment on function private.can_view_service_order(uuid) is
  'Aplica módulo, compartilhamento, permissão e escopo operacional para visualizar uma OS em ambiente multiempresa.';

commit;
