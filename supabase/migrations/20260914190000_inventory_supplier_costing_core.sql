begin;

alter table public.inventory_items
  add column if not exists average_cost numeric null,
  add column if not exists last_supplier_entity_id uuid null,
  add column if not exists last_purchase_at timestamptz null;

alter table public.inventory_items
  drop constraint if exists inventory_items_average_cost_nonnegative,
  add constraint inventory_items_average_cost_nonnegative check (average_cost is null or average_cost >= 0),
  drop constraint if exists inventory_items_purchase_price_nonnegative,
  add constraint inventory_items_purchase_price_nonnegative check (purchase_price is null or purchase_price >= 0);

alter table public.inventory_items
  drop constraint if exists inventory_items_last_supplier_org_fkey,
  add constraint inventory_items_last_supplier_org_fkey
    foreign key (last_supplier_entity_id, organization_id)
    references public.entities(id, organization_id)
    on update cascade
    on delete restrict;

alter table public.inventory_movements
  add column if not exists supplier_entity_id uuid null,
  add column if not exists unit_cost numeric null,
  add column if not exists input_unit_cost numeric null,
  add column if not exists total_cost numeric null,
  add column if not exists previous_quantity numeric null,
  add column if not exists resulting_quantity numeric null,
  add column if not exists average_cost_before numeric null,
  add column if not exists average_cost_after numeric null,
  add column if not exists purchase_reference text null,
  add column if not exists notes text null,
  add column if not exists movement_origin text not null default 'legacy';

alter table public.inventory_movements
  drop constraint if exists inventory_movements_unit_cost_nonnegative,
  add constraint inventory_movements_unit_cost_nonnegative check (unit_cost is null or unit_cost >= 0),
  drop constraint if exists inventory_movements_input_unit_cost_nonnegative,
  add constraint inventory_movements_input_unit_cost_nonnegative check (input_unit_cost is null or input_unit_cost >= 0),
  drop constraint if exists inventory_movements_total_cost_nonnegative,
  add constraint inventory_movements_total_cost_nonnegative check (total_cost is null or total_cost >= 0),
  drop constraint if exists inventory_movements_previous_quantity_nonnegative,
  add constraint inventory_movements_previous_quantity_nonnegative check (previous_quantity is null or previous_quantity >= 0),
  drop constraint if exists inventory_movements_resulting_quantity_nonnegative,
  add constraint inventory_movements_resulting_quantity_nonnegative check (resulting_quantity is null or resulting_quantity >= 0),
  drop constraint if exists inventory_movements_average_cost_before_nonnegative,
  add constraint inventory_movements_average_cost_before_nonnegative check (average_cost_before is null or average_cost_before >= 0),
  drop constraint if exists inventory_movements_average_cost_after_nonnegative,
  add constraint inventory_movements_average_cost_after_nonnegative check (average_cost_after is null or average_cost_after >= 0),
  drop constraint if exists inventory_movements_origin_check,
  add constraint inventory_movements_origin_check check (movement_origin in ('purchase','manual','initial_balance','service_order','return','legacy'));

alter table public.inventory_movements
  drop constraint if exists inventory_movements_supplier_org_fkey,
  add constraint inventory_movements_supplier_org_fkey
    foreign key (supplier_entity_id, organization_id)
    references public.entities(id, organization_id)
    on update cascade
    on delete restrict;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_inventory_item_id_fkey,
  add constraint inventory_movements_inventory_item_id_fkey
    foreign key (inventory_item_id)
    references public.inventory_items(id)
    on delete restrict;

create index if not exists inventory_movements_supplier_idx
  on public.inventory_movements (organization_id, supplier_entity_id, created_at desc)
  where supplier_entity_id is not null;
create index if not exists inventory_movements_item_created_idx
  on public.inventory_movements (organization_id, inventory_item_id, created_at desc);
create index if not exists inventory_items_last_supplier_idx
  on public.inventory_items (organization_id, last_supplier_entity_id)
  where last_supplier_entity_id is not null;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('inventory.suppliers.view', 'Visualizar fornecedores do item', 'Permite visualizar fornecedores vinculados aos itens do estoque.', 'Estoque — Fornecedores', 2305),
  ('inventory.suppliers.manage', 'Gerenciar fornecedores do item', 'Permite vincular e remover fornecedores dos itens do estoque.', 'Estoque — Fornecedores', 2306),
  ('inventory.costs.view', 'Visualizar custos do estoque', 'Permite visualizar último preço de compra, custo médio e valores das movimentações.', 'Estoque — Custos', 2307)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    module_name = excluded.module_name,
    sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, new_permission.id
from public.role_permissions rp
join public.permissions old_permission on old_permission.id = rp.permission_id
cross join public.permissions new_permission
where old_permission.key = 'inventory.view'
  and new_permission.key = 'inventory.suppliers.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, new_permission.id
from public.role_permissions rp
join public.permissions old_permission on old_permission.id = rp.permission_id
cross join public.permissions new_permission
where old_permission.key = 'inventory.update'
  and new_permission.key = 'inventory.suppliers.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, new_permission.id
from public.role_permissions rp
join public.permissions old_permission on old_permission.id = rp.permission_id
cross join public.permissions new_permission
where old_permission.key = 'inventory.table.purchase_price'
  and new_permission.key = 'inventory.costs.view'
on conflict do nothing;

drop policy if exists entity_supplier_items_select on public.entity_supplier_items;
create policy entity_supplier_items_select
on public.entity_supplier_items for select to authenticated
using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.manage')
  )
);

drop policy if exists entity_supplier_items_insert on public.entity_supplier_items;
create policy entity_supplier_items_insert
on public.entity_supplier_items for insert to authenticated
with check (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.create')
    or private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
    or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.manage')
  )
  and exists (
    select 1
    from public.entity_roles supplier_role
    where supplier_role.entity_id = entity_supplier_items.entity_id
      and supplier_role.role = 'supplier'
      and supplier_role.is_active = true
  )
);

drop policy if exists entity_supplier_items_delete on public.entity_supplier_items;
create policy entity_supplier_items_delete
on public.entity_supplier_items for delete to authenticated
using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
    or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.manage')
  )
);

update public.inventory_items
set average_cost = purchase_price
where average_cost is null
  and quantity > 0
  and purchase_price is not null;

revoke delete on table public.inventory_items from authenticated;
drop policy if exists inventory_items_tenant_delete on public.inventory_items;

commit;
