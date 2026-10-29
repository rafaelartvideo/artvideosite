-- Fotografias próprias do orçamento da OS, sem misturar com anexos e fotos das situações.
create table if not exists public.service_order_quote_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint service_order_quote_photos_unique unique(service_order_id, media_id)
);
create index if not exists service_order_quote_photos_order_idx
  on public.service_order_quote_photos (organization_id, service_order_id, created_at, id);
alter table public.service_order_quote_photos enable row level security;
grant select, insert on public.service_order_quote_photos to authenticated;

create policy service_order_quote_photos_read on public.service_order_quote_photos
  for select to authenticated using (
    exists (
      select 1 from public.service_orders os
      where os.id=service_order_id and os.organization_id=service_order_quote_photos.organization_id
    )
    and private.can_view_service_order(service_order_id)
    and private.has_effective_organization_permission(organization_id,'orders.view')
  );
create policy service_order_quote_photos_add on public.service_order_quote_photos
  for insert to authenticated with check (
    private.can_view_service_order(service_order_id)
    and private.can_access_shared_organization_resource(organization_id,'orders','manage')
    and private.has_effective_organization_permission(organization_id,'orders.section.images')
    and exists (
      select 1
      from public.service_orders os
      join public.service_types st on st.id=os.service_type_id
      where os.id=service_order_id
        and os.organization_id=service_order_quote_photos.organization_id
        and st.organization_id=service_order_quote_photos.organization_id
        and st.quote_workflow_enabled
        and os.completed_at is null
        and os.cancelled_at is null
    )
    and exists (
      select 1 from public.media m
      where m.id=media_id
        and m.organization_id=service_order_quote_photos.organization_id
        and m.uploaded_by=(select auth.uid())
        and m.bucket_id='service-images'
        and m.mime_type like 'image/%'
        and m.storage_path like 'orders/' || service_order_id::text || '/attachments/quote/%'
    )
  );

-- Remove a associação de forma autenticada e informa ao cliente o caminho do arquivo
-- apenas quando nenhum outro registro faz referência à mídia.
create or replace function public.remove_service_order_quote_photo_v1(p_photo_id uuid)
returns table(bucket_id text, storage_path text)
language plpgsql security definer set search_path=''
as $$
declare
  v_photo public.service_order_quote_photos%rowtype;
  v_media public.media%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  select * into v_photo from public.service_order_quote_photos where id=p_photo_id for update;
  if not found then
    raise exception 'Foto do orçamento não encontrada.' using errcode='P0002';
  end if;
  if not private.can_view_service_order(v_photo.service_order_id)
     or not private.can_access_shared_organization_resource(v_photo.organization_id,'orders','manage')
     or not private.has_effective_organization_permission(v_photo.organization_id,'orders.documents.remove') then
    raise exception 'Sem permissão para remover a foto do orçamento.' using errcode='42501';
  end if;
  select * into v_media from public.media
    where id=v_photo.media_id and organization_id=v_photo.organization_id;
  delete from public.service_order_quote_photos where id=p_photo_id;
  if v_media.id is not null
    and v_media.bucket_id='service-images'
    and v_media.storage_path like 'orders/' || v_photo.service_order_id::text || '/attachments/quote/%'
    and not exists (select 1 from public.service_order_quote_photos where media_id=v_media.id)
    and not exists (select 1 from public.service_order_media where media_id=v_media.id)
    and not exists (select 1 from public.service_order_situation_media where media_id=v_media.id)
    and not exists (select 1 from public.service_order_checklist_item_media where media_id=v_media.id)
    and not exists (select 1 from public.service_order_solution_attempt_media where media_id=v_media.id)
    and not exists (select 1 from public.entity_record_media where media_id=v_media.id)
  then
    delete from public.media where id=v_media.id;
    if found then
      bucket_id:=v_media.bucket_id;
      storage_path:=v_media.storage_path;
      return next;
    end if;
  end if;
end
$$;
revoke all on function public.remove_service_order_quote_photo_v1(uuid) from public, anon;
grant execute on function public.remove_service_order_quote_photo_v1(uuid) to authenticated;

-- Compensa um upload cuja associação não foi concluída, evitando metadados órfãos.
create or replace function public.discard_unlinked_service_order_quote_photo_v1(
  p_media_id uuid, p_organization_id uuid, p_order_id uuid
)
returns table(bucket_id text, storage_path text)
language plpgsql security definer set search_path=''
as $$
declare v_media public.media%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  select * into v_media from public.media where id=p_media_id and organization_id=p_organization_id for update;
  if not found or v_media.uploaded_by is distinct from (select auth.uid())
     or v_media.bucket_id<>'service-images'
     or v_media.storage_path not like 'orders/' || p_order_id::text || '/attachments/quote/%'
     or not private.can_view_service_order(p_order_id)
     or not exists (select 1 from public.service_orders os where os.id=p_order_id and os.organization_id=p_organization_id)
     or not private.has_effective_organization_permission(p_organization_id,'orders.section.images')
  then
    raise exception 'Mídia não encontrada ou sem permissão.' using errcode='42501';
  end if;
  if exists (select 1 from public.service_order_quote_photos where media_id=p_media_id)
     or exists (select 1 from public.service_order_media where media_id=p_media_id)
     or exists (select 1 from public.service_order_situation_media where media_id=p_media_id)
     or exists (select 1 from public.service_order_checklist_item_media where media_id=p_media_id)
     or exists (select 1 from public.service_order_solution_attempt_media where media_id=p_media_id)
     or exists (select 1 from public.entity_record_media where media_id=p_media_id)
  then
    return;
  end if;
  delete from public.media where id=p_media_id;
  if found then
    bucket_id:=v_media.bucket_id;
    storage_path:=v_media.storage_path;
    return next;
  end if;
end
$$;
revoke all on function public.discard_unlinked_service_order_quote_photo_v1(uuid,uuid,uuid) from public, anon;
grant execute on function public.discard_unlinked_service_order_quote_photo_v1(uuid,uuid,uuid) to authenticated;
