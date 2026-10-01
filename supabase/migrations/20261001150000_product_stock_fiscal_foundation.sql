begin;

-- Produtos passam a concentrar cadastro comercial, fiscal e publicação.
-- Estoque permanece em inventory_items para preservar saldo, custos e histórico.
alter table public.products
  alter column organization_id drop default,
  add column if not exists barcode text,
  add column if not exists commercial_unit text not null default 'un',
  add column if not exists ncm text,
  add column if not exists cest text,
  add column if not exists merchandise_origin smallint not null default 0,
  add column if not exists cfop_entry text,
  add column if not exists cfop_exit text,
  add column if not exists csosn text,
  add column if not exists cst_icms text,
  add column if not exists cst_pis text,
  add column if not exists cst_cofins text,
  add column if not exists cst_ipi text,
  add column if not exists internal_icms_rate numeric(7,4),
  add column if not exists calculate_entry_difal boolean not null default false,
  add column if not exists ipi_rate numeric(7,4),
  add column if not exists pis_rate numeric(7,4),
  add column if not exists cofins_rate numeric(7,4),
  add column if not exists tax_unit text,
  add column if not exists tax_barcode text,
  add column if not exists fiscal_benefit_code text,
  add column if not exists fiscal_notes text;

alter table public.products
  drop constraint if exists products_commercial_unit_check,
  add constraint products_commercial_unit_check check (commercial_unit in ('un','cx')),
  drop constraint if exists products_ncm_check,
  add constraint products_ncm_check check (ncm is null or ncm ~ '^[0-9]{1,8}$'),
  drop constraint if exists products_cest_check,
  add constraint products_cest_check check (cest is null or cest ~ '^[0-9]{7}$'),
  drop constraint if exists products_merchandise_origin_check,
  add constraint products_merchandise_origin_check check (merchandise_origin between 0 and 8),
  drop constraint if exists products_cfop_entry_check,
  add constraint products_cfop_entry_check check (cfop_entry is null or cfop_entry ~ '^[0-9]{4}$'),
  drop constraint if exists products_cfop_exit_check,
  add constraint products_cfop_exit_check check (cfop_exit is null or cfop_exit ~ '^[0-9]{4}$'),
  drop constraint if exists products_csosn_check,
  add constraint products_csosn_check check (csosn is null or csosn ~ '^[0-9]{3}$'),
  drop constraint if exists products_cst_icms_check,
  add constraint products_cst_icms_check check (cst_icms is null or cst_icms ~ '^[0-9]{3}$'),
  drop constraint if exists products_cst_pis_check,
  add constraint products_cst_pis_check check (cst_pis is null or cst_pis ~ '^[0-9]{2}$'),
  drop constraint if exists products_cst_cofins_check,
  add constraint products_cst_cofins_check check (cst_cofins is null or cst_cofins ~ '^[0-9]{2}$'),
  drop constraint if exists products_cst_ipi_check,
  add constraint products_cst_ipi_check check (cst_ipi is null or cst_ipi ~ '^[0-9]{2}$'),
  drop constraint if exists products_internal_icms_rate_check,
  add constraint products_internal_icms_rate_check check (internal_icms_rate is null or (internal_icms_rate >= 0 and internal_icms_rate <= 100)),
  drop constraint if exists products_ipi_rate_check,
  add constraint products_ipi_rate_check check (ipi_rate is null or (ipi_rate >= 0 and ipi_rate <= 100)),
  drop constraint if exists products_pis_rate_check,
  add constraint products_pis_rate_check check (pis_rate is null or (pis_rate >= 0 and pis_rate <= 100)),
  drop constraint if exists products_cofins_rate_check,
  add constraint products_cofins_rate_check check (cofins_rate is null or (cofins_rate >= 0 and cofins_rate <= 100));

create unique index if not exists products_organization_barcode_uidx
  on public.products (organization_id, barcode)
  where barcode is not null and btrim(barcode) <> '';

alter table public.inventory_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

create unique index if not exists inventory_items_organization_product_uidx
  on public.inventory_items (organization_id, product_id)
  where product_id is not null;

create index if not exists inventory_items_product_id_idx
  on public.inventory_items (product_id)
  where product_id is not null;

create or replace function private.validate_inventory_product_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.products product
    where product.id = new.product_id
      and product.organization_id = new.organization_id
  ) then
    raise exception 'O produto vinculado pertence a outra empresa ou não existe.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_inventory_product_tenant() from public;

drop trigger if exists inventory_items_validate_product_tenant on public.inventory_items;
create trigger inventory_items_validate_product_tenant
before insert or update of product_id, organization_id
on public.inventory_items
for each row execute function private.validate_inventory_product_tenant();

create or replace function private.sync_product_inventory_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_factor integer;
  v_sale_price numeric;
begin
  select item.*
    into v_item
  from public.inventory_items item
  where item.organization_id = new.organization_id
    and item.product_id = new.id
  limit 1;

  if not found then
    insert into public.inventory_items (
      organization_id, product_id, name, sku, description, unit, conversion_factor,
      quantity, min_quantity, sale_price, is_active
    )
    values (
      new.organization_id, new.id, new.name, new.sku, new.description,
      new.commercial_unit, 1, 0, 0, new.price, new.is_active
    );
    return new;
  end if;

  v_factor := greatest(1, coalesce(v_item.conversion_factor, 1));
  v_sale_price := case
    when new.price is null then null
    when v_item.unit = 'cx' then new.price / v_factor
    else new.price
  end;

  update public.inventory_items item
     set name = new.name,
         sku = new.sku,
         description = new.description,
         sale_price = v_sale_price,
         is_active = new.is_active,
         updated_at = now()
   where item.id = v_item.id;

  return new;
end;
$$;

revoke all on function private.sync_product_inventory_item() from public;

drop trigger if exists products_sync_inventory_item on public.products;
create trigger products_sync_inventory_item
after insert or update of name, sku, description, price, is_active
on public.products
for each row execute function private.sync_product_inventory_item();

insert into public.inventory_items (
  organization_id, product_id, name, sku, description, unit, conversion_factor,
  quantity, min_quantity, sale_price, is_active
)
select
  product.organization_id, product.id, product.name, product.sku, product.description,
  product.commercial_unit, 1, 0, 0, product.price, product.is_active
from public.products product
where not exists (
  select 1
  from public.inventory_items item
  where item.organization_id = product.organization_id
    and item.product_id = product.id
);

create or replace function public.get_product_inventory_management(
  p_organization_id uuid
)
returns table (
  product_id uuid,
  inventory_item_id uuid,
  unit text,
  conversion_factor integer,
  quantity numeric,
  min_quantity numeric,
  storage_shelf text,
  storage_level text,
  storage_compartment text,
  purchase_price numeric,
  average_cost numeric,
  last_purchase_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_view_costs boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not (
    private.has_tenant_module_permission(p_organization_id, 'products', 'products.view')
    or private.has_tenant_module_permission(p_organization_id, 'products', 'products.table.view')
    or private.has_tenant_module_permission(p_organization_id, 'products', 'products.details.view')
  ) then
    raise exception 'Sem permissão para visualizar produtos.' using errcode = '42501';
  end if;

  v_can_view_costs := private.has_effective_organization_permission(
    p_organization_id,
    'inventory.costs.view'
  );

  return query
  select
    item.product_id,
    item.id,
    item.unit,
    item.conversion_factor,
    item.quantity,
    item.min_quantity,
    item.storage_shelf,
    item.storage_level,
    item.storage_compartment,
    case when v_can_view_costs then item.purchase_price else null end,
    case when v_can_view_costs then item.average_cost else null end,
    case when v_can_view_costs then item.last_purchase_at else null end
  from public.inventory_items item
  where item.organization_id = p_organization_id
    and item.product_id is not null;
end;
$$;

revoke all on function public.get_product_inventory_management(uuid) from public;
revoke all on function public.get_product_inventory_management(uuid) from anon;
grant execute on function public.get_product_inventory_management(uuid) to authenticated;

create or replace function public.save_product_inventory_settings(
  p_organization_id uuid,
  p_product_id uuid,
  p_unit text,
  p_conversion_factor integer,
  p_min_quantity numeric,
  p_storage_shelf text default null,
  p_storage_level text default null,
  p_storage_compartment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_product public.products%rowtype;
  v_unit text := lower(btrim(coalesce(p_unit, 'un')));
  v_factor integer := greatest(1, coalesce(p_conversion_factor, 1));
  v_min_base numeric;
  v_sale_price numeric;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'products',
    'products.update'
  ) then
    raise exception 'Sem permissão para editar produtos.' using errcode = '42501';
  end if;

  if v_unit not in ('un','cx') then
    raise exception 'Unidade comercial inválida.' using errcode = '22023';
  end if;

  if p_min_quantity is null or p_min_quantity < 0 then
    raise exception 'O estoque mínimo não pode ser negativo.' using errcode = '22023';
  end if;

  select product.*
    into v_product
  from public.products product
  where product.id = p_product_id
    and product.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Produto não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  select item.*
    into v_item
  from public.inventory_items item
  where item.organization_id = p_organization_id
    and item.product_id = p_product_id
  for update;

  if not found then
    insert into public.inventory_items (
      organization_id, product_id, name, sku, description, unit,
      conversion_factor, quantity, min_quantity, sale_price, is_active,
      storage_shelf, storage_level, storage_compartment
    )
    values (
      p_organization_id, p_product_id, v_product.name, v_product.sku,
      v_product.description, v_unit, v_factor, 0,
      case when v_unit = 'cx' then p_min_quantity * v_factor else p_min_quantity end,
      case
        when v_product.price is null then null
        when v_unit = 'cx' then v_product.price / v_factor
        else v_product.price
      end,
      v_product.is_active,
      nullif(btrim(coalesce(p_storage_shelf, '')), ''),
      nullif(btrim(coalesce(p_storage_level, '')), ''),
      nullif(btrim(coalesce(p_storage_compartment, '')), '')
    )
    returning * into v_item;
  else
    v_min_base := case when v_unit = 'cx' then p_min_quantity * v_factor else p_min_quantity end;
    v_sale_price := case
      when v_product.price is null then null
      when v_unit = 'cx' then v_product.price / v_factor
      else v_product.price
    end;

    update public.inventory_items item
       set unit = v_unit,
           conversion_factor = v_factor,
           min_quantity = v_min_base,
           sale_price = v_sale_price,
           storage_shelf = nullif(btrim(coalesce(p_storage_shelf, '')), ''),
           storage_level = nullif(btrim(coalesce(p_storage_level, '')), ''),
           storage_compartment = nullif(btrim(coalesce(p_storage_compartment, '')), ''),
           updated_at = now()
     where item.id = v_item.id
     returning * into v_item;
  end if;

  update public.products product
     set commercial_unit = v_unit,
         updated_at = now()
   where product.id = p_product_id
     and product.organization_id = p_organization_id;

  return v_item.id;
end;
$$;

revoke all on function public.save_product_inventory_settings(uuid,uuid,text,integer,numeric,text,text,text) from public;
revoke all on function public.save_product_inventory_settings(uuid,uuid,text,integer,numeric,text,text,text) from anon;
grant execute on function public.save_product_inventory_settings(uuid,uuid,text,integer,numeric,text,text,text) to authenticated;

create or replace function public.initialize_product_inventory_balance(
  p_organization_id uuid,
  p_product_id uuid,
  p_input_quantity numeric,
  p_input_unit_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_factor integer;
  v_base_quantity numeric;
  v_base_cost numeric;
  v_total_cost numeric;
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not (
    private.has_tenant_module_permission(p_organization_id, 'products', 'products.create')
    or private.has_tenant_module_permission(p_organization_id, 'products', 'products.update')
  ) then
    raise exception 'Sem permissão para cadastrar produtos.' using errcode = '42501';
  end if;

  if p_input_quantity is null or p_input_quantity < 0 then
    raise exception 'O saldo inicial não pode ser negativo.' using errcode = '22023';
  end if;

  if p_input_unit_cost is not null and p_input_unit_cost < 0 then
    raise exception 'O custo inicial não pode ser negativo.' using errcode = '22023';
  end if;

  select item.*
    into v_item
  from public.inventory_items item
  where item.organization_id = p_organization_id
    and item.product_id = p_product_id
  for update;

  if not found then
    raise exception 'Estoque vinculado ao produto não encontrado.' using errcode = 'P0002';
  end if;

  if coalesce(v_item.quantity, 0) <> 0 or exists (
    select 1
    from public.inventory_movements movement
    where movement.inventory_item_id = v_item.id
      and movement.organization_id = p_organization_id
  ) then
    raise exception 'O saldo inicial só pode ser definido antes da primeira movimentação.'
      using errcode = '23514';
  end if;

  if p_input_quantity = 0 then
    return v_item.id;
  end if;

  v_factor := greatest(1, coalesce(v_item.conversion_factor, 1));
  v_base_quantity := case when v_item.unit = 'cx' then p_input_quantity * v_factor else p_input_quantity end;
  v_base_cost := case
    when p_input_unit_cost is null then null
    when v_item.unit = 'cx' then p_input_unit_cost / v_factor
    else p_input_unit_cost
  end;
  v_total_cost := case
    when p_input_unit_cost is null then null
    else p_input_quantity * p_input_unit_cost
  end;

  insert into public.inventory_movements (
    organization_id, inventory_item_id, movement_type, quantity, reason, created_by,
    input_unit, input_quantity, conversion_factor_snapshot, unit_cost, input_unit_cost,
    total_cost, previous_quantity, resulting_quantity, average_cost_before,
    average_cost_after, purchase_reference, notes, movement_origin
  )
  values (
    p_organization_id, v_item.id, 'IN', v_base_quantity,
    'Saldo inicial do cadastro do produto', v_user_id, v_item.unit,
    p_input_quantity, v_factor, v_base_cost, p_input_unit_cost, v_total_cost,
    0, v_base_quantity, null, v_base_cost, null, null, 'initial_balance'
  )
  returning id into v_movement_id;

  update public.inventory_items item
     set quantity = v_base_quantity,
         purchase_price = v_base_cost,
         average_cost = v_base_cost,
         updated_at = now()
   where item.id = v_item.id;

  return v_movement_id;
end;
$$;

revoke all on function public.initialize_product_inventory_balance(uuid,uuid,numeric,numeric) from public;
revoke all on function public.initialize_product_inventory_balance(uuid,uuid,numeric,numeric) from anon;
grant execute on function public.initialize_product_inventory_balance(uuid,uuid,numeric,numeric) to authenticated;

create or replace function public.save_product_with_inventory_v1(
  p_organization_id uuid,
  p_product_id uuid,
  p_product jsonb,
  p_inventory jsonb,
  p_initial_quantity numeric default 0,
  p_initial_unit_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_id uuid;
  v_is_create boolean := p_product_id is null;
  v_unit text := lower(btrim(coalesce(p_inventory->>'unit', p_product->>'commercial_unit', 'un')));
  v_factor integer := greatest(1, coalesce(nullif(p_inventory->>'conversion_factor','')::integer, 1));
  v_min_quantity numeric := coalesce(nullif(p_inventory->>'min_quantity','')::numeric, 0);
  v_min_base numeric;
  v_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if v_is_create then
    if not private.has_tenant_module_permission(p_organization_id, 'products', 'products.create') then
      raise exception 'Sem permissão para criar produtos.' using errcode = '42501';
    end if;
  else
    if not private.has_tenant_module_permission(p_organization_id, 'products', 'products.update') then
      raise exception 'Sem permissão para editar produtos.' using errcode = '42501';
    end if;
  end if;

  if nullif(btrim(coalesce(p_product->>'name', '')), '') is null then
    raise exception 'Informe o nome do produto.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_product->>'slug', '')), '') is null then
    raise exception 'Informe o identificador do produto.' using errcode = '22023';
  end if;

  if v_unit not in ('un','cx') then
    raise exception 'Unidade comercial inválida.' using errcode = '22023';
  end if;

  if v_min_quantity < 0 or p_initial_quantity is null or p_initial_quantity < 0 then
    raise exception 'Quantidades do produto não podem ser negativas.' using errcode = '22023';
  end if;

  if p_initial_unit_cost is not null and p_initial_unit_cost < 0 then
    raise exception 'O custo inicial não pode ser negativo.' using errcode = '22023';
  end if;

  if v_is_create then
    insert into public.products (
      organization_id, category_id, brand_id, name, slug, sku, barcode, commercial_unit,
      short_description, description, price, compare_at_price, cover_media_id, is_active,
      show_in_catalog, is_featured, ncm, cest, merchandise_origin, cfop_entry, cfop_exit,
      csosn, cst_icms, cst_pis, cst_cofins, cst_ipi, internal_icms_rate,
      calculate_entry_difal, ipi_rate, pis_rate, cofins_rate, tax_unit, tax_barcode,
      fiscal_benefit_code, fiscal_notes, external_platform, external_product_id,
      external_url, created_by, updated_by
    )
    values (
      p_organization_id,
      nullif(p_product->>'category_id','')::uuid,
      nullif(p_product->>'brand_id','')::uuid,
      btrim(p_product->>'name'),
      btrim(p_product->>'slug'),
      nullif(btrim(coalesce(p_product->>'sku','')), ''),
      nullif(btrim(coalesce(p_product->>'barcode','')), ''),
      v_unit,
      nullif(btrim(coalesce(p_product->>'short_description','')), ''),
      nullif(btrim(coalesce(p_product->>'description','')), ''),
      nullif(p_product->>'price','')::numeric,
      nullif(p_product->>'compare_at_price','')::numeric,
      nullif(p_product->>'cover_media_id','')::uuid,
      coalesce((p_product->>'is_active')::boolean, true),
      coalesce((p_product->>'show_in_catalog')::boolean, false),
      coalesce((p_product->>'is_featured')::boolean, false),
      nullif(btrim(coalesce(p_product->>'ncm','')), ''),
      nullif(btrim(coalesce(p_product->>'cest','')), ''),
      coalesce(nullif(p_product->>'merchandise_origin','')::smallint, 0),
      nullif(btrim(coalesce(p_product->>'cfop_entry','')), ''),
      nullif(btrim(coalesce(p_product->>'cfop_exit','')), ''),
      nullif(btrim(coalesce(p_product->>'csosn','')), ''),
      nullif(btrim(coalesce(p_product->>'cst_icms','')), ''),
      nullif(btrim(coalesce(p_product->>'cst_pis','')), ''),
      nullif(btrim(coalesce(p_product->>'cst_cofins','')), ''),
      nullif(btrim(coalesce(p_product->>'cst_ipi','')), ''),
      nullif(p_product->>'internal_icms_rate','')::numeric,
      coalesce((p_product->>'calculate_entry_difal')::boolean, false),
      nullif(p_product->>'ipi_rate','')::numeric,
      nullif(p_product->>'pis_rate','')::numeric,
      nullif(p_product->>'cofins_rate','')::numeric,
      nullif(btrim(coalesce(p_product->>'tax_unit','')), ''),
      nullif(btrim(coalesce(p_product->>'tax_barcode','')), ''),
      nullif(btrim(coalesce(p_product->>'fiscal_benefit_code','')), ''),
      nullif(btrim(coalesce(p_product->>'fiscal_notes','')), ''),
      nullif(btrim(coalesce(p_product->>'external_platform','')), ''),
      nullif(btrim(coalesce(p_product->>'external_product_id','')), ''),
      nullif(btrim(coalesce(p_product->>'external_url','')), ''),
      v_user_id,
      v_user_id
    )
    returning id into v_product_id;
  else
    update public.products product
       set category_id = nullif(p_product->>'category_id','')::uuid,
           brand_id = nullif(p_product->>'brand_id','')::uuid,
           name = btrim(p_product->>'name'),
           slug = btrim(p_product->>'slug'),
           sku = nullif(btrim(coalesce(p_product->>'sku','')), ''),
           barcode = nullif(btrim(coalesce(p_product->>'barcode','')), ''),
           commercial_unit = v_unit,
           short_description = nullif(btrim(coalesce(p_product->>'short_description','')), ''),
           description = nullif(btrim(coalesce(p_product->>'description','')), ''),
           price = nullif(p_product->>'price','')::numeric,
           compare_at_price = nullif(p_product->>'compare_at_price','')::numeric,
           cover_media_id = nullif(p_product->>'cover_media_id','')::uuid,
           is_active = coalesce((p_product->>'is_active')::boolean, true),
           show_in_catalog = coalesce((p_product->>'show_in_catalog')::boolean, false),
           is_featured = coalesce((p_product->>'is_featured')::boolean, false),
           ncm = nullif(btrim(coalesce(p_product->>'ncm','')), ''),
           cest = nullif(btrim(coalesce(p_product->>'cest','')), ''),
           merchandise_origin = coalesce(nullif(p_product->>'merchandise_origin','')::smallint, 0),
           cfop_entry = nullif(btrim(coalesce(p_product->>'cfop_entry','')), ''),
           cfop_exit = nullif(btrim(coalesce(p_product->>'cfop_exit','')), ''),
           csosn = nullif(btrim(coalesce(p_product->>'csosn','')), ''),
           cst_icms = nullif(btrim(coalesce(p_product->>'cst_icms','')), ''),
           cst_pis = nullif(btrim(coalesce(p_product->>'cst_pis','')), ''),
           cst_cofins = nullif(btrim(coalesce(p_product->>'cst_cofins','')), ''),
           cst_ipi = nullif(btrim(coalesce(p_product->>'cst_ipi','')), ''),
           internal_icms_rate = nullif(p_product->>'internal_icms_rate','')::numeric,
           calculate_entry_difal = coalesce((p_product->>'calculate_entry_difal')::boolean, false),
           ipi_rate = nullif(p_product->>'ipi_rate','')::numeric,
           pis_rate = nullif(p_product->>'pis_rate','')::numeric,
           cofins_rate = nullif(p_product->>'cofins_rate','')::numeric,
           tax_unit = nullif(btrim(coalesce(p_product->>'tax_unit','')), ''),
           tax_barcode = nullif(btrim(coalesce(p_product->>'tax_barcode','')), ''),
           fiscal_benefit_code = nullif(btrim(coalesce(p_product->>'fiscal_benefit_code','')), ''),
           fiscal_notes = nullif(btrim(coalesce(p_product->>'fiscal_notes','')), ''),
           external_platform = nullif(btrim(coalesce(p_product->>'external_platform','')), ''),
           external_product_id = nullif(btrim(coalesce(p_product->>'external_product_id','')), ''),
           external_url = nullif(btrim(coalesce(p_product->>'external_url','')), ''),
           updated_by = v_user_id,
           updated_at = now()
     where product.id = p_product_id
       and product.organization_id = p_organization_id
     returning product.id into v_product_id;

    if v_product_id is null then
      raise exception 'Produto não encontrado nesta empresa.' using errcode = 'P0002';
    end if;
  end if;

  v_min_base := case when v_unit = 'cx' then v_min_quantity * v_factor else v_min_quantity end;

  select item.id
    into v_item_id
  from public.inventory_items item
  where item.organization_id = p_organization_id
    and item.product_id = v_product_id
  for update;

  if v_item_id is null then
    insert into public.inventory_items (
      organization_id, product_id, name, sku, description, unit, conversion_factor,
      quantity, min_quantity, sale_price, is_active, storage_shelf, storage_level,
      storage_compartment
    )
    select
      product.organization_id, product.id, product.name, product.sku, product.description,
      v_unit, v_factor, 0, v_min_base,
      case
        when product.price is null then null
        when v_unit = 'cx' then product.price / v_factor
        else product.price
      end,
      product.is_active,
      nullif(btrim(coalesce(p_inventory->>'storage_shelf','')), ''),
      nullif(btrim(coalesce(p_inventory->>'storage_level','')), ''),
      nullif(btrim(coalesce(p_inventory->>'storage_compartment','')), '')
    from public.products product
    where product.id = v_product_id
    returning id into v_item_id;
  else
    update public.inventory_items item
       set unit = v_unit,
           conversion_factor = v_factor,
           min_quantity = v_min_base,
           storage_shelf = nullif(btrim(coalesce(p_inventory->>'storage_shelf','')), ''),
           storage_level = nullif(btrim(coalesce(p_inventory->>'storage_level','')), ''),
           storage_compartment = nullif(btrim(coalesce(p_inventory->>'storage_compartment','')), ''),
           sale_price = (
             select case
               when product.price is null then null
               when v_unit = 'cx' then product.price / v_factor
               else product.price
             end
             from public.products product
             where product.id = v_product_id
           ),
           updated_at = now()
     where item.id = v_item_id;
  end if;

  if v_is_create and p_initial_quantity > 0 then
    perform public.initialize_product_inventory_balance(
      p_organization_id,
      v_product_id,
      p_initial_quantity,
      p_initial_unit_cost
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_product_with_inventory_v1(uuid,uuid,jsonb,jsonb,numeric,numeric) from public;
revoke all on function public.save_product_with_inventory_v1(uuid,uuid,jsonb,jsonb,numeric,numeric) from anon;
grant execute on function public.save_product_with_inventory_v1(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;

-- Product images are a normal product capability for all tenants.
create or replace function private.can_manage_catalog_storage_object(
  p_bucket_id text,
  p_name text,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := private.storage_asset_organization_id(p_bucket_id, p_name);
  if v_organization_id is null then
    return false;
  end if;

  if p_bucket_id = 'public-assets' then
    return private.has_platform_permission('organizations.edit')
      or private.has_tenant_module_permission(v_organization_id, 'company_settings', 'settings.update');
  elsif p_bucket_id = 'brand-images' then
    return private.has_tenant_module_permission(v_organization_id, 'site_brands', p_permission_key);
  elsif p_bucket_id = 'product-images' then
    return private.has_tenant_module_permission(v_organization_id, 'products', p_permission_key);
  elsif p_bucket_id = 'service-images' then
    if p_name like 'orders/%' or p_name like 'capture/%' then
      return false;
    end if;
    return private.has_tenant_module_permission(v_organization_id, 'site_services', p_permission_key);
  end if;

  return false;
end;
$$;

-- O catálogo público pode ler somente colunas públicas do produto.
revoke select on table public.products from anon;
revoke insert, update, delete, truncate, references, trigger on table public.products from anon;

grant select (
  id,
  organization_id,
  category_id,
  brand_id,
  name,
  slug,
  short_description,
  description,
  price,
  compare_at_price,
  cover_media_id,
  is_active,
  is_featured,
  created_at,
  updated_at,
  show_in_catalog
) on table public.products to anon;

comment on column public.inventory_items.product_id is
  'Produto comercial vinculado. Itens sem product_id continuam sendo peças/itens exclusivos do estoque.';
comment on column public.products.ncm is 'NCM do produto, com até 8 dígitos.';
comment on column public.products.cest is 'CEST do produto, com 7 dígitos quando aplicável.';
comment on column public.products.merchandise_origin is 'Origem fiscal da mercadoria conforme tabela da NF-e.';
comment on column public.products.calculate_entry_difal is
  'Indica se o produto deve considerar diferencial de ICMS em compra interestadual, quando o recurso fiscal estiver habilitado.';

commit;
