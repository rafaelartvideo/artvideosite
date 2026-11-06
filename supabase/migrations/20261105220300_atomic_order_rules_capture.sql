do $patch$
declare
 definition text;
 target text:=E'\n  return jsonb_build_object(';
 replacement text:=E'\n  update public.service_orders set order_rules_snapshot=private.effective_order_rules_v1(p_organization_id,v_source.service_type_id,v_source.equipment_type_id),custom_field_values=case when jsonb_typeof(p_payload->''custom_field_values'')=''object'' then p_payload->''custom_field_values'' else ''{}''::jsonb end where id=p_order_id and organization_id=p_organization_id;\n  perform private.validate_order_rules_v1(p_organization_id,p_order_id,''create'');\n  return jsonb_build_object(';
begin
 select pg_get_functiondef('public.create_service_order_atomic(uuid,uuid,jsonb,uuid[],uuid[],jsonb,jsonb)'::regprocedure) into definition;
 if position('private.validate_order_rules_v1(p_organization_id,p_order_id' in definition)>0 then return; end if;
 if position(target in definition)=0 then raise exception 'Função atômica de OS mudou: revisão necessária.'; end if;
 definition:=replace(definition,target,replacement);
 execute definition;
end;
$patch$;