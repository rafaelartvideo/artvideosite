-- Corrige casos NULL nas chaves de operação para evitar fallback implícito
-- para product/internal_notes. Mantém o mesmo escopo/autorizações de origem.
begin;

create or replace function public.search_my_technician_order_catalog_v1(
  p_order_id uuid,p_item_type text,p_search text default ''
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_search text := lower(btrim(coalesce(p_search,'')));
  v_result jsonb;
  v_perm text;
begin
  if p_item_type is null or p_item_type not in ('service','product') then
    raise exception 'Tipo de item inválido.' using errcode='22023';
  end if;
  v_perm := case when p_item_type='service'
    then 'technician_panel.actions.add_service'
    else 'technician_panel.actions.add_product' end;
  if not private.can_access_technician_order_v1(p_order_id,v_perm)
     or not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.order_items') then
    raise exception 'Sem acesso ao catálogo desta OS.' using errcode='42501';
  end if;
  select * into v_order from public.service_orders where id=p_order_id;
  if not found or v_order.completed_at is not null or v_order.cancelled_at is not null
    or v_order.is_solved or v_order.cannot_be_solved then
    raise exception 'A OS não permite adicionar itens.' using errcode='22023';
  end if;
  if char_length(v_search)>100 then
    raise exception 'Busca muito longa.' using errcode='22023';
  end if;
  if p_item_type='service' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'name',x.name,'type','service'
    ) order by x.sort_order,x.name),'[]'::jsonb)
    into v_result
    from (
      select s.id,s.name,s.sort_order
      from public.general_services s
      where s.organization_id=v_order.organization_id and s.is_active and s.price is not null
        and lower(btrim(s.name))<>lower('Serviço avulso')
        and (v_search='' or lower(s.name) like '%'||v_search||'%')
        and (v_order.equipment_type_id is null or exists(
          select 1 from public.equipment_type_general_services link
          where link.organization_id=v_order.organization_id
            and link.equipment_type_id=v_order.equipment_type_id and link.general_service_id=s.id
        ))
        and not exists(
          select 1 from public.service_order_items item
          where item.service_order_id=v_order.id and item.item_type='service' and item.general_service_id=s.id
        )
      order by s.sort_order,s.name limit 25
    ) x;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'name',x.name,'type','product'
    ) order by x.name),'[]'::jsonb)
    into v_result
    from (
      select inventory.id,inventory.name
      from public.inventory_items inventory
      where inventory.organization_id=v_order.organization_id and inventory.is_active
        and coalesce(inventory.quantity,0)>0
        and (v_search='' or lower(inventory.name) like '%'||v_search||'%'
          or lower(coalesce(inventory.sku,'')) like '%'||v_search||'%')
      order by inventory.name limit 25
    ) x;
  end if;
  return v_result;
end;
$$;

create or replace function public.add_my_technician_order_item_v1(
  p_order_id uuid,p_item_type text,p_catalog_id uuid,p_quantity integer default 1
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_employee uuid;
  v_item uuid;
  v_factor numeric;
  v_perm text;
begin
  if p_item_type is null or p_item_type not in ('service','product') or p_catalog_id is null
     or p_quantity is null or p_quantity<1 or p_quantity>99 then
    raise exception 'Informe um produto ou serviço e uma quantidade válida (1 a 99).' using errcode='22023';
  end if;
  v_perm := case when p_item_type='service'
    then 'technician_panel.actions.add_service'
    else 'technician_panel.actions.add_product' end;
  if not private.can_access_technician_order_v1(p_order_id,v_perm)
     or not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.order_items') then
    raise exception 'Você não pode adicionar este item à OS.' using errcode='42501';
  end if;
  select * into v_order from public.service_orders where id=p_order_id for update;
  if not found or v_order.completed_at is not null or v_order.cancelled_at is not null
    or v_order.is_solved or v_order.cannot_be_solved then
    raise exception 'Esta OS não permite adicionar itens.' using errcode='22023';
  end if;
  perform set_config('app.technician_order_commercial_write','true',true);
  if p_item_type='service' then
    select * into v_service from public.general_services
      where id=p_catalog_id and organization_id=v_order.organization_id
        and is_active and price is not null;
    if not found or lower(btrim(v_service.name))=lower('Serviço avulso') then
      raise exception 'Serviço inválido ou inativo.' using errcode='22023';
    end if;
    if v_order.equipment_type_id is not null and not exists (
      select 1 from public.equipment_type_general_services link
      where link.organization_id=v_order.organization_id
        and link.equipment_type_id=v_order.equipment_type_id
        and link.general_service_id=p_catalog_id
    ) then
      raise exception 'Serviço não vinculado ao equipamento da OS.' using errcode='22023';
    end if;
    if exists(select 1 from public.service_order_items
      where service_order_id=v_order.id and item_type='service' and general_service_id=p_catalog_id) then
      raise exception 'Este serviço já existe na OS. Solicite sua atribuição ao gestor.' using errcode='22023';
    end if;
    select employee.id into v_employee
    from public.employees employee
    where employee.organization_id=v_order.organization_id
      and employee.profile_id=(select auth.uid()) and employee.is_active
    limit 1;
    if v_employee is null then
      raise exception 'Funcionário técnico não encontrado nesta empresa.' using errcode='42501';
    end if;
    insert into public.service_order_items(
      service_order_id,organization_id,item_type,general_service_id,
      title_snapshot,quantity,unit_price,unit_snapshot,additional_cost
    ) values (
      v_order.id,v_order.organization_id,'service',v_service.id,
      v_service.name,p_quantity,round(v_service.price,2),'serviço',0
    ) returning id into v_item;

    insert into public.service_order_item_tasks(
      item_id,service_order_id,organization_id,assigned_employee_id,status,updated_by
    ) values(v_item,v_order.id,v_order.organization_id,v_employee,'pending',(select auth.uid()));

    insert into public.service_order_item_task_assignees(
      item_id,employee_id,organization_id,assigned_by
    ) values(v_item,v_employee,v_order.organization_id,(select auth.uid()));

    insert into public.service_order_item_task_events(
      item_id,service_order_id,organization_id,actor_id,
      from_status,to_status,from_employee_id,to_employee_id
    ) values(v_item,v_order.id,v_order.organization_id,(select auth.uid()),'pending','pending',null,v_employee);
  else
    select * into v_inventory from public.inventory_items
      where id=p_catalog_id and organization_id=v_order.organization_id and is_active for update;
    if not found then
      raise exception 'Produto inválido ou inativo.' using errcode='22023';
    end if;
    v_factor := case when lower(coalesce(v_inventory.unit,'un'))='cx'
      then greatest(1,coalesce(v_inventory.conversion_factor,1)) else 1 end;
    if coalesce(v_inventory.quantity,0)<p_quantity*v_factor then
      raise exception 'Estoque insuficiente para a quantidade solicitada.' using errcode='22023';
    end if;
    if exists(select 1 from public.service_order_items item
      where item.service_order_id=v_order.id and item.item_type='product'
        and item.inventory_item_id=p_catalog_id) then
      raise exception 'Este produto já está na OS. A edição de quantidades exige permissão separada.' using errcode='22023';
    end if;
    insert into public.service_order_items(
      service_order_id,organization_id,item_type,inventory_item_id,
      title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost
    ) values (
      v_order.id,v_order.organization_id,'product',v_inventory.id,
      v_inventory.name,v_inventory.description,p_quantity,
      coalesce(v_inventory.sale_price,0)*v_factor,
      coalesce(nullif(btrim(v_inventory.unit),''),'un'),0
    ) returning id into v_item;
  end if;
  perform set_config('app.technician_order_commercial_write','false',true);
  return jsonb_build_object('item_id',v_item,'type',p_item_type);
end;
$$;

create or replace function public.update_my_technician_order_note_v1(
  p_order_id uuid,
  p_field text,
  p_value text
)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_permission text;
  v_view_permission text;
  v_value text;
begin
  if p_field is null or p_field not in ('problem','internal_notes') then
    raise exception 'Campo não editável neste painel.' using errcode='22023';
  end if;

  v_permission := case p_field when 'problem' then 'technician_panel.actions.edit_problem'
    else 'technician_panel.actions.edit_internal_notes' end;
  v_view_permission := case p_field when 'problem' then 'technician_panel.data.problem'
    else 'technician_panel.data.internal_notes' end;

  if not private.can_access_technician_order_v1(p_order_id,v_permission)
     or not private.can_access_technician_order_v1(p_order_id,v_view_permission) then
    raise exception 'Sem permissão para editar este campo da OS.' using errcode='42501';
  end if;

  if char_length(coalesce(p_value,'')) > 10000 then
    raise exception 'O texto deve ter no máximo 10.000 caracteres.' using errcode='22023';
  end if;
  v_value := nullif(btrim(coalesce(p_value,'')),'');

  select * into v_order from public.service_orders where id=p_order_id for update;
  if not found or v_order.completed_at is not null or v_order.cancelled_at is not null
     or v_order.is_solved or v_order.cannot_be_solved then
    raise exception 'Esta OS está encerrada ou não permite edição.' using errcode='22023';
  end if;

  if p_field='problem' then
    update public.service_orders set customer_notes=v_value where id=v_order.id;
  else
    update public.service_orders set internal_notes=v_value where id=v_order.id;
  end if;
end;
$$;

commit;
