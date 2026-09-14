create or replace function public.sync_inventory_item_suppliers(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_supplier_entity_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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
    select 1
    from public.inventory_items item
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
  )
  and not exists (
    select 1
    from public.entity_supplier_items existing_link
    where existing_link.organization_id = p_organization_id
      and existing_link.inventory_item_id = p_inventory_item_id
      and existing_link.entity_id = supplier_id
  );

  if v_invalid_count > 0 then
    raise exception 'Há fornecedor inativo, inválido ou pertencente a outra empresa.' using errcode = '23514';
  end if;

  delete from public.entity_supplier_items link
  where link.organization_id = p_organization_id
    and link.inventory_item_id = p_inventory_item_id
    and not (link.entity_id = any(v_supplier_ids));

  insert into public.entity_supplier_items (
    organization_id,
    entity_id,
    inventory_item_id,
    created_by
  )
  select p_organization_id, supplier_id, p_inventory_item_id, v_user_id
  from unnest(v_supplier_ids) supplier_id
  where exists (
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
  on conflict (organization_id, entity_id, inventory_item_id) do nothing;
end;
$function$;

revoke all on function public.sync_inventory_item_suppliers(uuid, uuid, uuid[]) from public;
revoke all on function public.sync_inventory_item_suppliers(uuid, uuid, uuid[]) from anon;
grant execute on function public.sync_inventory_item_suppliers(uuid, uuid, uuid[]) to authenticated;
