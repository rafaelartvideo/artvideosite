begin;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_input_quantity_check,
  add constraint inventory_movements_input_quantity_check check (input_quantity is null or input_quantity >= 0);

create or replace function public.record_inventory_movement(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_input_quantity numeric,
  p_supplier_entity_id uuid default null,
  p_input_unit_cost numeric default null,
  p_reason text default null,
  p_purchase_reference text default null,
  p_service_order_id uuid default null,
  p_movement_origin text default 'manual',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_type text := upper(btrim(coalesce(p_movement_type, '')));
  v_origin text := lower(btrim(coalesce(p_movement_origin, 'manual')));
  v_factor integer;
  v_input_unit text;
  v_base_quantity numeric;
  v_previous_quantity numeric;
  v_resulting_quantity numeric;
  v_average_before numeric;
  v_average_after numeric;
  v_base_unit_cost numeric;
  v_total_cost numeric;
  v_movement_id uuid;
  v_has_permission boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if v_origin not in ('purchase','manual','initial_balance','service_order','return','legacy') then
    raise exception 'Origem da movimentação inválida.' using errcode = '22023';
  end if;

  if v_type not in ('IN','OUT','ADJUST') then
    raise exception 'Tipo de movimentação inválido.' using errcode = '22023';
  end if;

  if p_input_quantity is null or p_input_quantity < 0 or (v_type in ('IN','OUT') and p_input_quantity <= 0) then
    raise exception 'Informe uma quantidade válida para a movimentação.' using errcode = '22023';
  end if;

  v_has_permission := case
    when v_origin = 'initial_balance' then
      private.has_effective_organization_permission(p_organization_id, 'inventory.create')
      or private.has_effective_organization_permission(p_organization_id, 'inventory.movements.create')
    else private.has_effective_organization_permission(p_organization_id, 'inventory.movements.create')
  end;

  if not v_has_permission then
    raise exception 'Você não possui permissão para registrar movimentações de estoque.' using errcode = '42501';
  end if;

  select item.*
    into v_item
  from public.inventory_items item
  where item.id = p_inventory_item_id
    and item.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Item do estoque não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  if v_item.is_active is false then
    raise exception 'O item está inativo e não pode receber movimentações.' using errcode = '22023';
  end if;

  v_factor := greatest(1, coalesce(v_item.conversion_factor, 1));
  v_input_unit := case when lower(coalesce(v_item.unit, 'un')) = 'cx' then 'cx' else 'un' end;
  v_base_quantity := case when v_input_unit = 'cx' then p_input_quantity * v_factor else p_input_quantity end;
  v_previous_quantity := coalesce(v_item.quantity, 0);
  v_average_before := coalesce(v_item.average_cost, v_item.purchase_price, 0);
  v_average_after := v_average_before;

  if v_type = 'IN' then
    if v_origin <> 'initial_balance' then
      if p_supplier_entity_id is null then
        raise exception 'Selecione o fornecedor da entrada.' using errcode = '22023';
      end if;
      if p_input_unit_cost is null or p_input_unit_cost < 0 then
        raise exception 'Informe o valor de compra da entrada.' using errcode = '22023';
      end if;
    elsif v_previous_quantity <> 0 then
      raise exception 'Saldo inicial só pode ser registrado quando o item está zerado.' using errcode = '22023';
    end if;

    if p_input_unit_cost is not null and p_input_unit_cost < 0 then
      raise exception 'O valor de compra não pode ser negativo.' using errcode = '22023';
    end if;

    if p_supplier_entity_id is not null then
      if not exists (
        select 1
        from public.entities supplier
        join public.entity_roles supplier_role
          on supplier_role.entity_id = supplier.id
         and supplier_role.role = 'supplier'
         and supplier_role.is_active = true
        join public.entity_supplier_items link
          on link.entity_id = supplier.id
         and link.organization_id = supplier.organization_id
         and link.inventory_item_id = p_inventory_item_id
        where supplier.id = p_supplier_entity_id
          and supplier.organization_id = p_organization_id
          and supplier.is_active = true
      ) then
        raise exception 'Fornecedor inativo, não vinculado ao item ou pertencente a outra empresa.' using errcode = '23514';
      end if;
    end if;

    v_resulting_quantity := v_previous_quantity + v_base_quantity;
    if p_input_unit_cost is not null then
      v_base_unit_cost := case when v_input_unit = 'cx' then p_input_unit_cost / v_factor else p_input_unit_cost end;
      v_total_cost := p_input_quantity * p_input_unit_cost;
      if v_resulting_quantity > 0 then
        v_average_after := ((v_previous_quantity * v_average_before) + (v_base_quantity * v_base_unit_cost)) / v_resulting_quantity;
      else
        v_average_after := v_base_unit_cost;
      end if;
    else
      v_base_unit_cost := null;
      v_total_cost := null;
    end if;
  elsif v_type = 'OUT' then
    if v_previous_quantity < v_base_quantity then
      raise exception 'Estoque insuficiente para esta saída.' using errcode = '23514';
    end if;
    v_resulting_quantity := v_previous_quantity - v_base_quantity;
  else
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'Informe a justificativa do ajuste.' using errcode = '22023';
    end if;
    v_resulting_quantity := v_base_quantity;
  end if;

  insert into public.inventory_movements (
    organization_id,
    inventory_item_id,
    service_order_id,
    movement_type,
    quantity,
    reason,
    created_by,
    input_unit,
    input_quantity,
    conversion_factor_snapshot,
    supplier_entity_id,
    unit_cost,
    input_unit_cost,
    total_cost,
    previous_quantity,
    resulting_quantity,
    average_cost_before,
    average_cost_after,
    purchase_reference,
    notes,
    movement_origin
  ) values (
    p_organization_id,
    p_inventory_item_id,
    p_service_order_id,
    v_type,
    case when v_type = 'ADJUST' then v_resulting_quantity else v_base_quantity end,
    nullif(btrim(coalesce(p_reason, '')), ''),
    v_user_id,
    v_input_unit,
    p_input_quantity,
    v_factor,
    p_supplier_entity_id,
    v_base_unit_cost,
    p_input_unit_cost,
    v_total_cost,
    v_previous_quantity,
    v_resulting_quantity,
    nullif(v_average_before, 0),
    case when v_average_after = 0 then null else v_average_after end,
    nullif(btrim(coalesce(p_purchase_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_origin
  ) returning id into v_movement_id;

  update public.inventory_items item
     set quantity = v_resulting_quantity,
         average_cost = case
           when v_type = 'IN' and p_input_unit_cost is not null then v_average_after
           else item.average_cost
         end,
         purchase_price = case
           when v_type = 'IN' and p_input_unit_cost is not null and v_origin in ('purchase','initial_balance') then v_base_unit_cost
           else item.purchase_price
         end,
         last_supplier_entity_id = case
           when v_type = 'IN' and v_origin = 'purchase' then p_supplier_entity_id
           else item.last_supplier_entity_id
         end,
         last_purchase_at = case
           when v_type = 'IN' and v_origin = 'purchase' then now()
           else item.last_purchase_at
         end,
         updated_at = now()
   where item.id = p_inventory_item_id
     and item.organization_id = p_organization_id;

  return v_movement_id;
end;
$$;

revoke all on function public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text) from public;
revoke all on function public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text) from anon;
grant execute on function public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text) to authenticated;

commit;
