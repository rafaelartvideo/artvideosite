begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:cleanup_failed_order_creation_media', 0)
);

create or replace function public.cleanup_failed_order_creation_media(
  p_order_id uuid,
  p_organization_id uuid,
  p_media_ids uuid[]
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
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_order_id is null or p_organization_id is null then
    raise exception 'Identificador da OS e empresa são obrigatórios.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_media_ids, 1), 0) = 0 then
    return;
  end if;

  if not private.is_organization_module_enabled(p_organization_id, 'orders')
     or not private.can_access_shared_organization_resource(
       p_organization_id,
       'orders',
       'manage'
     )
     or not private.has_effective_organization_permission(
       p_organization_id,
       'orders.create'
     ) then
    raise exception 'Sem permissão para limpar mídias da criação de OS.' using errcode = '42501';
  end if;

  -- Se a criação atômica tiver concluído e apenas a resposta tiver se perdido,
  -- a OS já existe. Nesse cenário nenhuma mídia pode ser removida.
  if exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_order_id
      and service_order.organization_id = p_organization_id
  ) then
    return;
  end if;

  -- Remove somente registros de mídia criados pelo próprio usuário para esta
  -- empresa, no bucket de imagens de serviço, e que continuam sem qualquer
  -- vínculo com OS. O DELETE acontece antes da remoção física do Storage para
  -- impedir que uma mídia vinculada seja apagada por corrida concorrente.
  return query
  delete from public.media media
  where media.id = any(p_media_ids)
    and media.organization_id = p_organization_id
    and media.uploaded_by = (select auth.uid())
    and media.bucket_id = 'service-images'
    and media.storage_path like 'orders/%'
    and not exists (
      select 1
      from public.service_order_media link
      where link.media_id = media.id
    )
    and not exists (
      select 1
      from public.service_order_situation_media situation_link
      where situation_link.media_id = media.id
    )
  returning media.id, media.bucket_id, media.storage_path;
end;
$$;

revoke all on function public.cleanup_failed_order_creation_media(uuid, uuid, uuid[]) from public;
grant execute on function public.cleanup_failed_order_creation_media(uuid, uuid, uuid[]) to authenticated;

comment on function public.cleanup_failed_order_creation_media(uuid, uuid, uuid[]) is
  'Remove metadados de imagens enviadas durante uma criação de OS que falhou. Nunca remove mídias se a OS idempotente já existir ou se houver vínculo com qualquer OS.';

commit;
