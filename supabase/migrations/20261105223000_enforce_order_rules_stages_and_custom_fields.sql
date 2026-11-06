-- Enforce configured order rules on persisted transitions; legacy orders without snapshots remain unchanged.
create or replace function private.validate_order_rules_v1(
  p_org uuid, p_order_id uuid, p_stage text, p_candidate jsonb default null
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_order public.service_orders%rowtype;
  v_payload jsonb;
  v_level integer;
  v_missing text;
  v_field jsonb;
  v_value jsonb;
  v_label integer;
  v_equipment integer;
begin
  select * into v_order from public.service_orders
    where id=p_order_id and organization_id=p_org;
  if not found then raise exception 'OS não encontrada nesta empresa.' using errcode='42501'; end if;
  if v_order.order_rules_snapshot is null then return; end if;
  v_payload:=coalesce(p_candidate,to_jsonb(v_order));
  v_level:=case p_stage when 'create' then 0 when 'start' then 1 when 'finish' then 2 else -1 end;
  if v_level=-1 then raise exception 'Etapa inválida.' using errcode='22023'; end if;

  select f.key into v_missing
  from jsonb_each(coalesce(v_order.order_rules_snapshot->'fields','{}'::jsonb)) f
  where f.value->>'mode'='required'
    and v_level>=case f.value->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end
    and f.key=any(array['customer_notes','equipment_type_id','equipment_brand_id','equipment_model_id',
      'serial_number','accessories','internal_notes','external_os_number','diagnosis','solution'])
    and nullif(trim(coalesce(v_payload->>f.key,'')),'') is null
  limit 1;
  if v_missing is not null then
    raise exception 'Campo obrigatório não preenchido: %',v_missing using errcode='22023';
  end if;

  for v_field in select value from jsonb_array_elements(
    case when jsonb_typeof(v_order.order_rules_snapshot->'custom_fields')='array'
      then v_order.order_rules_snapshot->'custom_fields' else '[]'::jsonb end)
  loop
    if v_field->>'mode'<>'required' or
      v_level<(case v_field->>'stage' when 'start' then 1 when 'finish' then 2 else 0 end) then
      continue;
    end if;
    v_value:=coalesce(v_payload->'custom_field_values'->(v_field->>'key'),'null'::jsonb);
    if v_field->>'type'='file' then
      if jsonb_typeof(v_value)<>'object'
        or coalesce(v_value->>'media_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists(
          select 1 from public.media m
          where m.id=(v_value->>'media_id')::uuid
            and m.organization_id=p_org and m.storage_path is not null
        ) then
        raise exception 'Arquivo obrigatório não enviado: %',coalesce(v_field->>'label',v_field->>'key')
          using errcode='22023';
      end if;
    elsif v_field->>'type'='checkbox' then
      if v_value <> 'true'::jsonb then
        raise exception 'Campo personalizado obrigatório não marcado: %',coalesce(v_field->>'label',v_field->>'key')
          using errcode='22023';
      end if;
    elsif v_value='null'::jsonb or nullif(trim(v_value #>> '{}'),'') is null then
      raise exception 'Campo personalizado obrigatório: %',coalesce(v_field->>'label',v_field->>'key')
        using errcode='22023';
    end if;
  end loop;

  select count(*) filter(where sort_order >= 500 and sort_order < 1000),
         count(*) filter(where sort_order >= 0 and sort_order < 500)
    into v_label,v_equipment
    from public.service_order_media
    where service_order_id=p_order_id and organization_id=p_org;
  if v_order.order_rules_snapshot->'photos'->'label'->>'mode'='required'
    and v_level>=(case v_order.order_rules_snapshot->'photos'->'label'->>'stage'
      when 'start' then 1 when 'finish' then 2 else 0 end)
    and v_label<greatest(1,least(20,coalesce((v_order.order_rules_snapshot->'photos'->'label'->>'minCount')::int,1)))
    then raise exception 'Foto da etiqueta obrigatória nesta etapa.' using errcode='22023';
  end if;
  if v_order.order_rules_snapshot->'photos'->'equipment'->>'mode'='required'
    and v_level>=(case v_order.order_rules_snapshot->'photos'->'equipment'->>'stage'
      when 'start' then 1 when 'finish' then 2 else 0 end)
    and v_equipment<greatest(1,least(20,coalesce((v_order.order_rules_snapshot->'photos'->'equipment'->>'minCount')::int,1)))
    then raise exception 'Fotos do equipamento obrigatórias nesta etapa.' using errcode='22023';
  end if;
end;
$function$;
revoke all on function private.validate_order_rules_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;

create or replace function private.enforce_order_rules_on_transition()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.order_rules_snapshot is null then return new; end if;
  if (old.is_solved is distinct from true and new.is_solved is true)
    or (old.completed_at is null and new.completed_at is not null) then
    perform private.validate_order_rules_v1(new.organization_id,new.id,'finish',to_jsonb(new));
  end if;
  return new;
end;
$function$;
revoke all on function private.enforce_order_rules_on_transition() from public,anon,authenticated;
drop trigger if exists enforce_order_rules_on_transition on public.service_orders;
create trigger enforce_order_rules_on_transition
before update of is_solved,completed_at on public.service_orders
for each row execute function private.enforce_order_rules_on_transition();

create or replace function private.enforce_order_rules_on_task_start()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.status='in_progress' and (tg_op='INSERT' or old.status is distinct from 'in_progress') then
    perform private.validate_order_rules_v1(new.organization_id,new.service_order_id,'start');
  end if;
  return new;
end;
$function$;
revoke all on function private.enforce_order_rules_on_task_start() from public,anon,authenticated;
drop trigger if exists enforce_order_rules_on_task_start on public.service_order_item_tasks;
create trigger enforce_order_rules_on_task_start
before insert or update of status on public.service_order_item_tasks
for each row execute function private.enforce_order_rules_on_task_start();