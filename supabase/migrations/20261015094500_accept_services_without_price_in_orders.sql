-- Permite incluir serviços gerais sem preço na aba Produtos e Serviços da OS.
-- Inclui com valor inicial zero os serviços com price=NULL; serviços de preço
-- fixo continuam usando o valor cadastrado e preservando seu snapshot.
-- Não altera permissões, vínculos de equipamentos ou cobranças existentes.
begin;

create or replace function private.prepare_service_order_commercial_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_display_price numeric;
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
    if tg_op='UPDATE'
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
$$;

create or replace function public.add_service_order_catalog_item_v1(
  p_service_order_id uuid,
  p_item_type text,
  p_catalog_id uuid,
  p_quantity integer default 1,
  p_unit_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
        title_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal
      ) values (
        p_service_order_id,v_order.organization_id,'service',v_service.id,
        v_service.name,p_quantity,v_price,'serviço',0,round(p_quantity*v_price,2)
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
$$;

revoke all on function private.prepare_service_order_commercial_item() from public, anon, authenticated;
revoke all on function public.add_service_order_catalog_item_v1(uuid,text,uuid,integer,numeric) from public, anon;
grant execute on function public.add_service_order_catalog_item_v1(uuid,text,uuid,integer,numeric) to authenticated;

commit;
