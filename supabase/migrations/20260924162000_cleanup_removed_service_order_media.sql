begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:cleanup_removed_service_order_media', 0)
);

create or replace function public.remove_service_order_situation_media_and_cleanup(
  p_link_id uuid
)
returns table (
  media_id uuid,
  bucket_id text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.service_order_situation_media%rowtype;
  v_bucket_id text;
  v_storage_path text;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select *
    into v_link
  from public.service_order_situation_media
  where id = p_link_id;

  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'P0002';
  end if;

  if not private.can_view_service_order(v_link.service_order_id)
     or not private.can_access_shared_organization_resource(
       v_link.organization_id,
       'orders',
       'manage'
     )
     or not private.has_effective_organization_permission(
       v_link.organization_id,
       'orders.documents.remove'
     ) then
    raise exception 'Você não possui permissão para remover documentos desta OS nesta empresa.'
      using errcode = '42501';
  end if;

  select media.bucket_id, media.storage_path
    into v_bucket_id, v_storage_path
  from public.media media
  where media.id = v_link.media_id
    and media.organization_id = v_link.organization_id;

  delete from public.service_order_situation_media
  where id = p_link_id
    and organization_id = v_link.organization_id;

  -- Só remove o registro de mídia quando o arquivo ficou realmente órfão.
  -- As verificações explícitas protegem inclusive relações com ON DELETE CASCADE.
  if v_bucket_id = 'service-images'
     and v_storage_path like 'orders/%'
     and not exists (
       select 1 from public.service_order_media link
       where link.media_id = v_link.media_id
     )
     and not exists (
       select 1 from public.service_order_situation_media link
       where link.media_id = v_link.media_id
     )
     and not exists (
       select 1 from public.service_order_checklist_item_media link
       where link.media_id = v_link.media_id
     )
     and not exists (
       select 1 from public.service_order_solution_attempt_media link
       where link.media_id = v_link.media_id
     )
     and not exists (
       select 1 from public.entity_record_media link
       where link.media_id = v_link.media_id
     )
     and not exists (
       select 1
       from public.organization_company_settings settings
       where settings.logo_media_id = v_link.media_id
          or settings.menu_logo_media_id = v_link.media_id
     ) then
    delete from public.media media
    where media.id = v_link.media_id
      and media.organization_id = v_link.organization_id;

    if found then
      media_id := v_link.media_id;
      bucket_id := v_bucket_id;
      storage_path := v_storage_path;
      return next;
    end if;
  end if;

  return;
end;
$$;

revoke all on function public.remove_service_order_situation_media_and_cleanup(uuid) from public;
grant execute on function public.remove_service_order_situation_media_and_cleanup(uuid) to authenticated;

comment on function public.remove_service_order_situation_media_and_cleanup(uuid) is
  'Remove o vínculo de documento da OS e, quando a mídia não possui qualquer outro vínculo, remove também o registro de media e retorna bucket/caminho para exclusão via Storage API.';

commit;
