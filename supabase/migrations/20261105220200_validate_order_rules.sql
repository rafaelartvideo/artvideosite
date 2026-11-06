create or replace function private.validate_order_rules_v1(p_org uuid,p_order_id uuid,p_stage text,p_candidate jsonb default null)
returns void language plpgsql security definer set search_path='' as $f$
declare
 o public.service_orders%rowtype; candidate jsonb; lvl int; missing text; labels int; equipment int;
begin
 select * into o from public.service_orders where id=p_order_id and organization_id=p_org;
 if not found then raise exception 'OS não pertence à empresa.' using errcode='42501'; end if;
 if o.order_rules_snapshot is null then return; end if;
 candidate:=coalesce(p_candidate,to_jsonb(o));
 lvl:=case p_stage when 'create' then 0 when 'start' then 1 when 'finish' then 2 else -1 end;
 if lvl<0 then raise exception 'Etapa inválida.' using errcode='22023'; end if;
 select f.key into missing from jsonb_each(coalesce(o.order_rules_snapshot->'fields','{}'::jsonb)) f
 where f.value->>'mode'='required'
  and lvl>=case f.value->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end
  and f.key=any(array['customer_notes','equipment_type_id','equipment_brand_id','equipment_model_id','serial_number','accessories','internal_notes','external_os_number','diagnosis','solution'])
  and nullif(trim(coalesce(candidate->>f.key,'')),'') is null limit 1;
 if missing is not null then raise exception 'Campo obrigatório: %',missing using errcode='22023'; end if;
 select count(*) filter(where sort_order between 500 and 999),count(*) filter(where sort_order between 0 and 499)
 into labels,equipment from public.service_order_media where service_order_id=p_order_id and organization_id=p_org;
 if o.order_rules_snapshot->'photos'->'label'->>'mode'='required'
  and lvl>=case o.order_rules_snapshot->'photos'->'label'->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end
  and labels<greatest(1,least(20,coalesce((o.order_rules_snapshot->'photos'->'label'->>'minCount')::int,1))) then
   raise exception 'Foto da etiqueta obrigatória nesta etapa.' using errcode='22023';
 end if;
 if o.order_rules_snapshot->'photos'->'equipment'->>'mode'='required'
  and lvl>=case o.order_rules_snapshot->'photos'->'equipment'->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end
  and equipment<greatest(1,least(20,coalesce((o.order_rules_snapshot->'photos'->'equipment'->>'minCount')::int,1))) then
   raise exception 'Fotos do equipamento obrigatórias nesta etapa.' using errcode='22023';
 end if;
end;
$f$;
revoke all on function private.validate_order_rules_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;