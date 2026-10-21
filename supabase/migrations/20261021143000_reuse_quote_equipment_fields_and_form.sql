begin;
alter table public.quote_requests
  add column if not exists equipment_type_id uuid references public.equipment_types(id) on delete set null,
  add column if not exists equipment_brand_id uuid references public.equipment_brands(id) on delete set null,
  add column if not exists equipment_model_id uuid references public.equipment_models(id) on delete set null,
  add column if not exists technical_values jsonb not null default '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.save_internal_quote_v1(p_organization_id uuid, p_quote_id uuid, p_payload jsonb, p_items jsonb, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_status uuid;
  v_status_slug text;
  v_item jsonb;
  v_quantity integer;
  v_unit_price numeric;
  v_additional_cost numeric;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_discount_type text;
  v_discount numeric;
  v_customer uuid;
  v_item_type text;
  v_service uuid;
  v_inventory uuid;
  v_type uuid;
  v_brand uuid;
  v_model uuid;
begin
  if auth.uid() is null then raise exception 'Sessão não autenticada'; end if;
  if p_organization_id is null then raise exception 'Empresa não informada'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Dados inválidos'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Lista de itens inválida (máximo de 100 itens)';
  end if;
  v_customer := nullif(p_payload->>'customer_id','')::uuid;
  if v_customer is null or not exists(select 1 from public.customers c where c.id = v_customer and c.organization_id = p_organization_id) then
    raise exception 'Cliente inválido para esta empresa';
  end if;

  v_type := nullif(p_payload->>'equipment_type_id','')::uuid;
  v_brand := nullif(p_payload->>'equipment_brand_id','')::uuid;
  v_model := nullif(p_payload->>'equipment_model_id','')::uuid;
  if (v_type is not null and not exists(select 1 from public.equipment_types t where t.id=v_type and t.organization_id=p_organization_id))
    or (v_brand is not null and not exists(select 1 from public.equipment_brands b where b.id=v_brand and b.organization_id=p_organization_id and b.equipment_type_id=v_type))
    or (v_model is not null and not exists(select 1 from public.equipment_models m where m.id=v_model and m.organization_id=p_organization_id and m.equipment_brand_id=v_brand)) then
    raise exception 'Tipo, marca ou modelo não pertence à empresa selecionada';
  end if;
  if (p_payload ? 'technical_values') and jsonb_typeof(p_payload->'technical_values') <> 'object' then
    raise exception 'Campos técnicos inválidos';
  end if;
  v_discount_type := coalesce(nullif(p_payload->>'discount_type',''),'amount');
  v_discount := coalesce(nullif(p_payload->>'discount_value','')::numeric,0);
  if v_discount_type not in ('amount','percentage') or v_discount < 0 then raise exception 'Desconto inválido'; end if;
  if v_discount_type = 'percentage' and v_discount > 100 then raise exception 'Desconto não pode superar 100%%'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_type := v_item->>'item_type';
    v_quantity := coalesce((v_item->>'quantity')::integer,1);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric,0);
    v_additional_cost := coalesce((v_item->>'additional_cost')::numeric,0);
    if v_item_type not in ('product','service','custom_service')
       or nullif(btrim(v_item->>'title_snapshot'),'') is null
       or v_quantity <= 0 or v_quantity > 10000
       or v_unit_price < 0 or v_additional_cost < 0 then
      raise exception 'Item do orçamento inválido';
    end if;
    v_service := nullif(v_item->>'general_service_id','')::uuid;
    v_inventory := nullif(v_item->>'inventory_item_id','')::uuid;
    if (v_service is not null and not exists(select 1 from public.general_services s where s.id = v_service and s.organization_id = p_organization_id))
      or (v_inventory is not null and not exists(select 1 from public.inventory_items s where s.id = v_inventory and s.organization_id = p_organization_id))
    then raise exception 'Produto ou serviço de outra empresa'; end if;
    v_subtotal := v_subtotal + (v_quantity * v_unit_price) + v_additional_cost;
  end loop;
  v_total := greatest(0, v_subtotal - case when v_discount_type='percentage'
    then round(v_subtotal * v_discount / 100,2) else v_discount end);
  if v_discount_type='amount' and v_discount > v_subtotal then
    raise exception 'Desconto superior ao subtotal';
  end if;

  if p_quote_id is null then
    select id into v_status from public.request_statuses
     where organization_id = p_organization_id and slug in ('RASCUNHO','PENDENTE')
     order by case when slug='RASCUNHO' then 0 else 1 end limit 1;
    if v_status is null then raise exception 'Configure as situações de orçamento desta empresa'; end if;
    insert into public.quote_requests (
      organization_id, origin, protocol, customer_id, assigned_to, status_id,
      issue_reported, diagnosis, proposed_solution, internal_notes,
      equipment_name, equipment_brand, equipment_model, equipment_type_id, equipment_brand_id, equipment_model_id, technical_values, serial_number,
      accessories, equipment_condition, valid_until,
      discount_type, discount_value, estimated_price, final_price
    ) values (
      p_organization_id,'internal',null,v_customer,auth.uid(),v_status,
      nullif(btrim(p_payload->>'issue_reported'),''),
      nullif(btrim(p_payload->>'diagnosis'),''),
      nullif(btrim(p_payload->>'proposed_solution'),''),
      nullif(btrim(p_payload->>'internal_notes'),''),
      (select name from public.equipment_types where id = v_type),
      (select name from public.equipment_brands where id = v_brand),
      (select name from public.equipment_models where id = v_model),
      v_type, v_brand, v_model, coalesce(p_payload->'technical_values','{}'::jsonb),
      nullif(btrim(p_payload->>'serial_number'),''),
      nullif(btrim(p_payload->>'accessories'),''),
      nullif(btrim(p_payload->>'equipment_condition'),''),
      nullif(p_payload->>'valid_until','')::date,
      v_discount_type, v_discount, v_subtotal, v_total
    ) returning id into v_id;
  else
    select q.id, s.slug into v_id,v_status_slug
      from public.quote_requests q
      join public.request_statuses s on s.id=q.status_id and s.organization_id=q.organization_id
      where q.id=p_quote_id and q.organization_id=p_organization_id and q.origin='internal'
      for update of q;
    if v_id is null then raise exception 'Orçamento interno não encontrado'; end if;
    if v_status_slug not in ('RASCUNHO','PENDENTE','EM_ANALISE','RENEGOCIACAO') then
      raise exception 'Este orçamento não pode mais ser editado. Inicie uma renegociação ou revisão.';
    end if;
    update public.quote_requests set
      customer_id=v_customer,
      issue_reported=nullif(btrim(p_payload->>'issue_reported'),''),
      diagnosis=nullif(btrim(p_payload->>'diagnosis'),''),
      proposed_solution=nullif(btrim(p_payload->>'proposed_solution'),''),
      internal_notes=nullif(btrim(p_payload->>'internal_notes'),''),
      equipment_name=(select name from public.equipment_types where id=v_type),
      equipment_brand=(select name from public.equipment_brands where id=v_brand),
      equipment_model=(select name from public.equipment_models where id=v_model),
      equipment_type_id=v_type,
      equipment_brand_id=v_brand,
      equipment_model_id=v_model,
      technical_values=coalesce(p_payload->'technical_values','{}'::jsonb),
      serial_number=nullif(btrim(p_payload->>'serial_number'),''),
      accessories=nullif(btrim(p_payload->>'accessories'),''),
      equipment_condition=nullif(btrim(p_payload->>'equipment_condition'),''),
      valid_until=nullif(p_payload->>'valid_until','')::date,
      discount_type=v_discount_type,
      discount_value=v_discount,
      estimated_price=v_subtotal,
      final_price=v_total
    where id=v_id and organization_id=p_organization_id;
    delete from public.quote_commercial_items where quote_request_id=v_id and organization_id=p_organization_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.quote_commercial_items (
      quote_request_id,organization_id,item_type,general_service_id,inventory_item_id,
      title_snapshot,description_snapshot,quantity,unit_price,additional_cost
    ) values (
      v_id,p_organization_id,v_item->>'item_type',
      nullif(v_item->>'general_service_id','')::uuid,
      nullif(v_item->>'inventory_item_id','')::uuid,
      btrim(v_item->>'title_snapshot'),nullif(btrim(v_item->>'description_snapshot'),''),
      coalesce((v_item->>'quantity')::integer,1),
      coalesce((v_item->>'unit_price')::numeric,0),
      coalesce((v_item->>'additional_cost')::numeric,0)
    );
  end loop;
  if nullif(btrim(coalesce(p_comment,'')),'') is not null then
    insert into public.quote_comments(quote_request_id,organization_id,author_id,body)
    values(v_id,p_organization_id,auth.uid(),btrim(p_comment));
  end if;
  return v_id;
end;
$function$
;
commit;