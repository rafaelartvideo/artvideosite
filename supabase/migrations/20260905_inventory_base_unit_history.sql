begin;

-- Esta migration complementa 20260905_inventory_base_unit_flow.sql.
-- Depois que inventory_items passa a armazenar saldo/preço por unidade mínima,
-- converte também os registros históricos que ainda representam caixas.

-- Movimentações antigas: quantity representava a unidade de cadastro (cx).
-- As novas movimentações já possuem input_unit preenchido e não devem ser reconvertidas.
update public.inventory_movements movement
set
  quantity = movement.quantity * inventory.conversion_factor,
  input_unit = 'cx',
  input_quantity = movement.quantity,
  conversion_factor_snapshot = inventory.conversion_factor
from public.inventory_items inventory
where inventory.id = movement.inventory_item_id
  and lower(coalesce(inventory.unit, 'un')) = 'cx'
  and inventory.conversion_factor > 1
  and movement.input_unit is null;

-- Eventos de custódia existentes acompanham as quantidades dos itens de solicitação,
-- que foram convertidas para unidades mínimas na migration anterior.
update public.service_order_part_custody_events event
set quantity = event.quantity * inventory.conversion_factor
from public.service_order_part_request_items request_item
join public.inventory_items inventory on inventory.id = request_item.inventory_item_id
where request_item.id = event.request_item_id
  and lower(coalesce(inventory.unit, 'un')) = 'cx'
  and inventory.conversion_factor > 1;

-- Produtos utilizados antigos também precisam passar a representar unidades mínimas.
-- O preço total histórico é preservado; snapshots unitários, quando existirem,
-- passam a representar preço por unidade.
do $$
declare
  has_unit_sale_price boolean;
  has_total_sale_price boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_order_used_items'
      and column_name = 'unit_sale_price'
  ) into has_unit_sale_price;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_order_used_items'
      and column_name = 'total_sale_price'
  ) into has_total_sale_price;

  if has_unit_sale_price then
    execute $sql$
      update public.service_order_used_items used
      set
        quantity = used.quantity * inventory.conversion_factor,
        unit_sale_price = case
          when used.unit_sale_price is null then null
          else used.unit_sale_price / inventory.conversion_factor
        end
      from public.inventory_items inventory
      where inventory.id = used.inventory_item_id
        and lower(coalesce(inventory.unit, 'un')) = 'cx'
        and inventory.conversion_factor > 1
    $sql$;
  else
    update public.service_order_used_items used
    set quantity = used.quantity * inventory.conversion_factor
    from public.inventory_items inventory
    where inventory.id = used.inventory_item_id
      and lower(coalesce(inventory.unit, 'un')) = 'cx'
      and inventory.conversion_factor > 1;
  end if;
end $$;

commit;
