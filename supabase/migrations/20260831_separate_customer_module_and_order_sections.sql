begin;

-- O módulo Clientes continua protegido por customers.view.
-- Esta política adicional libera o registro do cliente apenas quando ele está
-- vinculado a uma OS que o usuário pode visualizar e a função possui uma das
-- permissões específicas de seção da OS.
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
  )
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.customer_id = customers.id
      and private.can_view_service_order(service_order.id)
  )
);

-- O endereço exige exclusivamente a permissão da seção de endereço da OS.
drop policy if exists customer_addresses_order_section_view on public.customer_addresses;
create policy customer_addresses_order_section_view
on public.customer_addresses
as permissive
for select
to authenticated
using (
  private.has_permission('orders.section.address')
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.customer_id = customer_addresses.customer_id
      and private.can_view_service_order(service_order.id)
  )
);

grant select on public.customers to authenticated;
grant select on public.customer_addresses to authenticated;

commit;
