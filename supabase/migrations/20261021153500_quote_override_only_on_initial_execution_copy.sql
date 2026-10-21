begin;
CREATE OR REPLACE FUNCTION private.prepare_service_order_commercial_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_display_price numeric;
  v_quote_item jsonb;
begin
  select * into v_order
  from public.service_orders
  where id=new.service_order_id;

  if not found then
    raise exception 'OS não encontrada.' using errcode='23503';
  end if;
  if v_order.completed_at is not null then
    raise exception 'A OS já foi concluída e seus itens comerciais não podem ser alterados.' using errcode='42501';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'A OS está cancelada e seus itens comerciais não podem ser alterados.' using errcode='42501';
  end if;

  if tg_op='INSERT' and new.quote_proposal_id is not null then
    if new.quote_line_index is null then raise exception 'Índice da linha do orçamento obrigatório'; end if;
    select q.items -> new.quote_line_index into v_quote_item
    from public.service_order_quote_proposals q
    where q.id=new.quote_proposal_id and q.service_order_id=new.service_order_id
      and q.organization_id=v_order.organization_id and q.status='approved';
    if v_quote_item is null or jsonb_typeof(v_quote_item)<>'object'
      or coalesce(v_quote_item->>'item_type','') <> lower(coalesce(new.item_type,''))
      or coalesce(v_quote_item->>'general_service_id','') <> coalesce(new.general_service_id::text,'')
      or coalesce(v_quote_item->>'inventory_item_id','') <> coalesce(new.inventory_item_id::text,'')
    then raise exception 'Item não pertence à proposta aprovada'; end if;
    new.quantity:=(v_quote_item->>'quantity')::integer;
    new.additional_cost:=(v_quote_item->>'additional_cost')::numeric;
    new.unit_price:=(v_quote_item->>'unit_price')::numeric;
    new.description_snapshot:=coalesce(v_quote_item->>'description_snapshot','');
  end if;

  new.organization_id:=v_order.organization_id;
  new.item_type:=lower(coalesce(nullif(btrim(new.item_type),''),'service'));
  new.quantity:=greatest(1,coalesce(new.quantity,1));
  new.additional_cost:=round(greatest(0,coalesce(new.additional_cost,0)),2);

  if new.item_type='service' then
    if new.general_service_id is null then
      raise exception 'Selecione o serviço do catálogo.' using errcode='23514';
    end if;

    select * into v_service
    from public.general_services
    where id=new.general_service_id
      and organization_id=v_order.organization_id;

    if not found then
      raise exception 'Serviço inválido para esta empresa.' using errcode='23503';
    end if;

    new.inventory_item_id:=null;
    new.unit_snapshot:='serviço';

    if tg_op='INSERT' or nullif(btrim(new.title_snapshot),'') is null then
      new.title_snapshot:=v_service.name;
    end if;

    -- Em atualização do mesmo serviço, mantém o snapshot de preço da inclusão.
    if tg_op='INSERT' and new.quote_proposal_id is not null then
      new.unit_price:=round((v_quote_item->>'unit_price')::numeric,2);
    elsif tg_op='UPDATE'
       and old.item_type='service'
       and old.general_service_id=new.general_service_id then
      new.unit_price:=old.unit_price;
    else
      new.unit_price:=round(coalesce(v_service.price,0),2);
    end if;

  elsif new.item_type='product' then
    if new.inventory_item_id is null then
      raise exception 'Selecione o produto do estoque.' using errcode='23514';
    end if;

    select * into v_inventory
    from public.inventory_items
    where id=new.inventory_item_id
      and organization_id=v_order.organization_id;

    if not found then
      raise exception 'Produto inválido para esta empresa.' using errcode='23503';
    end if;

    new.general_service_id:=null;
    new.unit_snapshot:=coalesce(nullif(btrim(v_inventory.unit),''),'un');

    if tg_op='INSERT' or nullif(btrim(new.title_snapshot),'') is null then
      new.title_snapshot:=v_inventory.name;
    end if;
    if tg_op='INSERT' and new.description_snapshot is null then
      new.description_snapshot:=v_inventory.description;
    end if;

    v_display_price:=case
      when lower(coalesce(v_inventory.unit,'un'))='cx'
        then coalesce(v_inventory.sale_price,0)*greatest(1,coalesce(v_inventory.conversion_factor,1))
      else coalesce(v_inventory.sale_price,0)
    end;

    if new.unit_price is null then
      new.unit_price:=v_display_price;
    end if;

  elsif new.item_type='custom_service' then
    new.general_service_id:=null;
    new.inventory_item_id:=null;
    new.unit_snapshot:='serviço';

    if nullif(btrim(new.title_snapshot),'') is null then
      raise exception 'Informe o nome do Serviço Avulso.' using errcode='23514';
    end if;

    new.title_snapshot:=btrim(new.title_snapshot);
    new.unit_price:=coalesce(new.unit_price,0);
  else
    raise exception 'Tipo de item comercial inválido.' using errcode='23514';
  end if;

  if new.unit_price is null or new.unit_price<0 then
    raise exception 'O preço unitário deve ser maior ou igual a zero.' using errcode='23514';
  end if;

  new.subtotal:=round(new.quantity*new.unit_price+new.additional_cost,2);
  new.updated_at:=now();
  return new;
end;
$function$
;
commit;