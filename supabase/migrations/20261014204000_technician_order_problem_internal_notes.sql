-- Edição de textos da OS atribuída, sem orders.edit ou dados de outra OS.
begin;

insert into public.permissions(key,label,description,module_name,sort_order) values
('technician_panel.actions.edit_problem','Editar descrição do problema','Permite editar somente a descrição do problema da OS atribuída.','Painel do Técnico',4706),
('technician_panel.actions.edit_internal_notes','Editar observações internas','Permite editar somente as observações internas da OS atribuída.','Painel do Técnico',4707)
on conflict(key) do update set
  label=excluded.label,description=excluded.description,
  module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Gestores têm as novas capacidades para gestão; Técnico somente por checkbox.
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id
from public.roles role
join public.organizations org on org.id=role.organization_id and org.status='active'
join public.organization_modules module
  on module.organization_id=role.organization_id and module.module_key='orders' and module.is_enabled
join public.permissions permission
  on permission.key in ('technician_panel.actions.edit_problem','technician_panel.actions.edit_internal_notes')
where role.is_active and lower(btrim(role.name))='gestor'
  and private.permission_belongs_to_organization(role.organization_id,permission.key)
on conflict(role_id,permission_id) do nothing;

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
  if p_field not in ('problem','internal_notes') then
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

revoke all on function public.update_my_technician_order_note_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_my_technician_order_note_v1(uuid,text,text) to authenticated;

commit;
