-- Cadastro de classificações do estoque por empresa.
-- Categorias e marcas de produtos continuam em product_categories / brands.
-- Modelos compatíveis usam tipos e marcas de aparelhos próprios, sem misturar com marcas de produtos.
create table if not exists public.product_subcategories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 100),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_subcategories_parent_org_fk foreign key (organization_id,category_id)
    references public.product_categories(organization_id,id)
);
create unique index if not exists product_subcategories_org_id_key on public.product_subcategories(organization_id,id);
create unique index if not exists product_subcategories_org_parent_name_key
  on public.product_subcategories(organization_id,category_id,lower(btrim(name)));
create index if not exists product_subcategories_org_category_idx
  on public.product_subcategories(organization_id,category_id,is_active,sort_order);

create table if not exists public.inventory_device_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists inventory_device_types_org_name_key
  on public.inventory_device_types(organization_id,lower(btrim(name)));
create index if not exists inventory_device_types_org_active_idx
  on public.inventory_device_types(organization_id,is_active,sort_order);

create table if not exists public.inventory_device_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists inventory_device_brands_org_name_key
  on public.inventory_device_brands(organization_id,lower(btrim(name)));
create index if not exists inventory_device_brands_org_active_idx
  on public.inventory_device_brands(organization_id,is_active,sort_order);

alter table public.products add column if not exists subcategory_id uuid;
alter table public.products drop constraint if exists products_subcategory_org_fk;
alter table public.products add constraint products_subcategory_org_fk
  foreign key (organization_id,subcategory_id)
  references public.product_subcategories(organization_id,id);

alter table public.product_subcategories enable row level security;
alter table public.inventory_device_types enable row level security;
alter table public.inventory_device_brands enable row level security;

drop policy if exists product_subcategories_tenant_select on public.product_subcategories;
create policy product_subcategories_tenant_select on public.product_subcategories for select to authenticated
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(organization_id,'products','products.view')
);
drop policy if exists product_subcategories_tenant_insert on public.product_subcategories;
create policy product_subcategories_tenant_insert on public.product_subcategories for insert to authenticated
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);
drop policy if exists product_subcategories_tenant_update on public.product_subcategories;
create policy product_subcategories_tenant_update on public.product_subcategories for update to authenticated
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
)
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);

drop policy if exists inventory_device_types_tenant_select on public.inventory_device_types;
create policy inventory_device_types_tenant_select on public.inventory_device_types for select to authenticated
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(organization_id,'products','products.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);
drop policy if exists inventory_device_types_tenant_insert on public.inventory_device_types;
create policy inventory_device_types_tenant_insert on public.inventory_device_types for insert to authenticated
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);
drop policy if exists inventory_device_types_tenant_update on public.inventory_device_types;
create policy inventory_device_types_tenant_update on public.inventory_device_types for update to authenticated
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
)
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);

drop policy if exists inventory_device_brands_tenant_select on public.inventory_device_brands;
create policy inventory_device_brands_tenant_select on public.inventory_device_brands for select to authenticated
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(organization_id,'products','products.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);
drop policy if exists inventory_device_brands_tenant_insert on public.inventory_device_brands;
create policy inventory_device_brands_tenant_insert on public.inventory_device_brands for insert to authenticated
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);
drop policy if exists inventory_device_brands_tenant_update on public.inventory_device_brands;
create policy inventory_device_brands_tenant_update on public.inventory_device_brands for update to authenticated
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
)
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
);

grant select,insert,update on public.product_subcategories to authenticated;
grant select,insert,update on public.inventory_device_types to authenticated;
grant select,insert,update on public.inventory_device_brands to authenticated;
revoke all on public.product_subcategories from anon;
revoke all on public.inventory_device_types from anon;
revoke all on public.inventory_device_brands from anon;

-- Sugestões iniciais e importação dos modelos que já foram cadastrados,
-- mantendo todos os vínculos originais inalterados.
insert into public.inventory_device_types(organization_id,name,sort_order)
select org.organization_id,defaults.name,defaults.position
from (select distinct organization_id from public.products) org
cross join (values ('TV',0),('Monitor',1),('Ar-condicionado',2),('Projetor',3),
                   ('Som',4),('Receptor',5),('DVD/Blu-ray',6),('Outros',7)) as defaults(name,position)
on conflict do nothing;

insert into public.inventory_device_types(organization_id,name)
select distinct m.organization_id,btrim(m.device_type)
from public.product_device_compatible_models m
where btrim(m.device_type) <> ''
on conflict do nothing;

insert into public.inventory_device_brands(organization_id,name)
select distinct m.organization_id,btrim(m.brand)
from public.product_device_compatible_models m
where btrim(m.brand) <> ''
on conflict do nothing;

-- A versão v7 preserva o fluxo integral de v6 e grava a subcategoria na mesma transação.
create or replace function public.save_inventory_item_unified_v7(
  p_organization_id uuid, p_product_id uuid, p_product jsonb, p_inventory jsonb,
  p_initial_quantity numeric default 0, p_initial_unit_cost numeric default null
)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
  v_product_id uuid;
  v_subcategory_id uuid;
  v_category_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if p_product ? 'subcategory_id' and nullif(p_product->>'subcategory_id','') is not null then
    v_subcategory_id := (p_product->>'subcategory_id')::uuid;
    v_category_id := nullif(p_product->>'category_id','')::uuid;
    if v_category_id is null or not exists (
      select 1 from public.product_subcategories sub
      where sub.id=v_subcategory_id and sub.organization_id=p_organization_id
        and sub.category_id=v_category_id and sub.is_active
    ) then
      raise exception 'A subcategoria precisa pertencer à categoria selecionada na empresa.' using errcode='23514';
    end if;
  end if;

  v_product_id := public.save_inventory_item_unified_v6(
    p_organization_id,p_product_id,p_product,p_inventory,p_initial_quantity,p_initial_unit_cost);
  update public.products
  set subcategory_id=v_subcategory_id, updated_at=now()
  where organization_id=p_organization_id and id=v_product_id;
  return v_product_id;
end
$function$;
revoke all on function public.save_inventory_item_unified_v7(uuid,uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.save_inventory_item_unified_v7(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;