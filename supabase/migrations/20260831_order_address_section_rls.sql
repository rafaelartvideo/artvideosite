begin;

-- Permite visualizar o endereço do cliente dentro de uma OS sem exigir acesso ao módulo completo de Clientes.
-- A leitura continua restrita a usuários com a permissão da seção e acesso à respectiva OS.
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

grant select on public.customer_addresses to authenticated;

commit;
