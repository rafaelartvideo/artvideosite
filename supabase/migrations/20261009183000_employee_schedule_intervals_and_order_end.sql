-- Intervalos distintos por dia de expediente e término real das OS agendadas.
BEGIN;
ALTER TABLE public.employee_work_schedules
  ADD COLUMN IF NOT EXISTS work_intervals jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.employee_work_schedules
SET work_intervals = jsonb_build_array(
  jsonb_build_object(
    'start_time', to_char(start_time, 'HH24:MI'),
    'end_time', to_char(end_time, 'HH24:MI')
  )
)
WHERE is_available AND work_intervals = '[]'::jsonb;

CREATE OR REPLACE FUNCTION private.valid_employee_work_intervals(p_intervals jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $validator$
DECLARE
  item jsonb;
  start_val text;
  end_val text;
  last_end text := '';
BEGIN
  IF jsonb_typeof(p_intervals) <> 'array' OR jsonb_array_length(p_intervals) > 12 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_intervals) LOOP
    start_val := item->>'start_time';
    end_val := item->>'end_time';
    IF start_val IS NULL OR end_val IS NULL
       OR start_val !~ '^[0-2][0-9]:[0-5][0-9]$'
       OR end_val !~ '^[0-2][0-9]:[0-5][0-9]$'
       OR start_val > '23:59' OR end_val > '23:59'
       OR end_val <= start_val OR start_val < last_end THEN
      RETURN false;
    END IF;
    last_end := end_val;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$validator$;
ALTER TABLE public.employee_work_schedules
  ADD CONSTRAINT employee_work_intervals_valid CHECK (
    private.valid_employee_work_intervals(work_intervals)
    AND (NOT is_available OR jsonb_array_length(work_intervals) > 0)
  );
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz;
ALTER TABLE public.service_orders
  ADD CONSTRAINT service_order_scheduled_end_after_start CHECK (
    scheduled_end_at IS NULL OR (scheduled_at IS NOT NULL AND scheduled_end_at > scheduled_at)
  );

-- Manter todo o fluxo transacional existente de criação de OS; incluir o término na operação atômica.
CREATE OR REPLACE FUNCTION public.create_service_order_atomic(p_order_id uuid, p_organization_id uuid, p_payload jsonb, p_technician_ids uuid[] DEFAULT '{}'::uuid[], p_seller_ids uuid[] DEFAULT '{}'::uuid[], p_technical_values jsonb DEFAULT '[]'::jsonb, p_media_links jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_source public.service_orders%rowtype;
  v_order public.service_orders%rowtype;
  v_value jsonb;
  v_employee_id uuid;
  v_media_id uuid;
  v_sort_order integer;
  v_queue record;
  v_override_reason text := nullif(pg_catalog.btrim(p_payload->>'queue_override_reason'), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_order_id is null or p_organization_id is null then
    raise exception 'Identificador da OS e empresa são obrigatórios.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload da OS inválido.' using errcode = '22023';
  end if;

  select service_order.*
    into v_order
  from public.service_orders service_order
  where service_order.id = p_order_id
    and service_order.organization_id = p_organization_id;

  if found then
    return jsonb_build_object(
      'id', v_order.id,
      'os_number', v_order.os_number,
      'external_os_number', v_order.external_os_number,
      'queue_ticket_number', v_order.queue_ticket_number,
      'idempotent_replay', true
    );
  end if;

  select *
    into v_source
  from jsonb_populate_record(null::public.service_orders, p_payload);

  select *
    into v_queue
  from internal_api.claim_queue_os_reservation(
    p_organization_id,
    v_source.queue_reservation_id,
    v_override_reason
  );

  insert into public.service_orders (
    id,
    organization_id,
    service_id,
    general_service_id,
    service_type_id,
    seller_id,
    estimated_price,
    status_id,
    situation_id,
    customer_id,
    assigned_to,
    technician_id,
    equipment_type_id,
    equipment_brand_id,
    equipment_model_id,
    brand_id,
    product_id,
    model,
    serial_number,
    external_os_number,
    accessories,
    equipment_condition,
    priority,
    scheduled_at,
    scheduled_end_at,
    started_at,
    completed_at,
    internal_notes,
    customer_notes,
    order_type,
    service_zip_code,
    service_state,
    service_city,
    service_neighborhood,
    service_street,
    service_number,
    service_complement,
    service_address_source,
    service_customer_address_id,
    queue_reservation_id,
    queue_ticket_id,
    queue_ticket_number,
    queue_override_reason,
    queue_override_by
  ) values (
    p_order_id,
    p_organization_id,
    v_source.service_id,
    v_source.general_service_id,
    v_source.service_type_id,
    v_source.seller_id,
    v_source.estimated_price,
    v_source.status_id,
    v_source.situation_id,
    v_source.customer_id,
    (select auth.uid()),
    v_source.technician_id,
    v_source.equipment_type_id,
    v_source.equipment_brand_id,
    v_source.equipment_model_id,
    v_source.brand_id,
    v_source.product_id,
    v_source.model,
    v_source.serial_number,
    v_source.external_os_number,
    v_source.accessories,
    v_source.equipment_condition,
    coalesce(v_source.priority, 'normal'),
    v_source.scheduled_at,
    v_source.scheduled_end_at,
    v_source.started_at,
    v_source.completed_at,
    v_source.internal_notes,
    v_source.customer_notes,
    v_source.order_type,
    v_source.service_zip_code,
    v_source.service_state,
    v_source.service_city,
    v_source.service_neighborhood,
    v_source.service_street,
    v_source.service_number,
    v_source.service_complement,
    v_source.service_address_source,
    v_source.service_customer_address_id,
    v_queue.reservation_id,
    v_queue.external_ticket_id,
    v_queue.ticket_number,
    case when coalesce(v_queue.was_override, false) then v_override_reason else null end,
    case when coalesce(v_queue.was_override, false) then (select auth.uid()) else null end
  )
  returning * into v_order;

  if jsonb_typeof(coalesce(p_technical_values, '[]'::jsonb)) <> 'array' then
    raise exception 'Campos técnicos inválidos.' using errcode = '22023';
  end if;

  for v_value in
    select value from jsonb_array_elements(coalesce(p_technical_values, '[]'::jsonb))
  loop
    if nullif(v_value->>'technical_field_id', '') is null then
      raise exception 'Campo técnico sem identificador.' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.technical_fields technical_field
      where technical_field.id = (v_value->>'technical_field_id')::uuid
        and technical_field.organization_id = p_organization_id
    ) then
      raise exception 'Campo técnico não pertence à empresa da OS.' using errcode = '42501';
    end if;

    insert into public.service_order_technical_values (
      organization_id,
      service_order_id,
      technical_field_id,
      field_key_snapshot,
      label_snapshot,
      field_type_snapshot,
      value_text,
      value_number
    ) values (
      p_organization_id,
      p_order_id,
      (v_value->>'technical_field_id')::uuid,
      v_value->>'field_key_snapshot',
      v_value->>'label_snapshot',
      v_value->>'field_type_snapshot',
      nullif(v_value->>'value_text', ''),
      case
        when v_value->>'value_number' is null or v_value->>'value_number' = '' then null
        else (v_value->>'value_number')::numeric
      end
    );
  end loop;

  foreach v_employee_id in array coalesce(p_technician_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id
        and employee.organization_id = p_organization_id
        and coalesce(employee.is_active, true)
    ) then
      raise exception 'Técnico selecionado não pertence à empresa ou está inativo.' using errcode = '42501';
    end if;

    insert into public.service_order_technicians (
      organization_id,
      service_order_id,
      employee_id
    ) values (
      p_organization_id,
      p_order_id,
      v_employee_id
    );
  end loop;

  foreach v_employee_id in array coalesce(p_seller_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id
        and employee.organization_id = p_organization_id
        and coalesce(employee.is_active, true)
    ) then
      raise exception 'Vendedor selecionado não pertence à empresa ou está inativo.' using errcode = '42501';
    end if;

    insert into public.service_order_sellers (
      organization_id,
      service_order_id,
      employee_id
    ) values (
      p_organization_id,
      p_order_id,
      v_employee_id
    );
  end loop;

  if jsonb_typeof(coalesce(p_media_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de imagens inválida.' using errcode = '22023';
  end if;

  for v_value in
    select value from jsonb_array_elements(coalesce(p_media_links, '[]'::jsonb))
  loop
    if nullif(v_value->>'media_id', '') is null then
      raise exception 'Imagem sem identificador.' using errcode = '22023';
    end if;

    v_media_id := (v_value->>'media_id')::uuid;
    v_sort_order := coalesce((v_value->>'sort_order')::integer, 0);

    if not exists (
      select 1 from public.media media
      where media.id = v_media_id
        and media.organization_id = p_organization_id
    ) then
      raise exception 'Imagem não pertence à empresa da OS.' using errcode = '42501';
    end if;

    insert into public.service_order_media (
      organization_id,
      service_order_id,
      media_id,
      sort_order
    ) values (
      p_organization_id,
      p_order_id,
      v_media_id,
      v_sort_order
    );
  end loop;

  return jsonb_build_object(
    'id', v_order.id,
    'os_number', v_order.os_number,
    'external_os_number', v_order.external_os_number,
    'queue_ticket_number', v_order.queue_ticket_number,
    'idempotent_replay', false
  );
end;
$function$;

COMMIT;
