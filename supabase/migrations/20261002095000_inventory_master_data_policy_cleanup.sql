begin;

drop policy if exists product_categories_artvideo_admin on public.product_categories;
drop policy if exists product_categories_inventory_select on public.product_categories;
drop policy if exists product_categories_inventory_insert on public.product_categories;
drop policy if exists product_categories_inventory_update on public.product_categories;
drop policy if exists product_categories_inventory_delete on public.product_categories;

create policy product_categories_authenticated_select
on public.product_categories for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.view'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('categories.view')
      or private.has_artvideo_site_permission('categories.update')
      or private.has_artvideo_site_permission('categories.delete')
    )
  )
);

create policy product_categories_authenticated_insert
on public.product_categories for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('categories.create')
      or private.has_artvideo_site_permission('categories.update')
    )
  )
);

create policy product_categories_authenticated_update
on public.product_categories for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('categories.view')
      or private.has_artvideo_site_permission('categories.update')
      or private.has_artvideo_site_permission('categories.delete')
    )
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('categories.create')
      or private.has_artvideo_site_permission('categories.update')
    )
  )
);

create policy product_categories_authenticated_delete
on public.product_categories for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.categories.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('categories.view')
      or private.has_artvideo_site_permission('categories.update')
      or private.has_artvideo_site_permission('categories.delete')
    )
  )
);

drop policy if exists brands_artvideo_admin on public.brands;
drop policy if exists brands_inventory_select on public.brands;
drop policy if exists brands_inventory_insert on public.brands;
drop policy if exists brands_inventory_update on public.brands;
drop policy if exists brands_inventory_delete on public.brands;

create policy brands_authenticated_select
on public.brands for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.view'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('brands.view')
      or private.has_artvideo_site_permission('brands.update')
      or private.has_artvideo_site_permission('brands.delete')
    )
  )
);

create policy brands_authenticated_insert
on public.brands for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('brands.create')
      or private.has_artvideo_site_permission('brands.update')
    )
  )
);

create policy brands_authenticated_update
on public.brands for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('brands.view')
      or private.has_artvideo_site_permission('brands.update')
      or private.has_artvideo_site_permission('brands.delete')
    )
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('brands.create')
      or private.has_artvideo_site_permission('brands.update')
    )
  )
);

create policy brands_authenticated_delete
on public.brands for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,'inventory','inventory.brands.manage'
  )
  or (
    organization_id=public.artvideo_organization_id()
    and (
      private.has_artvideo_site_permission('brands.view')
      or private.has_artvideo_site_permission('brands.update')
      or private.has_artvideo_site_permission('brands.delete')
    )
  )
);

create index if not exists product_media_product_fk_idx
  on public.product_media(product_id);
create index if not exists product_media_created_by_idx
  on public.product_media(created_by)
  where created_by is not null;

revoke execute on function public.save_inventory_item_unified_v2(uuid,uuid,jsonb,jsonb,numeric,numeric) from authenticated;
revoke execute on function public.save_inventory_item_unified_v3(uuid,uuid,jsonb,jsonb,numeric,numeric) from authenticated;
revoke execute on function public.save_product_with_inventory_v1(uuid,uuid,jsonb,jsonb,numeric,numeric) from authenticated;
revoke execute on function public.save_product_with_inventory_v3(uuid,uuid,jsonb,jsonb,numeric,numeric) from authenticated;

commit;