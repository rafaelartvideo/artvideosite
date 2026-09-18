begin;

drop policy if exists service_order_used_items_insert on public.service_order_used_items;
drop policy if exists service_order_used_items_delete on public.service_order_used_items;

create policy service_order_used_items_insert
on public.service_order_used_items
for insert to authenticated
with check (
  private.can_access_service_order_child(
    service_order_id,
    'orders.solve',
    'manage'
  )
);

create policy service_order_used_items_delete
on public.service_order_used_items
for delete to authenticated
using (
  private.can_access_service_order_child(
    service_order_id,
    'orders.solve',
    'manage'
  )
);

commit;
