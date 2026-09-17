create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

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

  -- Compatibilidade com o formato antigo da abertura da OS:
  -- orders/<arquivo>. O arquivo ainda nao possui o id da OS.
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

  -- Novo formato seguro para fotos ainda nao vinculadas a uma OS:
  -- orders/<organization_id>/draft/<arquivo>
  if v_folders[3] = 'draft' then
    v_organization_id := v_second_id;
    return private.is_organization_module_enabled(v_organization_id, 'orders')
      and private.can_access_shared_organization_resource(v_organization_id, 'orders', 'manage')
      and private.has_effective_organization_permission(v_organization_id, 'orders.create');
  end if;

  -- Demais caminhos usam o id da OS como segundo segmento:
  -- orders/<service_order_id>/<escopo>/...
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

create or replace function private.can_delete_service_order_storage_object(
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
  v_scope text;
begin
  if (select auth.uid()) is null or p_name is null then
    return false;
  end if;

  -- O proprio autor pode desfazer um upload que ele ainda teria permissao para realizar.
  if p_owner_id = (select auth.uid())::text
     and private.can_upload_service_order_storage_object(p_name) then
    return true;
  end if;

  v_folders := storage.foldername(p_name);
  if coalesce(v_folders[1], '') <> 'orders' then
    return false;
  end if;

  v_order_id := private.try_uuid(v_folders[2]);
  if v_order_id is null then
    return false;
  end if;

  v_scope := v_folders[3];
  if v_scope not in ('situations', 'attachments') then
    return false;
  end if;

  select service_order.organization_id
    into v_organization_id
  from public.service_orders service_order
  where service_order.id = v_order_id;

  return v_organization_id is not null
    and private.can_view_service_order(v_order_id)
    and private.can_access_shared_organization_resource(v_organization_id, 'orders', 'manage')
    and private.has_effective_organization_permission(
      v_organization_id,
      'orders.documents.remove'
    );
end;
$$;

-- O bucket service-images e compartilhado entre imagens dos Servicos do Site
-- e arquivos das OS. As policies antigas davam as permissoes services.* para
-- todo o bucket. Agora os namespaces reservados da OS ficam isolados.
drop policy if exists "Authorized users can upload service images" on storage.objects;
create policy "Authorized users can upload service images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and (
    (
      name not like 'orders/%'
      and name not like 'capture/%'
      and private.has_permission('services.create')
    )
    or private.can_upload_service_order_storage_object(name)
  )
);

drop policy if exists "Authorized users can update service images" on storage.objects;
create policy "Authorized users can update service images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'service-images'
  and (
    (
      name not like 'orders/%'
      and name not like 'capture/%'
      and private.has_permission('services.update')
    )
    or private.can_upload_service_order_storage_object(name)
  )
)
with check (
  bucket_id = 'service-images'
  and (
    (
      name not like 'orders/%'
      and name not like 'capture/%'
      and private.has_permission('services.update')
    )
    or private.can_upload_service_order_storage_object(name)
  )
);

drop policy if exists "Authorized users can delete service images" on storage.objects;
create policy "Authorized users can delete service images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'service-images'
  and (
    (
      name not like 'orders/%'
      and name not like 'capture/%'
      and private.has_permission('services.delete')
    )
    or private.can_delete_service_order_storage_object(name, owner_id)
  )
);
