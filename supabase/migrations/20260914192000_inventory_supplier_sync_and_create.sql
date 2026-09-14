begin;

create or replace function public.sync_inventory_item_suppliers(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_supplier_entity_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_supplier_ids uuid[] := coalesce(p_supplier_entity_ids, '{}'::uuid[]);
  v_invalid_count integer;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_effective_organization_permission(p_organization_id, 'inventory.suppliers.manage') then
    raise exception 'Você não possui permissão para gerenciar fornecedores do estoque.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.inventory_items item
    where item.id = p_inventory_item_id
      and item.organization_id = p_organization_id
  ) then
    raise exception 'Item do estoque não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  select count(*)::integer
    into v_invalid_count
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
  );

  if v_invalid_count > 0 then
    raise exception 'Há fornecedor inativo, inválido ou pertencente a outra empresa.' using errcode = '23514';
  end if;

  delete from public.entity_supplier_items link
  where link.organization_id = p_organization_id
    and link.inventory_item_id = p_inventory_item_id
    and not (link.entity_id = any(v_supplier_ids));

  insert into public.entity_supplier_items (organization_id, entity_id, inventory_item_id, created_by)
  select p_organization_id, supplier_id, p_inventory_item_id, v_user_id
  from unnest(v_supplier_ids) supplier_id
  on conflict (organization_id, entity_id, inventory_item_id) do nothing;
end;
$$;

revoke all on function public.sync_inventory_item_suppliers(uuid, uuid, uuid[]) from public;
revoke all on function public.sync_inventory_item_suppliers(uuid, uuid, uuid[]) from anon;
grant execute on function public.sync_inventory_item_suppliers(uuid, uuid, uuid[]) to authenticated;

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

  v_factor := case when v_unit = 'cx' then greatest(1, coalesce(p_conversion_factor, 1)) else 1 end;

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
      null
    );
  end if;

  return v_item_id;
end;
$$;

revoke all on function public.create_inventory_item(uuid,text,text,text,text,integer,numeric,numeric,text,text,text,boolean,uuid[],numeric,uuid,numeric,text) from public;
revoke all on function public.create_inventory_item(uuid,text,text,text,text,integer,numeric,numeric,text,text,text,boolean,uuid[],numeric,uuid,numeric,text) from anon;
grant execute on function public.create_inventory_item(uuid,text,text,text,text,integer,numeric,numeric,text,text,text,boolean,uuid[],numeric,uuid,numeric,text) to authenticated;

commit;
