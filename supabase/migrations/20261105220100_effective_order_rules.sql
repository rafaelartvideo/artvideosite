create or replace function private.effective_order_rules_v1(
 p_organization_id uuid,p_service_type_id uuid,p_equipment_type_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare
 result jsonb:='{"fields":{"customer_notes":{"mode":"required","stage":"create"},"equipment_type_id":{"mode":"optional","stage":"create"},"equipment_brand_id":{"mode":"optional","stage":"create"},"equipment_model_id":{"mode":"optional","stage":"create"},"serial_number":{"mode":"optional","stage":"create"},"accessories":{"mode":"optional","stage":"create"},"internal_notes":{"mode":"optional","stage":"create"},"external_os_number":{"mode":"optional","stage":"create"},"diagnosis":{"mode":"optional","stage":"finish"},"solution":{"mode":"optional","stage":"finish"}},"photos":{"label":{"mode":"required","stage":"create","minCount":1},"equipment":{"mode":"optional","stage":"create","minCount":1}},"custom_fields":[]}'::jsonb;
 layer jsonb;
begin
 for layer in select r.rules from public.organization_order_rules r
 where r.organization_id=p_organization_id and (
  r.scope='company'
  or (r.scope='service_type' and r.service_type_id=p_service_type_id)
  or (r.scope='equipment_type' and r.equipment_type_id=p_equipment_type_id)
  or (r.scope='combination' and r.service_type_id=p_service_type_id and r.equipment_type_id=p_equipment_type_id)
 ) order by case r.scope when 'company' then 1 when 'service_type' then 2 when 'equipment_type' then 3 else 4 end
 loop
  result:=jsonb_set(result,'{fields}',coalesce(result->'fields','{}'::jsonb)||coalesce(layer->'fields','{}'::jsonb));
  result:=jsonb_set(result,'{photos}',coalesce(result->'photos','{}'::jsonb)||coalesce(layer->'photos','{}'::jsonb));
  if layer ? 'custom_fields' and jsonb_typeof(layer->'custom_fields')='array' then
   result:=jsonb_set(result,'{custom_fields}',layer->'custom_fields');
  end if;
 end loop;
 return result;
end $f$;
revoke all on function private.effective_order_rules_v1(uuid,uuid,uuid) from public,anon,authenticated;