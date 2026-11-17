-- Descarte como configuração do tipo de atendimento e Parceiro como vínculo multiempresa.
-- Versão aplicada no CRM; mantida no repositório para reprodução em novos ambientes.
begin;
alter table public.service_types add column if not exists is_disposal boolean not null default false;
alter table public.service_orders add column if not exists disposal_partner_id uuid references public.entities(id);
alter table public.entity_roles drop constraint if exists entity_roles_role_check;
alter table public.entity_roles add constraint entity_roles_role_check check (role in ('customer','employee','supplier','partner'));
alter table public.service_types drop constraint if exists service_types_disposal_no_quote;
alter table public.service_types add constraint service_types_disposal_no_quote
  check (not is_disposal or (not quote_workflow_enabled and not generates_warranty));
create index if not exists service_orders_disposal_partner_idx
  on public.service_orders(disposal_partner_id) where disposal_partner_id is not null;
create or replace function private.validate_service_order_disposal_partner()
returns trigger language plpgsql security invoker set search_path=public
as $guard$
begin
  if new.disposal_partner_id is not null then
    if not exists (
      select 1 from public.entities e join public.entity_roles er on er.entity_id=e.id
      where e.id=new.disposal_partner_id and e.organization_id=new.organization_id
        and e.is_active and er.role='partner' and er.is_active
    ) then
      raise exception 'Instituição de descarte inválida, inativa ou de outra empresa.' using errcode='23514';
    end if;
    if not exists (
      select 1 from public.service_types st
      where st.id=new.service_type_id and st.organization_id=new.organization_id and st.is_disposal
    ) then
      raise exception 'A instituição de descarte só pode ser vinculada a uma OS de descarte.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$guard$;
drop trigger if exists trg_validate_service_order_disposal_partner on public.service_orders;
create trigger trg_validate_service_order_disposal_partner before insert or update of
  disposal_partner_id,service_type_id,organization_id on public.service_orders
  for each row execute function private.validate_service_order_disposal_partner();

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
    disposal_partner_id,
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
    v_source.disposal_partner_id,
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

  update public.service_orders set order_rules_snapshot=internal_api.effective_order_rules_for_order_creation(p_organization_id,v_source.service_type_id,v_source.equipment_type_id),custom_field_values=case when jsonb_typeof(p_payload->'custom_field_values')='object' then p_payload->'custom_field_values' else '{}'::jsonb end where id=p_order_id and organization_id=p_organization_id;
  perform internal_api.validate_order_rules_for_order_creation(p_organization_id,p_order_id,'create');
  return jsonb_build_object(
    'id', v_order.id,
    'os_number', v_order.os_number,
    'external_os_number', v_order.external_os_number,
    'queue_ticket_number', v_order.queue_ticket_number,
    'idempotent_replay', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.load_orders_reference_data_v1(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_can_order_config boolean;
  v_is_artvideo boolean;
  v_is_member boolean;
  v_employees_module boolean;
  v_can_view_employees boolean;
  v_can_manage_members boolean;
  v_customer_employee_access boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  v_can_order_config := private.can_read_order_operational_config(
    p_organization_id
  );

  if not v_can_order_config then
    raise exception 'Sem acesso aos dados operacionais desta empresa.' using errcode = '42501';
  end if;

  v_is_artvideo := private.is_artvideo_site_organization(p_organization_id);
  v_is_member := private.is_organization_member(p_organization_id);

  v_employees_module := private.is_organization_module_enabled(
    p_organization_id,
    'employees'
  );
  v_can_view_employees := private.has_organization_permission(
    p_organization_id,
    'employees.view'
  );
  v_can_manage_members := private.can_manage_organization(
    p_organization_id,
    'organizations.members.manage'
  );

  v_customer_employee_access :=
    private.is_organization_module_enabled(p_organization_id, 'customers')
    and private.can_access_shared_organization_resource(
      p_organization_id,
      'customers',
      'read'
    )
    and private.has_effective_organization_permission(
      p_organization_id,
      'customers.view'
    );

  return jsonb_build_object(
    'statuses',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'color', item.color,
          'sort_order', item.sort_order
        )
        order by item.sort_order
      )
      from public.order_statuses item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),

    'situations',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'color', item.color,
          'hours', item.hours,
          'sort_order', item.sort_order
        )
        order by item.sort_order
      )
      from public.os_situations item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),

    'services',
    case when v_is_artvideo then coalesce((
      select jsonb_agg(
        jsonb_build_object('id', item.id, 'title', item.title)
        order by item.title
      )
      from public.services item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb) else '[]'::jsonb end,

    'brands',
    case when v_is_artvideo then coalesce((
      select jsonb_agg(
        jsonb_build_object('id', item.id, 'name', item.name)
        order by item.name
      )
      from public.brands item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb) else '[]'::jsonb end,

    'products',
    case when v_is_artvideo then coalesce((
      select jsonb_agg(
        jsonb_build_object('id', item.id, 'name', item.name)
        order by item.name
      )
      from public.products item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb) else '[]'::jsonb end,

    'equipmentTypes',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', item.id, 'name', item.name)
        order by item.sort_order, item.name
      )
      from public.equipment_types item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),

    'equipmentBrands',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'equipment_type_id', item.equipment_type_id
        )
        order by item.sort_order, item.name
      )
      from public.equipment_brands item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),

    'equipmentModels',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'equipment_brand_id', item.equipment_brand_id
        )
        order by item.sort_order, item.name
      )
      from public.equipment_models item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),

    'technicalFields',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'field_key', item.field_key,
          'label', item.label,
          'field_type', item.field_type,
          'is_active', item.is_active,
          'sort_order', item.sort_order
        )
        order by item.sort_order, item.label
      )
      from public.technical_fields item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),

    'technicalFieldLinks',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'equipment_type_id', link.equipment_type_id,
          'technical_field_id', link.technical_field_id,
          'required', link.required,
          'sort_order', link.sort_order,
          'technical_field', jsonb_build_object(
            'id', field.id,
            'field_key', field.field_key,
            'label', field.label,
            'field_type', field.field_type,
            'is_active', field.is_active,
            'sort_order', field.sort_order
          )
        )
        order by link.sort_order, link.equipment_type_id, link.technical_field_id
      )
      from public.equipment_type_technical_fields link
      join public.technical_fields field
        on field.id = link.technical_field_id
      where link.organization_id = p_organization_id
    ), '[]'::jsonb),

    'employees',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'profile_id', item.profile_id,
          'full_name', item.full_name,
          'is_active', item.is_active
        )
        order by item.full_name
      )
      from public.employees item
      where item.organization_id = p_organization_id
        and (
          (
            v_employees_module
            and (
              (item.profile_id = v_user_id and v_is_member)
              or v_can_view_employees
              or v_can_manage_members
            )
          )
          or v_customer_employee_access
        )
    ), '[]'::jsonb),

    'generalServices',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'price', item.price,
          'price_at_completion', item.price_at_completion,
          'max_discount_percentage', item.max_discount_percentage,
          'max_discount_amount', item.max_discount_amount,
          'is_active', item.is_active,
          'sort_order', item.sort_order
        )
        order by item.sort_order, item.name
      )
      from public.general_services item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),

    'serviceTypes',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'title', item.title,
          'description', item.description,
          'forecast_days', item.forecast_days,
          'quote_workflow_enabled', item.quote_workflow_enabled,
          'is_disposal', item.is_disposal,
          'generates_warranty', item.generates_warranty,
          'is_active', item.is_active,
          'sort_order', item.sort_order
        )
        order by item.sort_order, item.title
      )
      from public.service_types item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),

    'serviceTypeSituations',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'service_type_id', link.service_type_id,
          'situation_id', link.situation_id,
          'use_default_hours', link.use_default_hours,
          'sla_hours', link.sla_hours,
          'sort_order', link.sort_order,
          'situation', jsonb_build_object(
            'id', situation.id,
            'name', situation.name,
            'color', situation.color,
            'hours', situation.hours,
            'is_active', situation.is_active
          )
        )
        order by link.sort_order, link.service_type_id, link.situation_id
      )
      from public.service_type_situations link
      left join public.os_situations situation
        on situation.id = link.situation_id
      where link.organization_id = p_organization_id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.load_service_types_configuration_v1(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_can_operational_read boolean;
  v_can_types boolean;
  v_can_situations boolean;
  v_can_monitoring boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  v_can_operational_read := private.can_read_order_operational_config(
    p_organization_id
  );

  v_can_types := v_can_operational_read
    or private.can_manage_own_operation_config(
      p_organization_id,
      'service_types',
      'service_types.view'
    );

  if not v_can_types then
    raise exception 'Sem permissão para consultar tipos de atendimento.' using errcode = '42501';
  end if;

  v_can_situations := v_can_operational_read
    or private.can_manage_own_operation_config(
      p_organization_id,
      'order_situations',
      'situations.view'
    );

  v_can_monitoring := private.is_organization_member(p_organization_id)
    or private.has_platform_permission('orders.monitor.view')
    or private.has_platform_permission('orders.monitor.manage');

  return jsonb_build_object(
    'serviceTypes',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'title', item.title,
          'description', item.description,
          'forecast_days', item.forecast_days,
          'quote_workflow_enabled', item.quote_workflow_enabled,
          'is_disposal', item.is_disposal,
          'generates_warranty', item.generates_warranty,
          'enable_payment_proof_on_completion', item.enable_payment_proof_on_completion,
          'enable_delivery_evidence_on_completion', item.enable_delivery_evidence_on_completion,
          'is_active', item.is_active,
          'sort_order', item.sort_order,
          'created_at', item.created_at,
          'updated_at', item.updated_at,
          'organization_id', item.organization_id
        )
        order by item.sort_order, item.title
      )
      from public.service_types item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'situations',
    case when v_can_situations then
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'name', item.name,
            'color', item.color,
            'hours', item.hours,
            'sort_order', item.sort_order,
            'is_active', item.is_active,
            'organization_id', item.organization_id
          )
          order by item.sort_order, item.name
        )
        from public.os_situations item
        where item.organization_id = p_organization_id
          and item.is_active
      ), '[]'::jsonb)
    else '[]'::jsonb end,
    'links',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'service_type_id', item.service_type_id,
          'situation_id', item.situation_id,
          'use_default_hours', item.use_default_hours,
          'sla_hours', item.sla_hours,
          'sort_order', item.sort_order,
          'organization_id', item.organization_id
        )
        order by item.service_type_id, item.sort_order, item.situation_id
      )
      from public.service_type_situations item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'monitoredServiceTypeIds',
    case when v_can_monitoring then
      coalesce((
        select jsonb_agg(item.service_type_id order by item.service_type_id)
        from public.service_type_monitoring item
        where item.organization_id = p_organization_id
      ), '[]'::jsonb)
    else '[]'::jsonb end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_registration(p_registration_id uuid, p_organization_id uuid, p_entity jsonb, p_roles text[], p_employee jsonb, p_address jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := coalesce(p_registration_id, gen_random_uuid());
  v_customer_id uuid;
  v_employee_id uuid;
  v_address_id uuid;
  v_has_customer boolean := 'customer' = any(coalesce(p_roles, array[]::text[]));
  v_has_employee boolean := 'employee' = any(coalesce(p_roles, array[]::text[]));
  v_has_supplier boolean := 'supplier' = any(coalesce(p_roles, array[]::text[]));
  v_has_partner boolean := 'partner' = any(coalesce(p_roles, array[]::text[]));
  v_has_provider boolean := 'service_provider' = any(coalesce(p_roles, array[]::text[]));
  v_service jsonb;
  v_service_id uuid;
  v_service_name text;
  v_service_description text;
  v_service_price text;
  v_service_ids uuid[] := array[]::uuid[];
  v_modified integer;
  v_person_type text := coalesce(nullif(p_entity->>'person_type',''), 'PF');
  v_name text := trim(coalesce(p_entity->>'name',''));
  v_document text := nullif(regexp_replace(coalesce(p_entity->>'document',''), '[^0-9]', '', 'g'),'');
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_registration_id is null then
    if not exists (
      select 1
      from public.my_organization_permissions(p_organization_id) permission
      where permission.permission_key = 'customers.create'
    ) then
      raise exception 'Você não possui permissão para criar cadastros.' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1
      from public.my_organization_permissions(p_organization_id) permission
      where permission.permission_key in ('customers.edit', 'customers.update')
    ) then
      raise exception 'Você não possui permissão para editar cadastros.' using errcode = '42501';
    end if;
  end if;

  if v_name = '' then raise exception 'Informe o nome do cadastro.'; end if;
  if v_person_type not in ('PF','PJ') then raise exception 'Tipo de pessoa inválido.'; end if;
  if not (v_has_customer or v_has_employee or v_has_supplier or v_has_partner) then raise exception 'Selecione ao menos um vínculo.'; end if;
  if exists (select 1 from unnest(coalesce(p_roles, array[]::text[])) as role_input where role_input not in ('customer','employee','supplier','partner')) then
    raise exception 'Vínculo inválido.' using errcode = '22023';
  end if;
  if v_has_employee and (v_person_type <> 'PF' or v_document is null) then raise exception 'Funcionário deve ser Pessoa Física e possuir CPF.'; end if;

  if p_registration_id is null then
    insert into public.entities (
      id, organization_id, person_type, name, legal_name, trade_name, document,
      state_registration, municipal_registration, birth_date, foundation_date, phone, whatsapp, gender, email, is_active
    ) values (
      v_id, p_organization_id, v_person_type, v_name,
      nullif(trim(coalesce(p_entity->>'legal_name','')),''),
      nullif(trim(coalesce(p_entity->>'trade_name','')),''),
      v_document,
      nullif(trim(coalesce(p_entity->>'state_registration','')),''),
      nullif(trim(coalesce(p_entity->>'municipal_registration','')),''),
      nullif(p_entity->>'birth_date','')::date,
      nullif(p_entity->>'foundation_date','')::date,
      nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
      nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
      case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
      nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
      coalesce((p_entity->>'is_active')::boolean, true)
    );
  else
    update public.entities set
      person_type = v_person_type,
      name = v_name,
      legal_name = nullif(trim(coalesce(p_entity->>'legal_name','')),''),
      trade_name = nullif(trim(coalesce(p_entity->>'trade_name','')),''),
      document = v_document,
      state_registration = nullif(trim(coalesce(p_entity->>'state_registration','')),''),
      municipal_registration = nullif(trim(coalesce(p_entity->>'municipal_registration','')),''),
      birth_date = nullif(p_entity->>'birth_date','')::date,
      foundation_date = nullif(p_entity->>'foundation_date','')::date,
      phone = nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
      whatsapp = nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
      gender = case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
      email = nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
      is_active = coalesce((p_entity->>'is_active')::boolean, is_active),
      updated_at = timezone('utc', now())
    where id = v_id and organization_id = p_organization_id;
    if not found then raise exception 'Cadastro não encontrado.'; end if;
  end if;

  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'customer', v_has_customer)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'employee', v_has_employee)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'supplier', v_has_supplier)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'partner', v_has_partner)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());

  select legacy_customer_id, legacy_employee_id into v_customer_id, v_employee_id from public.entities where id = v_id;

  if v_has_customer then
    if v_customer_id is null then
      v_customer_id := v_id;
      insert into public.customers (
        id, organization_id, customer_type, full_name, email, phone, whatsapp, gender, document,
        trade_name, legal_name, cnpj, state_registration, municipal_registration, foundation_date, birth_date
      ) values (
        v_customer_id, p_organization_id, v_person_type, v_name,
        nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
        nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
        nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
        case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
        case when v_person_type = 'PF' then v_document else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'trade_name','')),'') else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'legal_name','')),'') else null end,
        case when v_person_type = 'PJ' then v_document else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'state_registration','')),'' ) else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'municipal_registration','')),'' ) else null end,
        case when v_person_type = 'PJ' then nullif(p_entity->>'foundation_date','')::date else null end,
        case when v_person_type = 'PF' then nullif(p_entity->>'birth_date','')::date else null end
      );
      update public.entities set legacy_customer_id = v_customer_id where id = v_id;
    else
      update public.customers set
        customer_type = v_person_type,
        full_name = v_name,
        email = nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
        phone = nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
        whatsapp = nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
        gender = case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
        document = case when v_person_type = 'PF' then v_document else null end,
        trade_name = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'trade_name','')),'') else null end,
        legal_name = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'legal_name','')),'') else null end,
        cnpj = case when v_person_type = 'PJ' then v_document else null end,
        state_registration = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'state_registration','')),'' ) else null end,
        municipal_registration = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'municipal_registration','')),'' ) else null end,
        foundation_date = case when v_person_type = 'PJ' then nullif(p_entity->>'foundation_date','')::date else null end,
        birth_date = case when v_person_type = 'PF' then nullif(p_entity->>'birth_date','')::date else null end,
        updated_at = timezone('utc', now())
      where id = v_customer_id;
    end if;
  end if;


  if v_has_employee then
    -- Serializa por empresa + CPF para evitar duas fichas tentando criar/vincular
    -- o mesmo funcionário ao mesmo tempo.
    perform pg_advisory_xact_lock(
      hashtextextended(p_organization_id::text || ':' || coalesce(v_document, ''), 0)
    );

    if v_employee_id is null then
      -- Um usuário/acesso da empresa pode já ter criado a linha legada em
      -- employees antes da ficha existir em Cadastros. Nesse caso, reutilize-a
      -- em vez de criar outro funcionário com o mesmo CPF.
      select employee.id
        into v_employee_id
      from public.employees employee
      where employee.organization_id = p_organization_id
        and v_document is not null
        and regexp_replace(coalesce(employee.cpf, ''), '[^0-9]', '', 'g') = v_document
      order by employee.created_at, employee.id
      limit 1;

      if v_employee_id is not null then
        if exists (
          select 1
          from public.entities other_entity
          where other_entity.legacy_employee_id = v_employee_id
            and other_entity.id <> v_id
        ) then
          raise exception 'Este CPF já está vinculado a outro cadastro de funcionário nesta empresa.'
            using errcode = '23505';
        end if;

        update public.entities
        set legacy_employee_id = v_employee_id
        where id = v_id
          and organization_id = p_organization_id;
      else
        v_employee_id := v_id;
        insert into public.employees (
          id, organization_id, full_name, cpf, phone, function_name, is_active
        ) values (
          v_employee_id, p_organization_id, v_name, v_document,
          nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
          coalesce(nullif(trim(coalesce(p_employee->>'job_title','')),''), 'Funcionário'),
          coalesce((p_entity->>'is_active')::boolean, true)
        );
        update public.entities
        set legacy_employee_id = v_employee_id
        where id = v_id
          and organization_id = p_organization_id;
      end if;
    end if;

    -- A ficha de Cadastros é a fonte dos dados cadastrais do funcionário.
    -- Preserve o profile/role já existente do acesso quando houver.
    update public.employees
    set
      full_name = v_name,
      cpf = v_document,
      phone = nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
      function_name = coalesce(nullif(trim(coalesce(p_employee->>'job_title','')),''), 'Funcionário'),
      is_active = coalesce((p_entity->>'is_active')::boolean, true),
      updated_at = timezone('utc', now())
    where id = v_employee_id
      and organization_id = p_organization_id;

    insert into public.entity_employee_details(
      entity_id,
      job_title,
      team_name,
      admission_date,
      profile_id,
      role_id
    )
    select
      v_id,
      nullif(trim(coalesce(p_employee->>'job_title','')),''),
      nullif(trim(coalesce(p_employee->>'team_name','')),''),
      nullif(p_employee->>'admission_date','')::date,
      employee.profile_id,
      employee.role_id
    from public.employees employee
    where employee.id = v_employee_id
      and employee.organization_id = p_organization_id
    on conflict (entity_id) do update set
      job_title = excluded.job_title,
      team_name = excluded.team_name,
      admission_date = excluded.admission_date,
      profile_id = excluded.profile_id,
      role_id = excluded.role_id,
      updated_at = timezone('utc', now());
  elsif v_employee_id is not null then
    update public.employees set is_active = false, updated_at = timezone('utc', now()) where id = v_employee_id;
  end if;

  if p_address is not null and jsonb_typeof(p_address) = 'object' then
    select id into v_address_id from public.entity_addresses where entity_id = v_id and is_primary = true order by created_at limit 1;
    if v_address_id is null then
      v_address_id := gen_random_uuid();
      insert into public.entity_addresses(
        id, entity_id, organization_id, type, zip_code, state, city, neighborhood, street,
        number, complement, reference, location_url, is_primary
      ) values (
        v_address_id, v_id, p_organization_id, coalesce(nullif(p_address->>'type',''),'Principal'),
        nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
        nullif(upper(trim(coalesce(p_address->>'state',''))),''),
        nullif(trim(coalesce(p_address->>'city','')),''),
        nullif(trim(coalesce(p_address->>'neighborhood','')),''),
        nullif(trim(coalesce(p_address->>'street','')),''),
        nullif(trim(coalesce(p_address->>'number','')),''),
        nullif(trim(coalesce(p_address->>'complement','')),''),
        nullif(trim(coalesce(p_address->>'reference','')),''),
        nullif(trim(coalesce(p_address->>'location_url','')),''), true
      );
    else
      update public.entity_addresses set
        type = coalesce(nullif(p_address->>'type',''),'Principal'),
        zip_code = nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
        state = nullif(upper(trim(coalesce(p_address->>'state',''))),''),
        city = nullif(trim(coalesce(p_address->>'city','')),''),
        neighborhood = nullif(trim(coalesce(p_address->>'neighborhood','')),''),
        street = nullif(trim(coalesce(p_address->>'street','')),''),
        number = nullif(trim(coalesce(p_address->>'number','')),''),
        complement = nullif(trim(coalesce(p_address->>'complement','')),''),
        reference = nullif(trim(coalesce(p_address->>'reference','')),''),
        location_url = nullif(trim(coalesce(p_address->>'location_url','')),''),
        updated_at = timezone('utc', now())
      where id = v_address_id;
    end if;

    if v_has_customer and v_customer_id is not null then
      if exists (select 1 from public.customer_addresses where id = v_address_id) then
        update public.customer_addresses set
          customer_id = v_customer_id,
          organization_id = p_organization_id,
          zip_code = nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
          street = nullif(trim(coalesce(p_address->>'street','')),''),
          number = nullif(trim(coalesce(p_address->>'number','')),''),
          complement = nullif(trim(coalesce(p_address->>'complement','')),''),
          neighborhood = nullif(trim(coalesce(p_address->>'neighborhood','')),''),
          city = nullif(trim(coalesce(p_address->>'city','')),''),
          state = nullif(upper(trim(coalesce(p_address->>'state',''))),''),
          reference = nullif(trim(coalesce(p_address->>'reference','')),''),
          is_default = true,
          shared_map_url = nullif(trim(coalesce(p_address->>'location_url','')),''),
          updated_at = timezone('utc', now())
        where id = v_address_id;
      else
        insert into public.customer_addresses(
          id, customer_id, organization_id, zip_code, street, number, complement,
          neighborhood, city, state, reference, is_default, shared_map_url
        ) values (
          v_address_id, v_customer_id, p_organization_id,
          nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
          nullif(trim(coalesce(p_address->>'street','')),''),
          nullif(trim(coalesce(p_address->>'number','')),''),
          nullif(trim(coalesce(p_address->>'complement','')),''),
          nullif(trim(coalesce(p_address->>'neighborhood','')),''),
          nullif(trim(coalesce(p_address->>'city','')),''),
          nullif(upper(trim(coalesce(p_address->>'state',''))),''),
          nullif(trim(coalesce(p_address->>'reference','')),''), true,
          nullif(trim(coalesce(p_address->>'location_url','')),'')
        );
        update public.entity_addresses set legacy_customer_address_id = v_address_id where id = v_address_id;
      end if;
    end if;
  end if;


  -- Edição dos serviços dentro da transação da ficha, sem requisições extras.
  -- Chamadores antigos não enviam provider_services e mantêm os dados existentes.
  if p_entity ? 'provider_services' then
    if jsonb_typeof(p_entity->'provider_services') <> 'array'
       or jsonb_array_length(p_entity->'provider_services') > 30 then
      raise exception 'Lista de serviços inválida (máximo de 30).' using errcode = '22023';
    end if;
    if v_has_provider and jsonb_array_length(p_entity->'provider_services') = 0 then
      raise exception 'Cadastre ao menos um serviço prestado.' using errcode = '22023';
    end if;
    if not v_has_provider and jsonb_array_length(p_entity->'provider_services') > 0 then
      raise exception 'Ative o vínculo Prestador de serviço antes de cadastrar serviços.' using errcode = '22023';
    end if;

    for v_service in select value from jsonb_array_elements(p_entity->'provider_services') loop
      if jsonb_typeof(v_service) <> 'object' then
        raise exception 'Serviço prestado inválido.' using errcode = '22023';
      end if;
      v_service_name := btrim(coalesce(v_service->>'name', ''));
      v_service_description := nullif(btrim(coalesce(v_service->>'description', '')), '');
      v_service_price := nullif(btrim(coalesce(v_service->>'reference_price', '')), '');
      if char_length(v_service_name) not between 1 and 120
         or char_length(coalesce(v_service_description, '')) > 500 then
        raise exception 'Nome do serviço obrigatório (até 120 caracteres) e descrição de até 500 caracteres.' using errcode = '22023';
      end if;
      if v_service_price is not null and (
         char_length(v_service_price) > 20
         or v_service_price::numeric < 0
         or v_service_price::numeric > 9999999999.99
         or scale(v_service_price::numeric) > 2
      ) then
        raise exception 'Valor de referência inválido.' using errcode = '22023';
      end if;

      v_service_id := coalesce(nullif(v_service->>'id', '')::uuid, gen_random_uuid());
      if v_service_id = any(v_service_ids) then
        raise exception 'Serviço repetido no cadastro.' using errcode = '22023';
      end if;
      if nullif(v_service->>'id', '') is not null and not exists (
        select 1 from public.entity_provider_services original
        where original.id = v_service_id and original.organization_id = p_organization_id
          and original.entity_id = v_id
      ) then
        raise exception 'Serviço de outro cadastro.' using errcode = '42501';
      end if;

      insert into public.entity_provider_services (id, organization_id, entity_id, name, description, reference_price)
      values (v_service_id, p_organization_id, v_id, v_service_name, v_service_description, v_service_price::numeric)
      on conflict (id) do update set
        name = excluded.name, description = excluded.description,
        reference_price = excluded.reference_price, updated_at = timezone('utc', now())
      where public.entity_provider_services.organization_id = p_organization_id
        and public.entity_provider_services.entity_id = v_id;

      get diagnostics v_modified = row_count;
      if v_modified <> 1 then
        raise exception 'Falha ao salvar serviço prestado.' using errcode = '42501';
      end if;
      v_service_ids := array_append(v_service_ids, v_service_id);
    end loop;
    delete from public.entity_provider_services
      where organization_id = p_organization_id and entity_id = v_id
        and not (id = any(v_service_ids));
  end if;

  return v_id;
end;
$function$;
commit;
