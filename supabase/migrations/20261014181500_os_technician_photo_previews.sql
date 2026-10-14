-- Fotos privadas da execução ficam visíveis aos gestores autorizados da OS.
-- Não libera o bucket publicamente nem concede SELECT direto aos registros de evidência.
begin;

drop policy if exists technician_task_photo_order_select on storage.objects;
create policy technician_task_photo_order_select
on storage.objects for select to authenticated
using (
  bucket_id='technician-task-photos'
  and exists (
    select 1
    from public.service_order_item_tasks task
    where task.organization_id::text=(storage.foldername(name))[1]
      and task.item_id::text=(storage.foldername(name))[2]
      and private.can_view_service_order(task.service_order_id)
      and private.has_effective_organization_permission(task.organization_id,'orders.section.images')
  )
);

create or replace function public.list_order_service_task_photos_v1(p_service_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_organization_id uuid;
begin
  if (select auth.uid()) is null or not private.can_view_service_order(p_service_order_id) then
    raise exception 'Sem acesso à OS.' using errcode='42501';
  end if;
  select organization_id into v_organization_id
    from public.service_orders where id=p_service_order_id;
  if not private.has_effective_organization_permission(v_organization_id,'orders.section.images') then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',photo.id,'item_id',photo.item_id,
    'path',photo.storage_path,'created_at',photo.created_at
  ) order by photo.created_at,photo.id),'[]'::jsonb)
  into v_result
  from public.service_order_item_task_photos photo
  join public.service_order_items item
    on item.id=photo.item_id and item.service_order_id=photo.service_order_id
     and item.organization_id=photo.organization_id
  where photo.service_order_id=p_service_order_id and photo.organization_id=v_organization_id;
  return v_result;
end;
$$;

revoke all on function public.list_order_service_task_photos_v1(uuid) from public,anon,authenticated;
grant execute on function public.list_order_service_task_photos_v1(uuid) to authenticated;

create or replace function public.register_my_technician_task_photo_v1(
  p_item_id uuid,p_storage_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_task public.service_order_item_tasks%rowtype;
  v_id uuid;
begin
  if not private.is_my_technician_task(p_item_id,'technician_panel.actions.photo') then
    raise exception 'Sem permissão para anexar fotos a este serviço.' using errcode='42501';
  end if;
  select * into v_task from public.service_order_item_tasks where item_id=p_item_id for update;
  if v_task.status <> 'in_progress' then
    raise exception 'Fotos só podem ser anexadas durante a execução do serviço.' using errcode='22023';
  end if;
  if p_storage_path not like v_task.organization_id::text || '/' || p_item_id::text || '/' || (select auth.uid())::text || '/%' then
    raise exception 'Caminho de arquivo inválido.' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects
    where bucket_id='technician-task-photos' and name=p_storage_path) then
    raise exception 'O arquivo informado não existe.' using errcode='P0002';
  end if;
  insert into public.service_order_item_task_photos (
    item_id,service_order_id,organization_id,storage_path,uploaded_by
  ) values(
    p_item_id,v_task.service_order_id,v_task.organization_id,p_storage_path,(select auth.uid())
  ) on conflict(storage_path) do update set storage_path=excluded.storage_path
  returning id into v_id;
  -- Notifica quem está acompanhando a OS sobre a nova evidência.
  update public.service_order_item_tasks
     set updated_at=now()
   where item_id=p_item_id;
  return v_id;
end;
$$;

commit;
