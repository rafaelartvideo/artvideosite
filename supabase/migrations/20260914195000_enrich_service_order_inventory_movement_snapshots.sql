create or replace function private.enrich_service_order_inventory_movement_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.inventory_items%rowtype;
  v_dispatch_cost numeric;
  v_previous_quantity numeric;
  v_average_before numeric;
  v_average_after numeric;
  v_unit_cost numeric;
begin
  if new.service_order_id is null
     or new.inventory_item_id is null
     or (new.previous_quantity is not null and new.resulting_quantity is not null) then
    return new;
  end if;

  select *
    into v_item
  from public.inventory_items item
  where item.id = new.inventory_item_id
  for update;

  if not found then
    return new;
  end if;

  new.organization_id := coalesce(new.organization_id, v_item.organization_id);
  new.input_unit := coalesce(new.input_unit, 'un');
  new.input_quantity := coalesce(new.input_quantity, new.quantity);
  new.conversion_factor_snapshot := coalesce(new.conversion_factor_snapshot, 1);

  if coalesce(new.movement_origin, 'legacy') = 'legacy' then
    new.movement_origin := case when new.movement_type = 'IN' then 'return' else 'service_order' end;
  end if;

  if new.movement_type = 'OUT' then
    new.previous_quantity := coalesce(new.previous_quantity, v_item.quantity + new.quantity);
    new.resulting_quantity := coalesce(new.resulting_quantity, v_item.quantity);
    v_unit_cost := coalesce(new.unit_cost, v_item.average_cost, v_item.purchase_price);
    new.unit_cost := v_unit_cost;
    new.total_cost := coalesce(new.total_cost, case when v_unit_cost is null then null else v_unit_cost * new.quantity end);
    new.average_cost_before := coalesce(new.average_cost_before, v_item.average_cost);
    new.average_cost_after := coalesce(new.average_cost_after, v_item.average_cost);
    return new;
  end if;

  if new.movement_type = 'IN' then
    v_previous_quantity := greatest(v_item.quantity - new.quantity, 0);

    select coalesce(movement.unit_cost, movement.average_cost_before)
      into v_dispatch_cost
    from public.inventory_movements movement
    where movement.inventory_item_id = new.inventory_item_id
      and movement.service_order_id = new.service_order_id
      and movement.movement_type = 'OUT'
      and (
        new.request_item_id is null
        or movement.request_item_id = new.request_item_id
      )
    order by
      case when new.request_item_id is not null and movement.request_item_id = new.request_item_id then 0 else 1 end,
      movement.created_at desc
    limit 1;

    v_unit_cost := coalesce(new.unit_cost, v_dispatch_cost, v_item.average_cost, v_item.purchase_price);
    v_average_before := v_item.average_cost;

    if v_unit_cost is not null and v_item.quantity > 0 then
      v_average_after := (
        (v_previous_quantity * coalesce(v_average_before, v_unit_cost))
        + (new.quantity * v_unit_cost)
      ) / v_item.quantity;
    else
      v_average_after := v_average_before;
    end if;

    if v_average_after is distinct from v_item.average_cost then
      update public.inventory_items
      set average_cost = v_average_after
      where id = v_item.id;
    end if;

    new.previous_quantity := coalesce(new.previous_quantity, v_previous_quantity);
    new.resulting_quantity := coalesce(new.resulting_quantity, v_item.quantity);
    new.unit_cost := v_unit_cost;
    new.input_unit_cost := coalesce(new.input_unit_cost, v_unit_cost);
    new.total_cost := coalesce(new.total_cost, case when v_unit_cost is null then null else v_unit_cost * new.quantity end);
    new.average_cost_before := coalesce(new.average_cost_before, v_average_before);
    new.average_cost_after := coalesce(new.average_cost_after, v_average_after);
    return new;
  end if;

  if new.movement_type = 'ADJUST' then
    select coalesce(movement.unit_cost, movement.average_cost_before)
      into v_dispatch_cost
    from public.inventory_movements movement
    where movement.inventory_item_id = new.inventory_item_id
      and movement.service_order_id = new.service_order_id
      and movement.movement_type = 'OUT'
    order by movement.created_at desc
    limit 1;

    v_unit_cost := coalesce(new.unit_cost, v_dispatch_cost, v_item.average_cost, v_item.purchase_price);
    new.previous_quantity := coalesce(new.previous_quantity, v_item.quantity);
    new.resulting_quantity := coalesce(new.resulting_quantity, v_item.quantity);
    new.unit_cost := v_unit_cost;
    new.total_cost := coalesce(new.total_cost, case when v_unit_cost is null then null else v_unit_cost * new.quantity end);
    new.average_cost_before := coalesce(new.average_cost_before, v_item.average_cost);
    new.average_cost_after := coalesce(new.average_cost_after, v_item.average_cost);
  end if;

  return new;
end;
$function$;

drop trigger if exists inventory_movements_snapshot_context on public.inventory_movements;
create trigger inventory_movements_snapshot_context
before insert on public.inventory_movements
for each row execute function private.enrich_service_order_inventory_movement_snapshots();
