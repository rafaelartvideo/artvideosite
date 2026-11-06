create or replace function private.validate_order_rules_v1(
 p_org uuid,p_order_id uuid,p_stage text,p_candidate jsonb default null
) returns void language plpgsql security definer set search_path='' as $f$
declare
 o public.service_orders%rowtype;
 candidate jsonb;
 key text;
 rule jsonb;
 item jsonb;
 value_text text;
 step int;
 minimum int;
 actual int;
begin
 select * into o from public.service_orders where id=p_order_id and organization_id=p_org;
 if not found then raise exception 'OS não pertence à empresa.' using errcode='42501'; end if;
 if o.order_rules_snapshot is null then return; end if;
 candidate:=coalesce(p_candidate,to_jsonb(o));
 step:=case p_stage when 'create' then 0 when 'start' then 1 when 'finish' then 2 else -1 end;
 if step<0 then raise exception 'Etapa inválida.' using errcode='22023'; end if;
 for key,rule in select k,v from jsonb_each(coalesce(o.order_rules_snapshot->'fields','{}'::jsonb)) as field(k,v) loop
  if rule->>'mode' <> 'required' then continue; end if;
  if step < case rule->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end then continue; end if;
  if key not in ('customer_notes','equipment_type_id','equipment_brand_id','equipment_model_id','serial_number','accessories','internal_notes','external_os_number','diagnosis','solution') then continue; end if;
  if nullif(trim(coalesce(candidate->>key,'')),'') is null then
   raise exception 'Campo obrigatório da OS não preenchido: %.',key using errcode='22023';
  end if;
 end loop;
 for key,rule in select k,v from jsonb_each(coalesce(o.order_rules_snapshot->'photos','{}'::jsonb)) as photo(k,v) loop
  if key not in ('label','equipment') or rule->>'mode'<>'required' then continue; end if;
  if step < case rule->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end then continue; end if;
  minimum:=greatest(1,least(20,coalesce((rule->>'minCount')::integer,1)));
  select count(*) into actual from public.service_order_media m
   where m.service_order_id=p_order_id and m.organization_id=p_org
    and ((key='label' and m.sort_order between 500 and 999)
      or (key='equipment' and m.sort_order between 0 and 499));
  if actual<minimum then
   raise exception 'É necessário anexar % foto(s) de % antes desta etapa.',minimum,
    case when key='label' then 'etiqueta' else 'equipamento' end using errcode='22023';
  end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(o.order_rules_snapshot->'custom_fields','[]'::jsonb)) loop
  if item->>'mode'<>'required' then continue; end if;
  if step < case item->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end then continue; end if;
  key:=item->>'key';
  if key is null or key !~ '^[a-z][a-z0-9_]{0,39}$' then continue; end if;
  value_text:=btrim(coalesce((coalesce(candidate->'custom_field_values',o.custom_field_values))->>key,''));
  if value_text='' or value_text='null' or (item->>'type'='checkbox' and value_text<>'true') then
   raise exception 'Campo personalizado obrigatório: %.',left(coalesce(item->>'label',key),80) using errcode='22023';
  end if;
 end loop;
end; $f$;
revoke all on function private.validate_order_rules_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;