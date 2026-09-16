begin;

-- Movimentações podem ser informadas em unidade ou caixa, independentemente
-- da unidade padrão de exibição do item. Fornecedor de compra é opcional.
drop function if exists public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text);

create function public.record_inventory_movement(
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
  p_notes text default null,
  p_input_unit text default null
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

  -- O fator pertence ao item e continua disponível mesmo quando a unidade
  -- padrão é "un", permitindo comprar ou retirar por caixa.
  v_factor := greatest(1, coalesce(v_item.conversion_factor, 1));
  v_input_unit := lower(btrim(coalesce(p_input_unit, v_item.unit, 'un')));
  if v_input_unit not in ('un','cx') then
    raise exception 'Unidade da movimentação inválida.' using errcode = '22023';
  end if;

  v_base_quantity := case when v_input_unit = 'cx' then p_input_quantity * v_factor else p_input_quantity end;
  v_previous_quantity := coalesce(v_item.quantity, 0);
  v_average_before := coalesce(v_item.average_cost, v_item.purchase_price, 0);
  v_average_after := v_average_before;

  if v_type = 'IN' then
    if v_origin <> 'initial_balance' then
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
           when v_type = 'IN' and v_origin = 'purchase' and p_supplier_entity_id is not null then p_supplier_entity_id
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

revoke all on function public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text,text) from public;
revoke all on function public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text,text) from anon;
grant execute on function public.record_inventory_movement(uuid,uuid,text,numeric,uuid,numeric,text,text,uuid,text,text,text) to authenticated;

-- Mantém o fator de caixa mesmo quando a unidade padrão de exibição é "un".
create or replace function public.create_inventory_item(
  p_organization_id uuid,
  p_name text,
  p_sku text default null,
  p_description text default null,
  p_unit text default 'un',
  p_conversion_factor integer default 1,
  p_min_quantity numeric default 0,
  p_sale_price numeric default null,
  p_storage_shelf text default null,
  p_storage_level text default null,
  p_storage_compartment text default null,
  p_is_active boolean default true,
  p_supplier_entity_ids uuid[] default '{}'::uuid[],
  p_initial_quantity numeric default 0,
  p_initial_supplier_entity_id uuid default null,
  p_initial_unit_cost numeric default null,
  p_initial_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_id uuid;
  v_unit text := lower(btrim(coalesce(p_unit, 'un')));
  v_factor integer;
  v_supplier_ids uuid[] := coalesce(p_supplier_entity_ids, '{}'::uuid[]);
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_effective_organization_permission(p_organization_id, 'inventory.create') then
    raise exception 'Você não possui permissão para cadastrar itens no estoque.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Informe o nome do item do estoque.' using errcode = '22023';
  end if;

  if v_unit not in ('un','cx') then
    raise exception 'Unidade do item inválida.' using errcode = '22023';
  end if;

  v_factor := greatest(1, coalesce(p_conversion_factor, 1));

  if p_min_quantity is null or p_min_quantity < 0
     or p_initial_quantity is null or p_initial_quantity < 0
     or (p_sale_price is not null and p_sale_price < 0)
     or (p_initial_unit_cost is not null and p_initial_unit_cost < 0) then
    raise exception 'Quantidades e valores do item não podem ser negativos.' using errcode = '22023';
  end if;

  if cardinality(v_supplier_ids) > 0 then
    if not private.has_effective_organization_permission(p_organization_id, 'inventory.suppliers.manage') then
      raise exception 'Você não possui permissão para vincular fornecedores ao item.' using errcode = '42501';
    end if;

    if exists (
      select 1
      from unnest(v_supplier_ids) supplier_id
      where not exists (
        select 1
        from public.entities supplier
        join public.entity_roles supplier_role
          on supplier_role.entity_id = supplier.id
         and supplier_role.role = 'supplier'
         and supplier_role.is_active = true
        where supplier.id = supplier_id
          and supplier.organization_id = p_organization_id
          and supplier.is_active = true
      )
    ) then
      raise exception 'Há fornecedor inativo, inválido ou pertencente a outra empresa.' using errcode = '23514';
    end if;
  end if;

  if p_initial_supplier_entity_id is not null
     and not (p_initial_supplier_entity_id = any(v_supplier_ids)) then
    raise exception 'O fornecedor do saldo inicial precisa estar vinculado ao item.' using errcode = '23514';
  end if;

  insert into public.inventory_items (
    organization_id, name, sku, description, unit, conversion_factor, quantity, min_quantity,
    purchase_price, average_cost, sale_price, storage_shelf, storage_level, storage_compartment, is_active
  ) values (
    p_organization_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_sku, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_unit,
    v_factor,
    0,
    case when v_unit = 'cx' then p_min_quantity * v_factor else p_min_quantity end,
    null,
    null,
    case when p_sale_price is null then null when v_unit = 'cx' then p_sale_price / v_factor else p_sale_price end,
    nullif(btrim(coalesce(p_storage_shelf, '')), ''),
    nullif(btrim(coalesce(p_storage_level, '')), ''),
    nullif(btrim(coalesce(p_storage_compartment, '')), ''),
    p_is_active
  ) returning id into v_item_id;

  if cardinality(v_supplier_ids) > 0 then
    insert into public.entity_supplier_items (organization_id, entity_id, inventory_item_id, created_by)
    select p_organization_id, supplier_id, v_item_id, v_user_id
    from unnest(v_supplier_ids) supplier_id
    on conflict (organization_id, entity_id, inventory_item_id) do nothing;
  end if;

  if p_initial_quantity > 0 then
    perform public.record_inventory_movement(
      p_organization_id,
      v_item_id,
      'IN',
      p_initial_quantity,
      p_initial_supplier_entity_id,
      p_initial_unit_cost,
      'Saldo inicial',
      p_initial_reference,
      null,
      'initial_balance',
      null,
      v_unit
    );
  end if;

  return v_item_id;
end;
$$;

revoke all on function public.create_inventory_item(uuid,text,text,text,text,integer,numeric,numeric,text,text,text,boolean,uuid[],numeric,uuid,numeric,text) from public;
revoke all on function public.create_inventory_item(uuid,text,text,text,text,integer,numeric,numeric,text,text,text,boolean,uuid[],numeric,uuid,numeric,text) from anon;
grant execute on function public.create_inventory_item(uuid,text,text,text,text,integer,numeric,numeric,text,text,text,boolean,uuid[],numeric,uuid,numeric,text) to authenticated;

commit;
