begin;
-- Evita varreduras desnecessárias em referências de produtos e inventário nos pedidos comerciais.
create index if not exists sales_order_items_product_fk_idx on public.sales_order_items(product_id);
create index if not exists sales_order_items_inventory_fk_idx on public.sales_order_items(inventory_item_id);
commit;
