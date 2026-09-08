-- Multiempresa: isolamento completo do estoque por empresa.
-- Protege itens, movimentações e vínculos de peças usados pelas OS.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_inventory_scope', 0)
);

lock table public.inventory_items in access exclusive mode;
lock table public.inventory_movements in access exclusive mode;

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- A empresa de um item de estoque não pode ser alterada depois do cadastro.
drop trigger if exists inventory_items_prevent_organization_change on public.inventory_items;
create trigger inventory_items_prevent_organization_change
before update of organization_id on public.inventory_items
for each row
execute function private.prevent_organization_id_change();

create or replace function private.ensure_inventory_movement_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory_organization_id uuid;
  v_order_organization_id uuid;
  v_request_item_organization_id uuid;
begin
  select item.organization_id
    into v_inventory_organization_id
  from public.inventory_items item
  where item.id = new.inventory_item_id;

  if v_inventory_organization_id is null then
    raise exception 'Item do estoque não encontrado para a movimentação.'
      using errcode = '23503';
  end if;

  new.organization_id := v_inventory_organization_id;

  if new.service_order_id is not null then
    select service_order.organization_id
      into v_order_organization_id
    from public.service_orders service_order
    where service_order.id = new.service_order_id;

    if v_order_organization_id is null then
      raise exception 'OS não encontrada para a movimentação de estoque.'
        using errcode = '23503';
    end if;

    if v_order_organization_id is distinct from v_inventory_organization_id then
      raise exception 'A movimentação, o item do estoque e a OS devem pertencer à mesma empresa.'
        using errcode = '42501';
    end if;
  end if;

  if new.request_item_id is not null then
    select request_item.organization_id
      into v_request_item_organization_id
    from public.service_order_part_request_items request_item
    where request_item.id = new.request_item_id;

    if v_request_item_organization_id is null then
      raise exception 'Item da solicitação de peças não encontrado.'
        using errcode = '23503';
    end if;

    if v_request_item_organization_id is distinct from v_inventory_organization_id then
      raise exception 'A movimentação e a solicitação de peças devem pertencer à mesma empresa.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_inventory_movement_organization() from public;

drop trigger if exists inventory_movements_validate_organization on public.inventory_movements;
create trigger inventory_movements_validate_organization
before insert or update of inventory_item_id, service_order_id, request_item_id, organization_id
on public.inventory_movements
for each row
execute function private.ensure_inventory_movement_organization();

create or replace function private.ensure_order_inventory_item_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory_organization_id uuid;
  v_owner_organization_id uuid;
begin
  if new.inventory_item_id is null then
    return new;
  end if;

  select item.organization_id
    into v_inventory_organization_id
  from public.inventory_items item
  where item.id = new.inventory_item_id;

  if v_inventory_organization_id is null then
    raise exception 'Item do estoque não encontrado.'
      using errcode = '23503';
  end if;

  if tg_table_name = 'service_order_part_request_items' then
    select request.organization_id
      into v_owner_organization_id
    from public.service_order_part_requests request
    where request.id = new.request_id;
  elsif tg_table_name = 'service_order_used_items' then
    select service_order.organization_id
      into v_owner_organization_id
    from public.service_orders service_order
    where service_order.id = new.service_order_id;
  else
    raise exception 'Tabela não suportada pela validação de estoque.';
  end if;

  if v_owner_organization_id is null then
    raise exception 'Registro pai não encontrado para validar o item do estoque.'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_owner_organization_id then
    new.organization_id := v_owner_organization_id;
  end if;

  if v_inventory_organization_id is distinct from v_owner_organization_id then
    raise exception 'O item do estoque e a OS/solicitação devem pertencer à mesma empresa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_order_inventory_item_organization() from public;

do $$
begin
  if to_regclass('public.service_order_part_request_items') is not null then
    drop trigger if exists part_request_items_validate_inventory_organization
      on public.service_order_part_request_items;
    create trigger part_request_items_validate_inventory_organization
    before insert or update of inventory_item_id, request_id, organization_id
    on public.service_order_part_request_items
    for each row
    execute function private.ensure_order_inventory_item_organization();
  end if;

  if to_regclass('public.service_order_used_items') is not null then
    drop trigger if exists used_items_validate_inventory_organization
      on public.service_order_used_items;
    create trigger used_items_validate_inventory_organization
    before insert or update of inventory_item_id, service_order_id, organization_id
    on public.service_order_used_items
    for each row
    execute function private.ensure_order_inventory_item_organization();
  end if;
end
$$;

-- Remove policies authenticated antigas do estoque. Elas usavam permissões globais
-- e podiam expor registros de mais de uma empresa para o mesmo usuário.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('inventory_items', 'inventory_movements')
      and 'authenticated' = any (roles)
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  end loop;
end
$$;

create policy inventory_items_tenant_select
on public.inventory_items
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'read'
  )
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.table.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.details.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.movements.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.movements.create')
    or private.has_effective_organization_permission(organization_id, 'orders.request_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.manage_part_requests')
    or private.has_effective_organization_permission(organization_id, 'orders.dispatch_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.receive_returned_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.solve')
  )
);

create policy inventory_items_tenant_insert
on public.inventory_items
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'manage'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'inventory.create'
  )
);

create policy inventory_items_tenant_update
on public.inventory_items
for update
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'manage'
  )
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.update')
    or private.has_effective_organization_permission(organization_id, 'inventory.toggle_active')
    or private.has_effective_organization_permission(organization_id, 'inventory.movements.create')
    or private.has_effective_organization_permission(organization_id, 'orders.dispatch_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.receive_returned_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.solve')
  )
)
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'manage'
  )
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.update')
    or private.has_effective_organization_permission(organization_id, 'inventory.toggle_active')
    or private.has_effective_organization_permission(organization_id, 'inventory.movements.create')
    or private.has_effective_organization_permission(organization_id, 'orders.dispatch_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.receive_returned_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.solve')
  )
);

create policy inventory_items_tenant_delete
on public.inventory_items
for delete
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'manage'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'inventory.delete'
  )
);

create policy inventory_movements_tenant_select
on public.inventory_movements
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'read'
  )
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.movements.view')
    or private.has_effective_organization_permission(organization_id, 'orders.dispatch_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.receive_returned_parts')
  )
);

create policy inventory_movements_tenant_insert
on public.inventory_movements
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'inventory')
  and private.can_access_shared_organization_resource(
    organization_id,
    'inventory',
    'manage'
  )
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.movements.create')
    or private.has_effective_organization_permission(organization_id, 'orders.dispatch_parts')
    or private.has_effective_organization_permission(organization_id, 'orders.receive_returned_parts')
  )
);

-- Movimentações são histórico contábil de estoque: não são editáveis nem excluíveis
-- diretamente por usuários autenticados.

create index if not exists inventory_items_organization_name_idx
  on public.inventory_items (organization_id, name);
create index if not exists inventory_items_organization_active_idx
  on public.inventory_items (organization_id, is_active, name);
create index if not exists inventory_movements_organization_item_date_idx
  on public.inventory_movements (organization_id, inventory_item_id, created_at desc);

comment on function private.ensure_inventory_movement_organization() is
  'Faz a movimentação herdar a empresa do item e bloqueia vínculos com OS/solicitação de outra empresa.';
comment on function private.ensure_order_inventory_item_organization() is
  'Bloqueia uso ou solicitação de item de estoque pertencente a outra empresa.';

commit;
