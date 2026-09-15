begin;

create or replace function public.attach_service_order_checklist_media(p_item_id uuid, p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.service_order_checklist_items%rowtype;
  v_stage public.service_order_checklist_stages%rowtype;
  v_checklist public.service_order_checklists%rowtype;
  v_media_org uuid;
begin
  select * into v_item
  from public.service_order_checklist_items
  where id = p_item_id;

  if not found then
    raise exception 'Item de checklist não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_stage
  from public.service_order_checklist_stages
  where id = v_item.stage_id;

  select * into v_checklist
  from public.service_order_checklists
  where id = v_stage.checklist_id;

  if auth.uid() is null
     or not private.can_access_service_order_child(v_checklist.service_order_id, 'orders.checklists.manage', 'manage') then
    raise exception 'Você não possui permissão para anexar fotos ao checklist.' using errcode = '42501';
  end if;

  if v_stage.status = 'completed' then
    raise exception 'Reabra a etapa antes de anexar novas fotos.' using errcode = 'P0001';
  end if;

  select organization_id into v_media_org
  from public.media
  where id = p_media_id;

  if v_media_org is distinct from v_checklist.organization_id then
    raise exception 'Mídia inválida para esta empresa.' using errcode = '23514';
  end if;

  insert into public.service_order_checklist_item_media (
    organization_id,
    item_id,
    media_id,
    created_by
  ) values (
    v_checklist.organization_id,
    p_item_id,
    p_media_id,
    auth.uid()
  )
  on conflict (item_id, media_id) do nothing;

  insert into public.service_order_checklist_events (
    organization_id,
    checklist_id,
    service_order_id,
    stage_id,
    item_id,
    event_type,
    payload,
    created_by
  ) values (
    v_checklist.organization_id,
    v_checklist.id,
    v_checklist.service_order_id,
    v_stage.id,
    v_item.id,
    'media_attached',
    jsonb_build_object('media_id', p_media_id),
    auth.uid()
  );
end;
$$;

-- Corrige vínculos antigos criados automaticamente pelo fluxo de checklist.
-- A mídia permanece preservada exclusivamente no vínculo do item do checklist.
delete from public.service_order_situation_media situation_link
using public.service_order_checklist_item_media checklist_media,
      public.service_order_checklist_items checklist_item,
      public.service_order_checklist_stages checklist_stage,
      public.service_order_checklists checklist
where checklist_media.item_id = checklist_item.id
  and checklist_item.stage_id = checklist_stage.id
  and checklist_stage.checklist_id = checklist.id
  and situation_link.media_id = checklist_media.media_id
  and situation_link.service_order_id = checklist.service_order_id;

delete from public.service_order_media order_link
using public.service_order_checklist_item_media checklist_media,
      public.service_order_checklist_items checklist_item,
      public.service_order_checklist_stages checklist_stage,
      public.service_order_checklists checklist
where checklist_media.item_id = checklist_item.id
  and checklist_item.stage_id = checklist_stage.id
  and checklist_stage.checklist_id = checklist.id
  and order_link.media_id = checklist_media.media_id
  and order_link.service_order_id = checklist.service_order_id;

revoke execute on function public.attach_service_order_checklist_media(uuid, uuid) from public;
revoke execute on function public.attach_service_order_checklist_media(uuid, uuid) from anon;
grant execute on function public.attach_service_order_checklist_media(uuid, uuid) to authenticated;

commit;
