begin;

-- Anexos classificados pertencem à OS e não a uma situação.
alter table public.service_order_situation_media
  alter column situation_id drop not null;

-- Remove o vínculo legado dos anexos classificados; fotos rápidas permanecem na situação.
update public.service_order_situation_media
set situation_id = null
where attachment_type_id is not null;

alter table public.service_order_situation_media
  drop constraint if exists service_order_situation_media_scope_check;

alter table public.service_order_situation_media
  add constraint service_order_situation_media_scope_check
  check (situation_id is not null or attachment_type_id is not null);

create or replace function public.attach_service_order_attachment(
  p_service_order_id uuid,
  p_media_id uuid,
  p_attachment_type_id uuid
)
returns public.service_order_situation_media
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.service_order_situation_media;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not private.has_permission('orders.section.images')
     or not private.can_view_service_order(p_service_order_id) then
    raise exception 'Você não possui permissão para anexar arquivos nesta OS.';
  end if;

  if not exists (select 1 from public.media m where m.id = p_media_id) then
    raise exception 'Arquivo de mídia não encontrado.';
  end if;

  if p_attachment_type_id is null or not exists (
    select 1
    from public.attachment_types t
    where t.id = p_attachment_type_id
      and t.is_active = true
  ) then
    raise exception 'Tipo de anexo inválido ou inativo.';
  end if;

  insert into public.service_order_situation_media (
    service_order_id,
    situation_id,
    media_id,
    attachment_type_id,
    uploaded_by
  ) values (
    p_service_order_id,
    null,
    p_media_id,
    p_attachment_type_id,
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.attach_service_order_attachment(uuid, uuid, uuid)
  to authenticated;

-- O bucket usado pelos documentos da OS deve aceitar qualquer MIME type.
update storage.buckets
set allowed_mime_types = null
where id = 'service-images';

commit;
