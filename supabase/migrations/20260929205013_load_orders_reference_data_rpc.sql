
create or replace function public.load_orders_reference_data_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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

revoke all on function public.load_orders_reference_data_v1(uuid)
from public, anon;

grant execute on function public.load_orders_reference_data_v1(uuid)
to authenticated;
