-- A descrição operacional é opcional e usada como snapshot em OS/orçamentos.
-- Nenhum item anterior ou documento já emitido é modificado.
begin;

alter table public.general_services add column if not exists description text;

comment on column public.general_services.description is 'Descrição operacional do serviço, capturada nos itens de orçamento e OS.';

CREATE OR REPLACE FUNCTION public.search_service_order_services_v1(p_service_order_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, description text, unit text, price numeric, stock numeric, price_at_completion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  select * into v_order from public.service_orders where service_orders.id=p_service_order_id;
  if not found or not private.can_view_service_order(p_service_order_id) then
    raise exception 'OS não encontrada ou sem acesso.' using errcode='42501';
  end if;

  return query
  select
    service.id,
    service.name,
    service.description,
    'serviço'::text,
    service.price,
    null::numeric,
    service.price_at_completion
  from public.general_services service
  where service.organization_id=v_order.organization_id
    and service.is_active=true
    and (
      v_order.equipment_type_id is null
      or exists (
        select 1
        from public.equipment_type_general_services link
        where link.organization_id=v_order.organization_id
          and link.equipment_type_id=v_order.equipment_type_id
          and link.general_service_id=service.id
      )
    )
    and lower(btrim(service.name))<>lower('Serviço avulso')
    and (
      v_search=''
      or lower(service.name) like '%'||v_search||'%'
    )
  order by
    case when v_search<>'' and lower(service.name) like v_search||'%' then 0 else 1 end,
    service.sort_order,
    service.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_service_order_catalog_item_v1(p_service_order_id uuid, p_item_type text, p_catalog_id uuid, p_quantity integer DEFAULT 1, p_unit_price numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_item_id uuid;
  v_type text:=lower(btrim(coalesce(p_item_type,'')));
  v_service public.general_services%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_price numeric;
  v_pricing jsonb;
begin
  select * into v_order
  from public.service_orders
  where id=p_service_order_id
  for update;

  if not found then
    raise exception 'OS não encontrada.' using errcode='P0002';
  end if;

  if not (
    private.can_access_service_order_child(p_service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(p_service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar os produtos e serviços desta OS.' using errcode='42501';
  end if;

  if v_order.completed_at is not null then
    raise exception 'A OS já foi concluída.' using errcode='22023';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'A OS está cancelada.' using errcode='22023';
  end if;
  if coalesce(p_quantity,0)<=0 then
    raise exception 'Informe uma quantidade válida.' using errcode='22023';
  end if;

  if v_type='service' then
    select * into v_service
    from public.general_services
    where id=p_catalog_id
      and organization_id=v_order.organization_id
      and is_active=true;

    if not found or lower(btrim(v_service.name))=lower('Serviço avulso') then
      raise exception 'Serviço não encontrado ou inativo.' using errcode='P0002';
    end if;
    -- Serviços "Sem preço" e "Definir na conclusão" são incluídos com
    -- valor inicial zero, sem impor preço fictício ao catálogo.
    v_price:=round(coalesce(v_service.price,0),2);

    select id into v_item_id
    from public.service_order_items
    where service_order_id=p_service_order_id
      and item_type='service'
      and general_service_id=p_catalog_id
    for update;

    if found then
      update public.service_order_items
      set quantity=quantity+p_quantity
      where id=v_item_id;
    else
      insert into public.service_order_items(
        service_order_id,organization_id,item_type,general_service_id,
        title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal
      ) values (
        p_service_order_id,v_order.organization_id,'service',v_service.id,
        v_service.name,v_service.description,p_quantity,v_price,'serviço',0,round(p_quantity*v_price,2)
      ) returning id into v_item_id;
    end if;

  elsif v_type='product' then
    select * into v_inventory
    from public.inventory_items
    where id=p_catalog_id
      and organization_id=v_order.organization_id
      and is_active=true;

    if not found then
      raise exception 'Produto não encontrado ou inativo.' using errcode='P0002';
    end if;

    if coalesce(v_inventory.quantity,0)<=0 then
      raise exception 'Este produto está sem estoque disponível e não pode ser adicionado à OS.' using errcode='22023';
    end if;

    if p_unit_price is not null and p_unit_price<0 then
      raise exception 'Informe um preço válido.' using errcode='22023';
    end if;

    v_price:=coalesce(
      p_unit_price,
      case
        when lower(coalesce(v_inventory.unit,'un'))='cx'
          then coalesce(v_inventory.sale_price,0)*greatest(1,coalesce(v_inventory.conversion_factor,1))
        else coalesce(v_inventory.sale_price,0)
      end,
      0
    );

    select id into v_item_id
    from public.service_order_items
    where service_order_id=p_service_order_id
      and item_type='product'
      and inventory_item_id=p_catalog_id
    for update;

    if found then
      update public.service_order_items
      set quantity=quantity+p_quantity,
          unit_price=v_price
      where id=v_item_id;
    else
      insert into public.service_order_items(
        service_order_id,organization_id,item_type,inventory_item_id,
        title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal
      ) values (
        p_service_order_id,v_order.organization_id,'product',v_inventory.id,
        v_inventory.name,v_inventory.description,p_quantity,v_price,
        coalesce(nullif(btrim(v_inventory.unit),''),'un'),0,round(p_quantity*v_price,2)
      ) returning id into v_item_id;
    end if;

  else
    raise exception 'Tipo de item inválido.' using errcode='22023';
  end if;

  v_pricing:=private.recalculate_service_order_commercial_totals(p_service_order_id,null,null);
  return jsonb_build_object('item_id',v_item_id,'pricing',v_pricing);
end;
$function$;

commit;
