-- Painel Técnico: todos os campos técnicos preenchidos, até 3 imagens por serviço.
-- Sem ampliar acesso a preços, outros clientes ou registros de outra empresa.
begin;

create or replace function public.get_my_technician_order_details_v1(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.view') then
    raise exception 'Esta OS não está atribuída a você ou o acesso foi revogado.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id',ord.id,
    'os_number',ord.os_number,
    'can_change_situation',private.can_access_technician_order_v1(ord.id,'technician_panel.actions.change_situation'),
    'can_edit_diagnosis',(
      private.can_access_technician_order_v1(ord.id,'technician_panel.actions.edit_diagnosis')
      and private.can_access_technician_order_v1(ord.id,'technician_panel.data.diagnosis')
    ),
    'closed',ord.completed_at is not null or ord.cancelled_at is not null,
    'solved',coalesce(ord.is_solved,false),
    'situation_id',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then ord.situation_id else null end,
    'situation_name',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then situation.name else null end,
    'available_situations',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.actions.change_situation')
        and private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.sort_order,s.name)
        from public.os_situations s
        where s.organization_id=ord.organization_id and s.is_active
          and (ord.service_type_id is null or exists(
            select 1 from public.service_type_situations sts
            where sts.organization_id=ord.organization_id
              and sts.service_type_id=ord.service_type_id and sts.situation_id=s.id
          ))
      ),'[]'::jsonb) else '[]'::jsonb end,
    'diagnosis',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.diagnosis')
      then ord.diagnosis else null end,
    'equipment_accessories',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then ord.accessories else null end,
    'equipment_condition',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then ord.equipment_condition else null end,
    'equipment_brand',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then equipment_brand.name else null end,
    'equipment_model',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then coalesce(equipment_model.name,nullif(ord.model,'')) else null end,
    'technical_values',case when private.can_access_technician_order_v1(ord.id,'technician_panel.data.equipment')
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',val.id,
          'label',val.label_snapshot,'type',val.field_type_snapshot,
          'value',case when val.field_type_snapshot='number'
            then val.value_number::text else val.value_text end)
          order by val.label_snapshot,val.id)
        from public.service_order_technical_values val
        where val.service_order_id=ord.id and val.organization_id=ord.organization_id
          and (
            (val.field_type_snapshot='number' and val.value_number is not null)
            or nullif(btrim(coalesce(val.value_text,'')),'') is not null
          )
      ),'[]'::jsonb) else '[]'::jsonb end,
    'internal_notes',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.internal_notes')
      then ord.internal_notes else null end,
    'items',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.order_items')
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',item.id,'type',item.item_type,'title',item.title_snapshot,
          'description',item.description_snapshot,'quantity',item.quantity
        ) order by item.created_at,item.id)
        from public.service_order_items item
        where item.service_order_id=ord.id and item.organization_id=ord.organization_id
      ),'[]'::jsonb) else '[]'::jsonb end
  ) into v_result
  from public.service_orders ord
  left join public.os_situations situation
    on situation.id=ord.situation_id and situation.organization_id=ord.organization_id
  left join public.equipment_brands equipment_brand
    on equipment_brand.id=ord.equipment_brand_id and equipment_brand.organization_id=ord.organization_id
  left join public.equipment_models equipment_model
    on equipment_model.id=ord.equipment_model_id and equipment_model.organization_id=ord.organization_id
  where ord.id=p_order_id;

  return v_result;
end;
$$;

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
  if (select count(*) from public.service_order_item_task_photos
      where item_id=p_item_id) >= 3 then
    raise exception 'Limite de 3 imagens por serviço atingido.' using errcode='22023';
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

create or replace function public.count_my_technician_task_photos_v1(p_item_id uuid)
returns integer language plpgsql stable security definer set search_path=''
as $$
begin
  if not (
    private.is_my_technician_task(p_item_id,'technician_panel.actions.photo')
    or private.is_my_technician_task(p_item_id,'technician_panel.data.photos')
  ) then
    raise exception 'Sem acesso às fotos deste serviço.' using errcode='42501';
  end if;
  return (select count(*)::integer from public.service_order_item_task_photos
          where item_id=p_item_id);
end;
$$;

revoke all on function public.count_my_technician_task_photos_v1(uuid) from public,anon,authenticated;
grant execute on function public.count_my_technician_task_photos_v1(uuid) to authenticated;

commit;
