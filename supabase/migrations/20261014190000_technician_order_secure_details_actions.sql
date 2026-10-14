-- Painel técnico: visualização da OS real por atribuição de serviço, sem SELECT
-- indiscriminado na service_orders e sem abrir preços ou dados de outras OS.
begin;

insert into public.permissions(key,label,description,module_name,sort_order) values
('technician_panel.data.situation','Ver situação da OS','Exibe a situação atual da OS vinculada aos seus serviços.','Painel do Técnico',4673),
('technician_panel.data.order_items','Ver itens da OS','Exibe títulos, tipos e quantidades de produtos e serviços, sem preços ou custos.','Painel do Técnico',4674),
('technician_panel.data.internal_notes','Ver observações internas','Exibe observações internas da OS atribuída.','Painel do Técnico',4675),
('technician_panel.actions.change_situation','Alterar situação da OS','Permite alterar a situação apenas de OS com serviços atribuídos ao funcionário.','Painel do Técnico',4701),
('technician_panel.actions.edit_diagnosis','Editar diagnóstico da OS','Permite atualizar o diagnóstico apenas de OS com serviços atribuídos.','Painel do Técnico',4702)
on conflict(key) do update set
  label=excluded.label,description=excluded.description,
  module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Somente opções básicas de visualização são ativadas para Técnicos.
-- Gestores podem configurar as novas ações nas funções e permissões.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.organizations o on o.id=r.organization_id and o.status='active'
join public.organization_modules m on m.organization_id=r.organization_id and m.module_key='orders' and m.is_enabled
join public.permissions p on p.key in (
  'technician_panel.data.situation','technician_panel.data.order_items',
  'technician_panel.data.internal_notes',
  'technician_panel.actions.change_situation','technician_panel.actions.edit_diagnosis'
)
where r.is_active
  and (
    lower(btrim(r.name))='gestor'
    or (
      lower(btrim(r.name))='técnico'
      and p.key in ('technician_panel.data.situation','technician_panel.data.order_items')
    )
  )
  and private.permission_belongs_to_organization(r.organization_id,p.key)
on conflict(role_id,permission_id) do nothing;

-- Autorização centralizada por vínculo REAL em serviço da OS. Atribuição a
-- outro serviço/empresa, ou usuário desativado, não confere acesso.
create or replace function private.can_access_technician_order_v1(
  p_order_id uuid,
  p_permission_key text default 'technician_panel.view'
)
returns boolean
language sql stable security definer set search_path=''
as $$
  select p_permission_key like 'technician_panel.%'
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.service_orders ord
      join public.service_order_item_tasks task
        on task.service_order_id=ord.id and task.organization_id=ord.organization_id
      join public.service_order_item_task_assignees assignee
        on assignee.item_id=task.item_id and assignee.organization_id=task.organization_id
      join public.employees employee
        on employee.id=assignee.employee_id and employee.organization_id=ord.organization_id
      join public.service_order_items item
        on item.id=task.item_id and item.organization_id=ord.organization_id
        and item.service_order_id=ord.id and item.item_type in ('service','custom_service')
      where ord.id=p_order_id
        and employee.profile_id=(select auth.uid())
        and employee.is_active
        and private.is_organization_member(ord.organization_id)
        and private.is_organization_module_enabled(ord.organization_id,'orders')
        and private.has_effective_organization_permission(ord.organization_id,'technician_panel.view')
        and private.has_effective_organization_permission(ord.organization_id,p_permission_key)
    );
$$;
revoke all on function private.can_access_technician_order_v1(uuid,text) from public,anon;
grant execute on function private.can_access_technician_order_v1(uuid,text) to authenticated;

create or replace function public.get_my_technician_order_details_v1(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.view') then
    raise exception 'Esta OS não está atribuída a você ou o acesso foi revogado.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id',ord.id,
    'os_number',ord.os_number,
    'can_change_situation',private.can_access_technician_order_v1(ord.id,'technician_panel.actions.change_situation'),
    'can_edit_diagnosis',(
      private.can_access_technician_order_v1(ord.id,'technician_panel.actions.edit_diagnosis')
      and private.can_access_technician_order_v1(ord.id,'technician_panel.data.diagnosis')
    ),
    'closed',ord.completed_at is not null or ord.cancelled_at is not null,
    'solved',coalesce(ord.is_solved,false),
    'situation_id',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then ord.situation_id else null end,
    'situation_name',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then situation.name else null end,
    'available_situations',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.actions.change_situation')
        and private.can_access_technician_order_v1(ord.id,'technician_panel.data.situation')
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.sort_order,s.name)
        from public.os_situations s
        where s.organization_id=ord.organization_id and s.is_active
          and (ord.service_type_id is null or exists(
            select 1 from public.service_type_situations sts
            where sts.organization_id=ord.organization_id
              and sts.service_type_id=ord.service_type_id and sts.situation_id=s.id
          ))
      ),'[]'::jsonb) else '[]'::jsonb end,
    'diagnosis',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.diagnosis')
      then ord.diagnosis else null end,
    'internal_notes',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.internal_notes')
      then ord.internal_notes else null end,
    'items',case
      when private.can_access_technician_order_v1(ord.id,'technician_panel.data.order_items')
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',item.id,'type',item.item_type,'title',item.title_snapshot,
          'description',item.description_snapshot,'quantity',item.quantity
        ) order by item.created_at,item.id)
        from public.service_order_items item
        where item.service_order_id=ord.id and item.organization_id=ord.organization_id
      ),'[]'::jsonb) else '[]'::jsonb end
  ) into v_result
  from public.service_orders ord
  left join public.os_situations situation
    on situation.id=ord.situation_id and situation.organization_id=ord.organization_id
  where ord.id=p_order_id;

  return v_result;
end;
$$;

-- Mantemos os gatilhos comerciais, checklists, SLA, auditoria e situação.
-- Apenas duas operações limitadas à OS atribuída passam a ser admitidas,
-- sempre com os demais bloqueios de UPDATE da service_orders preservados.
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

  if new.completed_at is distinct from old.completed_at
     or new.completed_by is distinct from old.completed_by
     or new.service_price is distinct from old.service_price
     or new.parts_total is distinct from old.parts_total
     or new.discount_percentage is distinct from old.discount_percentage
     or new.discount_amount is distinct from old.discount_amount
     or new.final_total is distinct from old.final_total then
    perform private.require_service_order_action(
      old.id,'orders.complete',
      'Você não possui permissão para concluir financeiramente esta OS nesta empresa.');
  end if;

  return new;
end;
$$;

create or replace function public.change_my_technician_order_situation_v1(
  p_order_id uuid,p_situation_id uuid
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_name text;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.actions.change_situation')
     or not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.situation') then
    raise exception 'Sem permissão para alterar a situação desta OS atribuída.' using errcode='42501';
  end if;
  select * into v_order from public.service_orders where id=p_order_id for update;
  if not found or v_order.completed_at is not null or v_order.cancelled_at is not null then
    raise exception 'Esta OS não permite alterações de situação.' using errcode='22023';
  end if;
  select name into v_name from public.os_situations
    where id=p_situation_id and organization_id=v_order.organization_id and is_active
      and (v_order.service_type_id is null or exists(
        select 1 from public.service_type_situations sts
        where sts.organization_id=v_order.organization_id
          and sts.service_type_id=v_order.service_type_id and sts.situation_id=p_situation_id
      ));
  if v_name is null then
    raise exception 'Situação indisponível para este tipo de atendimento.' using errcode='22023';
  end if;
  if v_order.situation_id is distinct from p_situation_id then
    update public.service_orders set situation_id=p_situation_id where id=v_order.id;
  end if;
  return jsonb_build_object('situation_id',p_situation_id,'situation_name',v_name);
end;
$$;

create or replace function public.update_my_technician_order_diagnosis_v1(
  p_order_id uuid,p_diagnosis text
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
begin
  if not private.can_access_technician_order_v1(p_order_id,'technician_panel.actions.edit_diagnosis')
     or not private.can_access_technician_order_v1(p_order_id,'technician_panel.data.diagnosis') then
    raise exception 'Sem permissão para alterar o diagnóstico desta OS atribuída.' using errcode='42501';
  end if;
  if char_length(coalesce(p_diagnosis,''))>10000 then
    raise exception 'Diagnóstico deve ter até 10.000 caracteres.' using errcode='22023';
  end if;
  select * into v_order from public.service_orders where id=p_order_id for update;
  if not found or v_order.completed_at is not null or v_order.cancelled_at is not null
     or v_order.is_solved or v_order.cannot_be_solved then
    raise exception 'Esta OS não permite editar o diagnóstico.' using errcode='22023';
  end if;
  update public.service_orders
  set diagnosis=nullif(btrim(coalesce(p_diagnosis,'')),'')
  where id=v_order.id;
  return jsonb_build_object('diagnosis',nullif(btrim(coalesce(p_diagnosis,'')),''));
end;
$$;

revoke all on function public.get_my_technician_order_details_v1(uuid) from public,anon,authenticated;
revoke all on function public.change_my_technician_order_situation_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_my_technician_order_diagnosis_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.get_my_technician_order_details_v1(uuid) to authenticated;
grant execute on function public.change_my_technician_order_situation_v1(uuid,uuid) to authenticated;
grant execute on function public.update_my_technician_order_diagnosis_v1(uuid,text) to authenticated;

commit;
