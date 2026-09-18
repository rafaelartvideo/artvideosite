begin;

create or replace function private.storage_asset_organization_id(
  p_bucket_id text,
  p_name text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folders text[];
  v_organization_id uuid;
begin
  if p_bucket_id is null or p_name is null then
    return null;
  end if;

  v_folders := storage.foldername(p_name);
  v_organization_id := private.try_uuid(v_folders[1]);

  if v_organization_id is not null then
    return v_organization_id;
  end if;

  select media.organization_id
    into v_organization_id
  from public.media media
  where media.bucket_id = p_bucket_id
    and media.storage_path = p_name
  limit 1;

  return v_organization_id;
end;
$$;

revoke all on function private.storage_asset_organization_id(text,text) from public;

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
      or private.has_tenant_module_permission(
        v_organization_id,
        'company_settings',
        'settings.update'
      );
  elsif p_bucket_id = 'brand-images' then
    return private.has_tenant_module_permission(
      v_organization_id,
      'site_brands',
      p_permission_key
    );
  elsif p_bucket_id = 'product-images' then
    return private.has_tenant_module_permission(
      v_organization_id,
      'site_products',
      p_permission_key
    );
  elsif p_bucket_id = 'service-images' then
    if p_name like 'orders/%' or p_name like 'capture/%' then
      return false;
    end if;
    return private.has_tenant_module_permission(
      v_organization_id,
      'site_services',
      p_permission_key
    );
  end if;

  return false;
end;
$$;

revoke all on function private.can_manage_catalog_storage_object(text,text,text) from public;

create or replace function private.can_view_service_image_storage_object(
  p_name text,
  p_owner_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folders text[];
  v_order_id uuid;
  v_organization_id uuid;
begin
  if (select auth.uid()) is null or p_name is null then
    return false;
  end if;

  -- Primeiro resolve por vínculo real do registro de mídia.
  select coalesce(
      order_media.service_order_id,
      situation_media.service_order_id,
      checklist.service_order_id,
      attempt.service_order_id
    )
    into v_order_id
  from public.media media
  left join public.service_order_media order_media
    on order_media.media_id = media.id
  left join public.service_order_situation_media situation_media
    on situation_media.media_id = media.id
  left join public.service_order_checklist_item_media checklist_media
    on checklist_media.media_id = media.id
  left join public.service_order_checklist_items checklist_item
    on checklist_item.id = checklist_media.item_id
  left join public.service_order_checklist_stages checklist_stage
    on checklist_stage.id = checklist_item.stage_id
  left join public.service_order_checklists checklist
    on checklist.id = checklist_stage.checklist_id
  left join public.service_order_solution_attempt_media attempt_media
    on attempt_media.media_id = media.id
  left join public.service_order_solution_attempts attempt
    on attempt.id = attempt_media.solution_attempt_id
  where media.bucket_id = 'service-images'
    and media.storage_path = p_name
  limit 1;

  if v_order_id is not null then
    return private.can_view_service_order(v_order_id);
  end if;

  v_folders := storage.foldername(p_name);

  if coalesce(v_folders[1], '') <> 'orders' then
    return false;
  end if;

  -- orders/<organization_id>/draft/<arquivo>
  if v_folders[3] = 'draft' then
    v_organization_id := private.try_uuid(v_folders[2]);
    return v_organization_id is not null
      and p_owner_id = (select auth.uid())::text
      and private.is_organization_member(v_organization_id)
      and private.can_upload_service_order_storage_object(p_name);
  end if;

  -- orders/<organization_id>/<service_order_id>/mobile/<arquivo>
  if v_folders[4] = 'mobile' then
    v_organization_id := private.try_uuid(v_folders[2]);
    v_order_id := private.try_uuid(v_folders[3]);
    return v_organization_id is not null
      and v_order_id is not null
      and exists (
        select 1
        from public.service_orders service_order
        where service_order.id = v_order_id
          and service_order.organization_id = v_organization_id
      )
      and private.can_view_service_order(v_order_id);
  end if;

  -- orders/<service_order_id>/<escopo>/...
  v_order_id := private.try_uuid(v_folders[2]);
  if v_order_id is not null
     and exists (
       select 1
       from public.service_orders service_order
       where service_order.id = v_order_id
     ) then
    return private.can_view_service_order(v_order_id);
  end if;

  -- Legado/draft órfão: somente o próprio uploader.
  return p_owner_id = (select auth.uid())::text
    and private.can_upload_service_order_storage_object(p_name);
end;
$$;

revoke all on function private.can_view_service_image_storage_object(text,text) from public;
grant execute on function private.can_view_service_image_storage_object(text,text) to authenticated;

-- Compatibilidade para upload mobile no formato com organização antes da OS.
create or replace function private.can_upload_service_order_storage_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folders text[];
  v_second_id uuid;
  v_order_id uuid;
  v_organization_id uuid;
  v_situation_id uuid;
  v_scope text;
begin
  if (select auth.uid()) is null or p_name is null then
    return false;
  end if;

  v_folders := storage.foldername(p_name);

  if coalesce(v_folders[1], '') <> 'orders' then
    return false;
  end if;

  if coalesce(array_length(v_folders, 1), 0) = 1 then
    return exists (
      select 1
      from public.organization_members member
      where member.user_id = (select auth.uid())
        and member.status = 'active'
        and private.is_organization_module_enabled(member.organization_id, 'orders')
        and private.can_access_shared_organization_resource(member.organization_id, 'orders', 'manage')
        and private.has_effective_organization_permission(member.organization_id, 'orders.create')
    );
  end if;

  v_second_id := private.try_uuid(v_folders[2]);
  if v_second_id is null then
    return false;
  end if;

  if v_folders[3] = 'draft' then
    v_organization_id := v_second_id;
    return private.is_organization_module_enabled(v_organization_id, 'orders')
      and private.can_access_shared_organization_resource(v_organization_id, 'orders', 'manage')
      and private.has_effective_organization_permission(v_organization_id, 'orders.create');
  end if;

  if v_folders[4] = 'mobile' then
    v_organization_id := v_second_id;
    v_order_id := private.try_uuid(v_folders[3]);
    return v_order_id is not null
      and exists (
        select 1
        from public.service_orders service_order
        where service_order.id = v_order_id
          and service_order.organization_id = v_organization_id
      )
      and private.can_view_service_order(v_order_id)
      and private.can_access_shared_organization_resource(v_organization_id, 'orders', 'manage')
      and private.has_effective_organization_permission(
        v_organization_id,
        'orders.section.images'
      );
  end if;

  v_order_id := v_second_id;

  select service_order.organization_id
    into v_organization_id
  from public.service_orders service_order
  where service_order.id = v_order_id;

  if v_organization_id is null
     or not private.can_view_service_order(v_order_id)
     or not private.can_access_shared_organization_resource(v_organization_id, 'orders', 'manage') then
    return false;
  end if;

  v_scope := v_folders[3];

  if v_scope = 'situations' then
    v_situation_id := private.try_uuid(v_folders[4]);
    return v_situation_id is not null
      and private.can_attach_order_situation_media(v_order_id, v_situation_id);
  elsif v_scope = 'attachments' then
    return private.has_effective_organization_permission(
      v_organization_id,
      'orders.section.images'
    );
  elsif v_scope = 'solution' then
    return private.has_effective_organization_permission(
      v_organization_id,
      'orders.solve'
    );
  elsif v_scope = 'checklists' then
    return private.has_effective_organization_permission(
      v_organization_id,
      'orders.checklists.manage'
    );
  end if;

  return false;
end;
$$;

revoke all on function private.can_upload_service_order_storage_object(text) from public;

create or replace function private.can_insert_media_record(
  p_organization_id uuid,
  p_bucket_id text,
  p_storage_path text,
  p_uploaded_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or p_organization_id is null
     or p_uploaded_by is distinct from (select auth.uid()) then
    return false;
  end if;

  if p_bucket_id = 'service-images' then
    if p_storage_path like 'orders/%' then
      return private.can_upload_service_order_storage_object(p_storage_path);
    end if;
    return private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'services.create'
    ) or private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'services.update'
    );
  elsif p_bucket_id = 'public-assets' then
    return private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'settings.update'
    );
  elsif p_bucket_id = 'brand-images' then
    return private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'brands.create'
    ) or private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'brands.update'
    );
  elsif p_bucket_id = 'product-images' then
    return private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'products.create'
    ) or private.can_manage_catalog_storage_object(
      p_bucket_id, p_storage_path, 'products.update'
    );
  elsif p_bucket_id = 'registration-files' then
    return private.is_organization_member(p_organization_id)
      and private.has_effective_organization_permission(
        p_organization_id,
        'registrations.records.create'
      );
  elsif p_bucket_id = 'avatars' then
    return private.is_organization_member(p_organization_id);
  end if;

  return private.is_organization_member(p_organization_id);
end;
$$;

revoke all on function private.can_insert_media_record(uuid,text,text,uuid) from public;

-- Arquivos operacionais de OS deixam de ser publicamente endereçáveis.
update storage.buckets
set public = false
where id = 'service-images';

-- Policies de storage dos buckets de catálogo/branding e OS.
drop policy if exists "Public can view service images" on storage.objects;
drop policy if exists "Authorized users can upload service images" on storage.objects;
drop policy if exists "Authorized users can update service images" on storage.objects;
drop policy if exists "Authorized users can delete service images" on storage.objects;
drop policy if exists "Authorized users can upload public assets" on storage.objects;
drop policy if exists "Authorized users can update public assets" on storage.objects;
drop policy if exists "Authorized users can delete public assets" on storage.objects;
drop policy if exists "Authorized users can upload brand images" on storage.objects;
drop policy if exists "Authorized users can update brand images" on storage.objects;
drop policy if exists "Authorized users can delete brand images" on storage.objects;
drop policy if exists "Authorized users can upload product images" on storage.objects;
drop policy if exists "Authorized users can update product images" on storage.objects;
drop policy if exists "Authorized users can delete product images" on storage.objects;

create policy service_images_public_catalog_select
on storage.objects
for select to anon
using (
  bucket_id = 'service-images'
  and name not like 'orders/%'
  and name not like 'capture/%'
);

create policy service_images_authenticated_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'service-images'
  and (
    (name not like 'orders/%' and name not like 'capture/%')
    or private.can_view_service_image_storage_object(name, owner_id)
  )
);

create policy service_images_authenticated_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'service-images'
  and (
    private.can_upload_service_order_storage_object(name)
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.create'
    )
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.update'
    )
  )
);

create policy service_images_authenticated_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'service-images'
  and (
    private.can_upload_service_order_storage_object(name)
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.update'
    )
  )
)
with check (
  bucket_id = 'service-images'
  and (
    private.can_upload_service_order_storage_object(name)
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.update'
    )
  )
);

create policy service_images_authenticated_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'service-images'
  and (
    private.can_delete_service_order_storage_object(name, owner_id)
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.delete'
    )
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.create'
    )
    or private.can_manage_catalog_storage_object(
      bucket_id, name, 'services.update'
    )
  )
);

create policy public_assets_authenticated_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'public-assets'
  and private.can_manage_catalog_storage_object(
    bucket_id, name, 'settings.update'
  )
);

create policy public_assets_authenticated_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'public-assets'
  and private.can_manage_catalog_storage_object(
    bucket_id, name, 'settings.update'
  )
)
with check (
  bucket_id = 'public-assets'
  and private.can_manage_catalog_storage_object(
    bucket_id, name, 'settings.update'
  )
);

create policy public_assets_authenticated_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'public-assets'
  and private.can_manage_catalog_storage_object(
    bucket_id, name, 'settings.update'
  )
);

create policy brand_images_authenticated_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'brand-images'
  and (
    private.can_manage_catalog_storage_object(bucket_id, name, 'brands.create')
    or private.can_manage_catalog_storage_object(bucket_id, name, 'brands.update')
  )
);

create policy brand_images_authenticated_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'brand-images'
  and private.can_manage_catalog_storage_object(bucket_id, name, 'brands.update')
)
with check (
  bucket_id = 'brand-images'
  and private.can_manage_catalog_storage_object(bucket_id, name, 'brands.update')
);

create policy brand_images_authenticated_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'brand-images'
  and (
    private.can_manage_catalog_storage_object(bucket_id, name, 'brands.delete')
    or private.can_manage_catalog_storage_object(bucket_id, name, 'brands.create')
    or private.can_manage_catalog_storage_object(bucket_id, name, 'brands.update')
  )
);

create policy product_images_authenticated_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (
    private.can_manage_catalog_storage_object(bucket_id, name, 'products.create')
    or private.can_manage_catalog_storage_object(bucket_id, name, 'products.update')
  )
);

create policy product_images_authenticated_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'product-images'
  and private.can_manage_catalog_storage_object(bucket_id, name, 'products.update')
)
with check (
  bucket_id = 'product-images'
  and private.can_manage_catalog_storage_object(bucket_id, name, 'products.update')
);

create policy product_images_authenticated_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    private.can_manage_catalog_storage_object(bucket_id, name, 'products.delete')
    or private.can_manage_catalog_storage_object(bucket_id, name, 'products.create')
    or private.can_manage_catalog_storage_object(bucket_id, name, 'products.update')
  )
);

-- A tabela media deixa de expor todos os caminhos indiscriminadamente.
drop policy if exists anon_select_media on public.media;
drop policy if exists authenticated_select_media on public.media;
drop policy if exists authenticated_insert_media on public.media;

create policy media_public_select
on public.media
for select to anon
using (
  bucket_id in ('public-assets','brand-images','product-images')
  or (
    bucket_id = 'service-images'
    and storage_path not like 'orders/%'
    and storage_path not like 'capture/%'
  )
);

create policy media_authenticated_select
on public.media
for select to authenticated
using (
  bucket_id in ('public-assets','brand-images','product-images')
  or (
    bucket_id = 'service-images'
    and storage_path not like 'orders/%'
    and storage_path not like 'capture/%'
  )
  or (
    bucket_id = 'service-images'
    and private.can_view_service_image_storage_object(
      storage_path,
      uploaded_by::text
    )
  )
  or (
    bucket_id <> 'service-images'
    and private.is_organization_member(organization_id)
  )
  or (
    bucket_id = 'registration-files'
    and private.can_access_shared_organization_resource(
      organization_id,
      'customers',
      'read'
    )
    and private.has_effective_organization_permission(
      organization_id,
      'registrations.records.view'
    )
  )
);

create policy media_authenticated_insert
on public.media
for insert to authenticated
with check (
  private.can_insert_media_record(
    organization_id,
    bucket_id,
    storage_path,
    uploaded_by
  )
);

commit;
