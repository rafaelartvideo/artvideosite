revoke insert, update, delete on table public.inventory_movements from authenticated;
revoke all on table public.inventory_movements from anon;
grant select on table public.inventory_movements to authenticated;

drop policy if exists inventory_movements_tenant_update on public.inventory_movements;
drop policy if exists inventory_movements_tenant_delete on public.inventory_movements;
