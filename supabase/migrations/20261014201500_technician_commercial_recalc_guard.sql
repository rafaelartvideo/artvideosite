-- Ajuste estrito: a seleção de itens pelo técnico precisa recalcular
-- totais comerciais, mas não deve exigir orders.complete ou liberar edição
-- manual de dinheiro. Mantém intactos todos os demais guardas e fluxos.
begin;

create or replace function private.guard_service_order_sensitive_update()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null then return new; end if;

  if new.situation_id is distinct from old.situation_id
     and not private.can_access_technician_order_v1(old.id,'technician_panel.actions.change_situation') then
    perform private.require_service_order_action(
      old.id,'orders.situation.change',
      'Você não possui permissão para alterar a situação desta OS nesta empresa.');
  end if;

  if new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancellation_reason is distinct from old.cancellation_reason then
    perform private.require_service_order_action(
      old.id,'orders.cancel','Você não possui permissão para cancelar esta OS nesta empresa.');
  end if;

  if new.is_solved is distinct from old.is_solved
     or new.solved_at is distinct from old.solved_at
     or new.solution is distinct from old.solution
     or new.cannot_be_solved is distinct from old.cannot_be_solved
     or new.cannot_be_solved_reason is distinct from old.cannot_be_solved_reason then
    perform private.require_service_order_action(
      old.id,'orders.solve',
      'Você não possui permissão para solucionar ou alterar a solução desta OS nesta empresa.');
  end if;

  if new.diagnosis is distinct from old.diagnosis
     and not (
       private.can_access_technician_order_v1(old.id,'technician_panel.actions.edit_diagnosis')
       and private.can_access_technician_order_v1(old.id,'technician_panel.data.diagnosis')
     ) then
    perform private.require_service_order_action(
      old.id,'orders.solve','Você não possui permissão para editar o diagnóstico desta OS.');
  end if;

  -- Concluir OS e trocar responsável continuam exigindo orders.complete.
  if new.completed_at is distinct from old.completed_at
     or new.completed_by is distinct from old.completed_by then
    perform private.require_service_order_action(
      old.id,'orders.complete',
      'Você não possui permissão para concluir financeiramente esta OS nesta empresa.');
  end if;

  -- O recálculo disparado por inclusão/remoção técnica é uma operação
  -- interna, NÃO uma permissão para alterar preços ou concluir a OS.
  if new.service_price is distinct from old.service_price
     or new.parts_total is distinct from old.parts_total
     or new.subtotal is distinct from old.subtotal
     or new.discount_type is distinct from old.discount_type
     or new.discount_percentage is distinct from old.discount_percentage
     or new.discount_amount is distinct from old.discount_amount
     or new.final_total is distinct from old.final_total
     or new.commercial_pricing_enabled is distinct from old.commercial_pricing_enabled then
    if not (
      current_setting('app.technician_order_commercial_write',true)='true'
      and current_setting('app.update_order_commercial_totals',true)='true'
      and (
        private.can_access_technician_order_v1(old.id,'technician_panel.actions.add_service')
        or private.can_access_technician_order_v1(old.id,'technician_panel.actions.add_product')
        or private.can_access_technician_order_v1(old.id,'technician_panel.actions.remove_product')
      )
      and (
        to_jsonb(new)
         -'service_price'-'parts_total'-'subtotal'-'discount_type'
         -'discount_percentage'-'discount_amount'-'final_total'
         -'commercial_pricing_enabled'-'updated_at'
      ) is not distinct from (
        to_jsonb(old)
         -'service_price'-'parts_total'-'subtotal'-'discount_type'
         -'discount_percentage'-'discount_amount'-'final_total'
         -'commercial_pricing_enabled'-'updated_at'
      )
    ) then
      perform private.require_service_order_action(
        old.id,'orders.complete',
        'Você não possui permissão para alterar os valores desta OS nesta empresa.');
    end if;
  end if;

  return new;
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
  if p_item_type not in ('service','product') or p_catalog_id is null
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

create or replace function public.remove_my_technician_order_product_v1(p_order_id uuid,p_item_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_item public.service_order_items%rowtype;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.actions.remove_product')
     or not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.order_items') then
    raise exception 'Você não pode remover produtos desta OS.' using errcode='42501';
  end if;
  select * into v_order from public.service_orders where id=p_order_id for update;
  if not found or v_order.completed_at is not null or v_order.cancelled_at is not null
    or v_order.is_solved or v_order.cannot_be_solved then
    raise exception 'A OS não permite remover itens.' using errcode='22023';
  end if;
  select * into v_item from public.service_order_items
    where id=p_item_id and service_order_id=p_order_id and organization_id=v_order.organization_id
      and item_type='product' for update;
  if not found then
    raise exception 'Produto não encontrado nesta OS.' using errcode='22023';
  end if;
  perform set_config('app.technician_order_commercial_write','true',true);
  delete from public.service_order_items where id=v_item.id;
  perform set_config('app.technician_order_commercial_write','false',true);
end;
$$;

commit;
