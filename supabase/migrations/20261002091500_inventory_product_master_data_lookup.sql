begin;

alter table public.products
  add column if not exists model text,
  add column if not exists manufacturer_code text,
  add column if not exists gpc_code text,
  add column if not exists gross_weight_grams numeric,
  add column if not exists net_weight_grams numeric,
  add column if not exists width_mm numeric,
  add column if not exists height_mm numeric,
  add column if not exists length_mm numeric,
  add column if not exists external_reference_price numeric,
  add column if not exists external_min_price numeric,
  add column if not exists external_max_price numeric,
  add column if not exists external_currency text,
  add column if not exists external_data_updated_at timestamptz;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass
      and conname='products_external_measurements_nonnegative'
  ) then
    alter table public.products
      add constraint products_external_measurements_nonnegative
      check (
        coalesce(gross_weight_grams,0) >= 0
        and coalesce(net_weight_grams,0) >= 0
        and coalesce(width_mm,0) >= 0
        and coalesce(height_mm,0) >= 0
        and coalesce(length_mm,0) >= 0
        and coalesce(external_reference_price,0) >= 0
        and coalesce(external_min_price,0) >= 0
        and coalesce(external_max_price,0) >= 0
      );
  end if;
end
$do$;

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id,product_id,media_id)
);

create index if not exists product_media_product_idx
  on public.product_media (organization_id,product_id,sort_order,id);
create index if not exists product_media_media_idx
  on public.product_media (media_id);

alter table public.product_media enable row level security;
revoke all on table public.product_media from anon,authenticated;
grant select,insert,update,delete on table public.product_media to authenticated;

drop policy if exists product_media_select on public.product_media;
create policy product_media_select
on public.product_media for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.view'
  )
);

drop policy if exists product_media_insert on public.product_media;
create policy product_media_insert
on public.product_media for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.update'
  )
  or private.has_tenant_module_permission(
    organization_id,'inventory','inventory.create'
  )
);

drop policy if exists product_media_update on public.product_media;
create policy product_media_update
on public.product_media for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.update'
  )
);

drop policy if exists product_media_delete on public.product_media;
create policy product_media_delete
on public.product_media for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.update'
  )
);

drop trigger if exists universal_audit_row_changes on public.product_media;
create trigger universal_audit_row_changes
after insert or update or delete on public.product_media
for each row execute function private.audit_log_row_change();

insert into public.permissions (key,label,description,module_name,sort_order)
values
  ('inventory.categories.view','Visualizar categorias','Permite visualizar categorias dos itens do estoque.','Estoque — Cadastros',2450),
  ('inventory.categories.manage','Gerenciar categorias','Permite criar e editar categorias dos itens do estoque.','Estoque — Cadastros',2451),
  ('inventory.brands.view','Visualizar marcas','Permite visualizar marcas dos itens do estoque.','Estoque — Cadastros',2452),
  ('inventory.brands.manage','Gerenciar marcas','Permite criar e editar marcas dos itens do estoque.','Estoque — Cadastros',2453)
on conflict (key) do update set
  label=excluded.label,
  description=excluded.description,
  module_name=excluded.module_name,
  sort_order=excluded.sort_order;

with role_access as (
  select distinct rp.role_id
  from public.role_permissions rp
  join public.permissions p on p.id=rp.permission_id
  where p.key='inventory.view'
), targets as (
  select id from public.permissions
  where key in ('inventory.categories.view','inventory.brands.view')
)
insert into public.role_permissions (role_id,permission_id)
select role_access.role_id,targets.id
from role_access cross join targets
on conflict (role_id,permission_id) do nothing;

with role_access as (
  select distinct rp.role_id
  from public.role_permissions rp
  join public.permissions p on p.id=rp.permission_id
  where p.key in ('inventory.create','inventory.update')
), targets as (
  select id from public.permissions
  where key in ('inventory.categories.manage','inventory.brands.manage')
)
insert into public.role_permissions (role_id,permission_id)
select role_access.role_id,targets.id
from role_access cross join targets
on conflict (role_id,permission_id) do nothing;

drop policy if exists product_categories_inventory_select on public.product_categories;
create policy product_categories_inventory_select
on public.product_categories for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.view'
  )
);

drop policy if exists product_categories_inventory_insert on public.product_categories;
create policy product_categories_inventory_insert
on public.product_categories for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
);

drop policy if exists product_categories_inventory_update on public.product_categories;
create policy product_categories_inventory_update
on public.product_categories for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
);

drop policy if exists product_categories_inventory_delete on public.product_categories;
create policy product_categories_inventory_delete
on public.product_categories for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
);

drop policy if exists brands_inventory_select on public.brands;
create policy brands_inventory_select
on public.brands for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.view'
  )
);

drop policy if exists brands_inventory_insert on public.brands;
create policy brands_inventory_insert
on public.brands for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
);

drop policy if exists brands_inventory_update on public.brands;
create policy brands_inventory_update
on public.brands for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
);

drop policy if exists brands_inventory_delete on public.brands;
create policy brands_inventory_delete
on public.brands for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
);

create or replace function public.save_product_with_inventory_v3(
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
set search_path=''
as $$
declare
  v_payload jsonb := coalesce(p_product,'{}'::jsonb);
  v_product_id uuid;
  v_category_id uuid := nullif(v_payload->>'category_id','')::uuid;
  v_brand_id uuid := nullif(v_payload->>'brand_id','')::uuid;
  v_is_artvideo boolean := p_organization_id=public.artvideo_organization_id();
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if v_category_id is not null and not exists (
    select 1 from public.product_categories category
    where category.id=v_category_id
      and category.organization_id=p_organization_id
  ) then
    raise exception 'A categoria selecionada não pertence a esta empresa.' using errcode='23503';
  end if;

  if v_brand_id is not null and not exists (
    select 1 from public.brands brand
    where brand.id=v_brand_id
      and brand.organization_id=p_organization_id
  ) then
    raise exception 'A marca selecionada não pertence a esta empresa.' using errcode='23503';
  end if;

  if not v_is_artvideo then
    v_payload := v_payload || jsonb_build_object(
      'show_in_catalog',false,
      'is_featured',false
    );
  end if;

  v_product_id := public.save_product_with_inventory_v1(
    p_organization_id,
    p_product_id,
    v_payload,
    p_inventory,
    p_initial_quantity,
    p_initial_unit_cost
  );

  update public.products product
     set model=nullif(btrim(coalesce(v_payload->>'model','')),''),
         manufacturer_code=nullif(btrim(coalesce(v_payload->>'manufacturer_code','')),''),
         gpc_code=nullif(btrim(coalesce(v_payload->>'gpc_code','')),''),
         gross_weight_grams=nullif(v_payload->>'gross_weight_grams','')::numeric,
         net_weight_grams=nullif(v_payload->>'net_weight_grams','')::numeric,
         width_mm=nullif(v_payload->>'width_mm','')::numeric,
         height_mm=nullif(v_payload->>'height_mm','')::numeric,
         length_mm=nullif(v_payload->>'length_mm','')::numeric,
         external_reference_price=nullif(v_payload->>'external_reference_price','')::numeric,
         external_min_price=nullif(v_payload->>'external_min_price','')::numeric,
         external_max_price=nullif(v_payload->>'external_max_price','')::numeric,
         external_currency=nullif(btrim(coalesce(v_payload->>'external_currency','')),''),
         external_data_updated_at=case
           when nullif(btrim(coalesce(v_payload->>'external_platform','')),'') is null then product.external_data_updated_at
           else now()
         end,
         updated_at=now()
   where product.organization_id=p_organization_id
     and product.id=v_product_id;

  return v_product_id;
end;
$$;

revoke all on function public.save_product_with_inventory_v3(uuid,uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.save_product_with_inventory_v3(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;

create or replace function public.save_inventory_item_unified_v3(
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
set search_path=''
as $$
declare
  v_product_id uuid;
  v_inventory_item_id uuid;
  v_is_create boolean := p_product_id is null;
  v_supplier_ids uuid[] := '{}'::uuid[];
  v_gallery_ids uuid[] := '{}'::uuid[];
  v_initial_supplier_id uuid := nullif(p_inventory->>'initial_supplier_entity_id','')::uuid;
  v_initial_reference text := nullif(btrim(coalesce(p_inventory->>'initial_reference','')), '');
  v_unit text := lower(btrim(coalesce(p_inventory->>'unit','un')));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if p_initial_quantity is null or p_initial_quantity < 0 then
    raise exception 'O saldo inicial não pode ser negativo.' using errcode='22023';
  end if;

  if p_initial_unit_cost is not null and p_initial_unit_cost < 0 then
    raise exception 'O custo inicial não pode ser negativo.' using errcode='22023';
  end if;

  v_product_id := public.save_product_with_inventory_v3(
    p_organization_id,
    p_product_id,
    p_product,
    p_inventory,
    0,
    null
  );

  select item.id
    into v_inventory_item_id
  from public.inventory_items item
  where item.organization_id=p_organization_id
    and item.product_id=v_product_id
  for update;

  if v_inventory_item_id is null then
    raise exception 'Estoque vinculado ao item não encontrado.' using errcode='P0002';
  end if;

  if p_inventory ? 'supplier_entity_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_supplier_ids
    from jsonb_array_elements_text(coalesce(p_inventory->'supplier_entity_ids','[]'::jsonb)) value;

    perform public.sync_inventory_item_suppliers(
      p_organization_id,
      v_inventory_item_id,
      v_supplier_ids
    );
  end if;

  if p_product ? 'gallery_media_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_gallery_ids
    from jsonb_array_elements_text(coalesce(p_product->'gallery_media_ids','[]'::jsonb)) value;

    if exists (
      select 1
      from unnest(v_gallery_ids) gallery(media_id)
      left join public.media media
        on media.id=gallery.media_id
       and media.organization_id=p_organization_id
       and media.bucket_id='product-images'
      where media.id is null
    ) then
      raise exception 'Há imagem do item que não pertence a esta empresa.' using errcode='23503';
    end if;

    delete from public.product_media product_media
    where product_media.organization_id=p_organization_id
      and product_media.product_id=v_product_id
      and not (product_media.media_id=any(v_gallery_ids));

    insert into public.product_media (
      organization_id,product_id,media_id,sort_order,created_by
    )
    select
      p_organization_id,
      v_product_id,
      gallery.media_id,
      gallery.ordinality::integer-1,
      auth.uid()
    from unnest(v_gallery_ids) with ordinality gallery(media_id,ordinality)
    on conflict (organization_id,product_id,media_id) do update set
      sort_order=excluded.sort_order;
  end if;

  if v_is_create and p_initial_quantity > 0 then
    perform public.record_inventory_movement(
      p_organization_id,
      v_inventory_item_id,
      'IN',
      p_initial_quantity,
      v_initial_supplier_id,
      p_initial_unit_cost,
      'Saldo inicial',
      v_initial_reference,
      null,
      'initial_balance',
      null,
      v_unit
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_inventory_item_unified_v3(uuid,uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.save_inventory_item_unified_v3(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;

create or replace function private.audit_module_for_table(p_table text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_table like 'pdv_%' then 'pdv'
    when p_table like 'financial_%' then 'finance'
    when p_table like 'inventory_%'
      or p_table='entity_supplier_items'
      or p_table in ('products','product_categories','brands','product_media')
      then 'inventory'
    when p_table like 'service_order_%' or p_table='service_orders' or p_table like 'checklist_%' then 'orders'
    when p_table like 'appointment_%' or p_table='appointments' then 'agenda'
    when p_table in ('customers','customer_addresses','customer_equipments') then 'customers'
    when p_table in ('entities','entity_addresses','entity_contacts','entity_records','entity_record_media') then 'registrations'
    when p_table in ('employees','roles','role_permissions','user_permission_overrides','organization_members') then 'employees'
    when p_table like 'equipment_%' or p_table='technical_fields' then 'equipment'
    when p_table in ('service_types','service_type_situations') then 'service_types'
    when p_table='os_situations' then 'order_situations'
    when p_table='order_statuses' then 'order_statuses'
    when p_table like 'print_template%' or p_table like 'document_signature%' or p_table='attachment_types' then 'documents'
    when p_table like 'quote_%' or p_table='request_statuses' then 'quotes'
    when p_table in ('services','service_categories','service_sections','service_inclusions','service_exclusions','service_faqs','service_price_factors','service_variants','service_filter_options') then 'site_services'
    when p_table in ('site_pages','site_page_sections','site_settings','navigation_items','contact_fields','filters','filter_options') then 'site_settings'
    when p_table='organization_company_settings' then 'company_settings'
    when p_table='organization_modules' then 'organizations'
    when p_table='general_services' then 'services'
    else 'system'
  end;
$$;

commit;