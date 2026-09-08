-- Multiempresa (fase 4B): isolamento de clientes e endereços.
-- Exige empresa ativa, módulo liberado, permissão efetiva e, para a empresa
-- controladora, compartilhamento explícito do recurso consultado.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_customers_scope', 0)
);

-- service_orders é consultada pelas políticas auxiliares. O lock compatível é
-- obtido antes dos locks exclusivos para impedir esperas circulares.
lock table public.service_orders in access share mode;
lock table public.customers, public.customer_addresses in access exclusive mode;

create or replace function private.has_effective_organization_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_permission(p_organization_id, p_permission_key)
    or private.can_manage_organization(p_organization_id, p_permission_key);
$$;

create or replace function private.ensure_customer_address_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_organization_id uuid;
begin
  select customer.organization_id
    into customer_organization_id
  from public.customers customer
  where customer.id = new.customer_id;

  if customer_organization_id is null then
    raise exception 'Cliente não encontrado para o endereço informado.'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from customer_organization_id then
    raise exception 'O endereço e o cliente devem pertencer à mesma empresa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.has_effective_organization_permission(uuid, text) from public;
revoke all on function private.ensure_customer_address_organization() from public;
grant execute on function private.has_effective_organization_permission(uuid, text) to authenticated;

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;

drop trigger if exists customers_prevent_organization_change on public.customers;
create trigger customers_prevent_organization_change
before update of organization_id on public.customers
for each row
execute function private.prevent_organization_id_change();

drop trigger if exists customer_addresses_prevent_organization_change on public.customer_addresses;
create trigger customer_addresses_prevent_organization_change
before update of organization_id on public.customer_addresses
for each row
execute function private.prevent_organization_id_change();

drop trigger if exists customer_addresses_validate_organization on public.customer_addresses;
create trigger customer_addresses_validate_organization
before insert or update of customer_id, organization_id on public.customer_addresses
for each row
execute function private.ensure_customer_address_organization();

drop policy if exists customers_view on public.customers;
drop policy if exists customers_create on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_edit on public.customers;
drop policy if exists customers_remove on public.customers;
drop policy if exists customers_order_sections_view on public.customers;

create policy customers_select
on public.customers
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'read'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'customers.view'
  )
);

create policy customers_insert
on public.customers
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'manage'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'customers.create'
  )
);

create policy customers_edit
on public.customers
for update
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'customers.update'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'customers.edit'
    )
  )
)
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'customers.update'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'customers.edit'
    )
  )
);

-- A visualização do cliente dentro de uma OS continua independente do módulo
-- Clientes, mas fica limitada à empresa da OS e ao compartilhamento de Ordens.
create policy customers_order_sections_view
on public.customers
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
    private.has_effective_organization_permission(
      organization_id,
      'orders.section.customer'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'orders.section.address'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'orders.table.customer'
    )
  )
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.organization_id = customers.organization_id
      and service_order.customer_id = customers.id
      and private.can_view_service_order(service_order.id)
  )
);

drop policy if exists customer_addresses_view on public.customer_addresses;
drop policy if exists customer_addresses_create on public.customer_addresses;
drop policy if exists customer_addresses_update on public.customer_addresses;
drop policy if exists customer_addresses_delete on public.customer_addresses;
drop policy if exists customer_addresses_select on public.customer_addresses;
drop policy if exists customer_addresses_insert on public.customer_addresses;
drop policy if exists customer_addresses_edit on public.customer_addresses;
drop policy if exists customer_addresses_remove on public.customer_addresses;
drop policy if exists customer_addresses_order_section_view on public.customer_addresses;

create policy customer_addresses_select
on public.customer_addresses
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'read'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'customers.addresses.view'
  )
);

create policy customer_addresses_insert
on public.customer_addresses
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'customers.create'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'customers.addresses.edit'
    )
  )
);

create policy customer_addresses_edit
on public.customer_addresses
for update
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'customers.edit'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'customers.addresses.edit'
    )
  )
)
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'manage'
  )
  and (
    private.has_effective_organization_permission(
      organization_id,
      'customers.edit'
    )
    or private.has_effective_organization_permission(
      organization_id,
      'customers.addresses.edit'
    )
  )
);

create policy customer_addresses_order_section_view
on public.customer_addresses
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
  and private.has_effective_organization_permission(
    organization_id,
    'orders.section.address'
  )
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.organization_id = customer_addresses.organization_id
      and service_order.customer_id = customer_addresses.customer_id
      and private.can_view_service_order(service_order.id)
  )
);

comment on function private.has_effective_organization_permission(uuid, text) is
  'Verifica a permissão do membro direto ou da controladora ao atuar sobre uma empresa filha.';
comment on function private.ensure_customer_address_organization() is
  'Garante que customer_addresses.organization_id seja igual à empresa do cliente vinculado.';

commit;
