-- Próxima etapa: catalogar e adicionar itens pela OS técnica, sem conceder orders.edit.
-- A leitura e escrita só usam a OS a que o funcionário está realmente vinculado.
begin;

insert into public.permissions (key,label,description,module_name,sort_order) values
('technician_panel.data.history','Ver histórico da OS','Lê a evolução da situação e das próprias execuções sem notas financeiras.','Painel do Técnico',4676),
('technician_panel.actions.add_service','Adicionar serviços à OS','Inclui serviço do catálogo na OS atribuída e vincula o próprio técnico.','Painel do Técnico',4703),
('technician_panel.actions.add_product','Adicionar produtos à OS','Inclui produto do estoque na OS atribuída sem revelar preço ou alterar custo manualmente.','Painel do Técnico',4704),
('technician_panel.actions.remove_product','Remover produtos da OS','Remove produto da OS atribuída respeitando os bloqueios de OS concluída e solucionada.','Painel do Técnico',4705)
on conflict (key) do update set
  label=excluded.label,description=excluded.description,
  module_name=excluded.module_name,sort_order=excluded.sort_order;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.organizations o on o.id=r.organization_id and o.status='active'
join public.organization_modules m on m.organization_id=r.organization_id
  and m.module_key='orders' and m.is_enabled
join public.permissions p on p.key in (
 'technician_panel.data.history',
 'technician_panel.actions.add_service',
 'technician_panel.actions.add_product',
 'technician_panel.actions.remove_product'
)
where r.is_active
  and (
    lower(btrim(r.name))='gestor'
    or (lower(btrim(r.name))='técnico' and p.key='technician_panel.data.history')
  )
  and private.permission_belongs_to_organization(r.organization_id,p.key)
on conflict (role_id,permission_id) do nothing;

-- Pesquisa exclusiva ao catálogo da empresa vinculada à OS, sem preço,
-- custo, desconto, margem, dados de clientes nem estoque das demais empresas.
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
  if p_item_type not in ('service','product') then
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

-- Usa os mesmos gatilhos comerciais e a mesma tabela da OS convencional.
-- Produtos selecionados são reservados apenas no item comercial; baixa no
-- estoque segue o fluxo de resolução já existente, nunca neste RPC.
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
  delete from public.service_order_items where id=v_item.id;
end;
$$;

-- O histórico técnico omite conteúdo comercial, documentos, alterações
-- cadastrais sensíveis e notas de outros usuários. Consulta só a OS atribuída.
create or replace function public.get_my_technician_order_history_v1(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.history') then
    raise exception 'Sem permissão para visualizar o histórico desta OS.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',entry.kind,'description',entry.description,'at',entry.created_at
  ) order by entry.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select 'situation'::text kind,
      'Situação: '||coalesce(visit.situation_name_snapshot,'Não definida') description,
      visit.entered_at created_at
    from public.service_order_situation_visits visit
    where visit.service_order_id=p_order_id
      and visit.organization_id=(select organization_id from public.service_orders where id=p_order_id)
    union all
    select 'execution'::text,
      'Serviço: '||coalesce(task.status,'Pendente'),
      task.updated_at
    from public.service_order_item_tasks task
    join public.service_order_item_task_assignees assignee
      on assignee.item_id=task.item_id and assignee.organization_id=task.organization_id
    join public.employees employee on employee.id=assignee.employee_id
      and employee.organization_id=task.organization_id
    where task.service_order_id=p_order_id
      and employee.profile_id=(select auth.uid()) and employee.is_active
  ) entry;
  return v_result;
end;
$$;

revoke all on function public.search_my_technician_order_catalog_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.add_my_technician_order_item_v1(uuid,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.remove_my_technician_order_product_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_my_technician_order_history_v1(uuid) from public,anon,authenticated;
grant execute on function public.search_my_technician_order_catalog_v1(uuid,text,text) to authenticated;
grant execute on function public.add_my_technician_order_item_v1(uuid,text,uuid,integer) to authenticated;
grant execute on function public.remove_my_technician_order_product_v1(uuid,uuid) to authenticated;
grant execute on function public.get_my_technician_order_history_v1(uuid) to authenticated;
commit;
