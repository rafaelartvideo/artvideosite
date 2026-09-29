
create or replace function public.load_equipment_catalog_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.can_manage_own_operation_config(
    p_organization_id,
    'equipment',
    'equipment.view'
  ) then
    raise exception 'Sem permissão para consultar equipamentos.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'types',
    coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.name)
      from public.equipment_types item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'brands',
    coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.name)
      from public.equipment_brands item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'models',
    coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.name)
      from public.equipment_models item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'technicalFields',
    coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.label)
      from public.technical_fields item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'technicalFieldLinks',
    coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.equipment_type_id, item.technical_field_id)
      from public.equipment_type_technical_fields item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'checklistProfiles',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'version', item.version,
          'is_active', item.is_active
        )
        order by item.name
      )
      from public.checklist_profiles item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'checklistStages',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'profile_id', item.profile_id,
          'code', item.code,
          'name', item.name,
          'stage_type', item.stage_type,
          'sort_order', item.sort_order,
          'is_active', item.is_active
        )
        order by item.sort_order
      )
      from public.checklist_profile_stages item
      where item.organization_id = p_organization_id
        and item.is_active
    ), '[]'::jsonb),
    'equipmentChecklistItems',
    coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.id)
      from public.equipment_checklist_items item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.load_equipment_catalog_v1(uuid)
from public, anon;
grant execute on function public.load_equipment_catalog_v1(uuid)
to authenticated;
