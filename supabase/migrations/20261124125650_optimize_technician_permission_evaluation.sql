-- Preserve production response shape and access rules; fail safely on concurrent drift.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_my_technician_order_details_v1(uuid)'::regprocedure))
      <> 'b95c2771c078b6c2088a8ed29430d949'
    OR md5(pg_get_functiondef('public.list_my_technician_tasks_v1(uuid)'::regprocedure))
      <> 'c3ade7f387ad80c99ca3b1190a00ceb9' THEN
    RAISE EXCEPTION 'Technician read definitions changed; review before applying performance migration';
  END IF;
END;
$guard$;

-- Performance-only replacements based on live definitions read 2026-11-24.
-- Keep authorization guards and field redaction; evaluate each distinct permission once per invocation.
-- Intentional: do not silently import repository/live response drift in this timeout fix.
CREATE OR REPLACE FUNCTION public.get_my_technician_order_details_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_permission_actions_change_situation boolean;
  v_permission_actions_edit_diagnosis boolean;
  v_permission_data_diagnosis boolean;
  v_permission_data_situation boolean;
  v_permission_data_equipment boolean;
  v_permission_data_customer boolean;
  v_permission_data_customer_document boolean;
  v_permission_data_address boolean;
  v_permission_data_internal_notes boolean;
  v_permission_data_order_items boolean;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.view') then
    raise exception 'Esta OS não está atribuída a você ou o acesso foi revogado.' using errcode='42501';
  end if;

  v_permission_actions_change_situation := private.can_access_technician_order_v1(p_order_id,'technician_panel.actions.change_situation');
  v_permission_actions_edit_diagnosis := private.can_access_technician_order_v1(p_order_id,'technician_panel.actions.edit_diagnosis');
  v_permission_data_diagnosis := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.diagnosis');
  v_permission_data_situation := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.situation');
  v_permission_data_equipment := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.equipment');
  v_permission_data_customer := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.customer');
  v_permission_data_customer_document := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.customer_document');
  v_permission_data_address := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.address');
  v_permission_data_internal_notes := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.internal_notes');
  v_permission_data_order_items := private.can_access_technician_order_v1(p_order_id,'technician_panel.data.order_items');
  select jsonb_build_object(
    'id',ord.id,
    'os_number',ord.os_number,
    'can_change_situation',v_permission_actions_change_situation,
    'can_edit_diagnosis',(
      v_permission_actions_edit_diagnosis
      and v_permission_data_diagnosis
    ),
    'closed',ord.completed_at is not null or ord.cancelled_at is not null,
    'solved',coalesce(ord.is_solved,false),
    'situation_id',case
      when v_permission_data_situation
      then ord.situation_id else null end,
    'situation_name',case
      when v_permission_data_situation
      then situation.name else null end,
    'available_situations',case
      when v_permission_actions_change_situation
        and v_permission_data_situation
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
      when v_permission_data_diagnosis
      then ord.diagnosis else null end,
    'equipment_accessories',case when v_permission_data_equipment
      then ord.accessories else null end,
    'equipment_condition',case when v_permission_data_equipment
      then ord.equipment_condition else null end,
    'equipment_brand',case when v_permission_data_equipment
      then equipment_brand.name else null end,
    'equipment_model',case when v_permission_data_equipment
      then coalesce(equipment_model.name,nullif(ord.model,'')) else null end,
    'technical_values',case when v_permission_data_equipment
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',val.technical_field_id,
          'label',val.label_snapshot,'type',val.field_type_snapshot,
          'value',case when val.field_type_snapshot='number'
            then val.value_number::text else val.value_text end)
          order by val.label_snapshot,val.technical_field_id)
        from public.service_order_technical_values val
        where val.service_order_id=ord.id and val.organization_id=ord.organization_id
          and (
            (val.field_type_snapshot='number' and val.value_number is not null)
            or nullif(btrim(coalesce(val.value_text,'')),'') is not null
          )
      ),'[]'::jsonb) else '[]'::jsonb end,
    'customer_document',case
      when v_permission_data_customer
        and v_permission_data_customer_document
      then coalesce(nullif(customer.document,''),nullif(customer.cnpj,'')) else null end,
    'customer_type',case
      when v_permission_data_customer
      then customer.customer_type else null end,
    'customer_address',case
      when v_permission_data_address
      then jsonb_build_object(
        'street',customer_address.street,
        'number',customer_address.number,
        'complement',customer_address.complement,
        'neighborhood',customer_address.neighborhood,
        'city',customer_address.city,
        'state',customer_address.state,
        'zip_code',customer_address.zip_code
      ) else null end,
    'equipment_photos',case
      when v_permission_data_equipment
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',link.id,'name',media.file_name,'path',media.storage_path,
          'kind',case when link.sort_order >= 500 then 'label' else 'equipment' end
        ) order by link.sort_order,link.id)
        from public.service_order_media link
        join public.media media on media.id=link.media_id and media.bucket_id='service-images'
        where link.service_order_id=ord.id
          and (media.organization_id=ord.organization_id or media.organization_id is null)
          and link.sort_order < 1000
      ),'[]'::jsonb) else '[]'::jsonb end,
    'internal_notes',case
      when v_permission_data_internal_notes
      then ord.internal_notes else null end,
    'items',case
      when v_permission_data_order_items
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
  left join public.customers customer
    on customer.id=ord.customer_id and customer.organization_id=ord.organization_id
  left join lateral (
    select ca.street,ca.number,ca.complement,ca.neighborhood,ca.city,ca.state,ca.zip_code
    from public.customer_addresses ca
    where ca.customer_id=ord.customer_id and ca.organization_id=ord.organization_id
    order by (ca.id=ord.service_customer_address_id) desc,ca.is_default desc,ca.created_at desc
    limit 1
  ) customer_address on true
  where ord.id=p_order_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_technician_tasks_v1(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
  v_permission_data_customer boolean;
  v_permission_data_contact boolean;
  v_permission_data_equipment boolean;
  v_permission_data_diagnosis boolean;
  v_permission_data_problem boolean;
  v_permission_data_address boolean;
  v_permission_data_schedule boolean;
  v_permission_data_location boolean;
begin
  if v_user is null or not private.has_effective_organization_permission(p_organization_id,'technician_panel.view')
    or not exists(select 1 from public.organization_modules module
      where module.organization_id=p_organization_id and module.module_key='orders' and module.is_enabled)
    then raise exception 'Acesso negado ao Painel do Técnico.' using errcode='42501';
  end if;
  v_permission_data_customer := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.customer');
  v_permission_data_contact := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.contact');
  v_permission_data_equipment := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.equipment');
  v_permission_data_diagnosis := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.diagnosis');
  v_permission_data_problem := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.problem');
  v_permission_data_address := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.address');
  v_permission_data_schedule := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.schedule');
  v_permission_data_location := private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location');
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', task.item_id,
      'service_order_id', task.service_order_id,
      'os_number', ord.os_number,
      'title', item.title_snapshot,
      'description', item.description_snapshot,
      'status', task.status,
      'started_at', task.started_at,
      'completed_at', task.completed_at,
      'execution_report', task.execution_report,
      'customer_name',case when v_permission_data_customer
         then customer.full_name else null end,
      'customer_contact',case when v_permission_data_contact
         then coalesce(nullif(customer.whatsapp,''),customer.phone) else null end,
      'equipment',case when v_permission_data_equipment
         then equipment.name else null end,
      'diagnosis',case when v_permission_data_diagnosis
         then ord.diagnosis else null end,
      'problem',case when v_permission_data_problem
         then ord.customer_notes else null end,
      'service_address',case when v_permission_data_address
        then jsonb_build_object(
          'street',coalesce(nullif(ord.service_street,''),customer_address.street),
          'number',coalesce(nullif(ord.service_number,''),customer_address.number),
          'complement',coalesce(nullif(ord.service_complement,''),customer_address.complement),
          'neighborhood',coalesce(nullif(ord.service_neighborhood,''),customer_address.neighborhood),
          'city',coalesce(nullif(ord.service_city,''),customer_address.city),
          'state',coalesce(nullif(ord.service_state,''),customer_address.state),
          'zip_code',coalesce(nullif(ord.service_zip_code,''),customer_address.zip_code)
        ) else null end,
      'equipment_model',case when v_permission_data_equipment
        then ord.model else null end,
      'serial_number',case when v_permission_data_equipment
        then ord.serial_number else null end,
      'scheduled_at',case when v_permission_data_schedule
         then ord.scheduled_at else null end,
      'order_completed_at',ord.completed_at,
      'order_cancelled_at',ord.cancelled_at,
      'start_location',case when v_permission_data_location
         then jsonb_build_object('lat',task.started_lat,'lng',task.started_lng,'accuracy_m',task.started_accuracy_m,'captured_at',task.started_location_at) else null end,
      'finish_location',case when v_permission_data_location
         then jsonb_build_object('lat',task.completed_lat,'lng',task.completed_lng,'accuracy_m',task.completed_accuracy_m,'captured_at',task.completed_location_at) else null end
    ) order by case task.status when 'in_progress' then 0 when 'pending' then 1 when 'completed' then 2 else 3 end,
       ord.os_number desc, task.updated_at desc
  ),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task

  join public.service_order_items item
    on item.id=task.item_id and item.service_order_id=task.service_order_id
       and item.organization_id=task.organization_id and item.item_type in ('service','custom_service')
  join public.service_orders ord
    on ord.id=task.service_order_id and ord.organization_id=task.organization_id
  left join public.customers customer
    on customer.id=ord.customer_id and customer.organization_id=p_organization_id
  left join public.equipment_types equipment
    on equipment.id=ord.equipment_type_id and equipment.organization_id=p_organization_id
  left join lateral (
    select ca.street,ca.number,ca.complement,ca.neighborhood,ca.city,ca.state,ca.zip_code
    from public.customer_addresses ca
    where ca.customer_id=ord.customer_id and ca.organization_id=p_organization_id
    order by (ca.id=ord.service_customer_address_id) desc,ca.is_default desc,ca.created_at desc
    limit 1
  ) customer_address on true
  where task.organization_id=p_organization_id
    and exists (
      select 1
      from public.service_order_item_task_assignees link
      join public.employees employee
        on employee.id=link.employee_id and employee.organization_id=task.organization_id
      where link.item_id=task.item_id and link.organization_id=task.organization_id
        and employee.profile_id=v_user and employee.is_active
    );
  return v_result;
end;
$function$;
