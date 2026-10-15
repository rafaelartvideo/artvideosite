-- Expediente próprio na Agenda, mantendo edição administrativa e isolamento por funcionário.
-- Acrescenta estado real da OS à RPC restrita do Painel do Técnico (sem valores financeiros).
begin;

drop policy if exists employee_schedule_self_insert on public.employee_work_schedules;
create policy employee_schedule_self_insert on public.employee_work_schedules
for insert to authenticated
with check (
  (select auth.uid()) is not null
  and private.has_effective_organization_permission(organization_id, 'agenda.view')
  and exists (
    select 1 from public.employees e
    where e.id = employee_work_schedules.employee_id
      and e.organization_id = employee_work_schedules.organization_id
      and e.profile_id = (select auth.uid())
      and e.is_active
  )
);

drop policy if exists employee_schedule_self_update on public.employee_work_schedules;
create policy employee_schedule_self_update on public.employee_work_schedules
for update to authenticated
using (
  (select auth.uid()) is not null
  and private.has_effective_organization_permission(organization_id, 'agenda.view')
  and exists (
    select 1 from public.employees e
    where e.id = employee_work_schedules.employee_id
      and e.organization_id = employee_work_schedules.organization_id
      and e.profile_id = (select auth.uid())
      and e.is_active
  )
)
with check (
  (select auth.uid()) is not null
  and private.has_effective_organization_permission(organization_id, 'agenda.view')
  and exists (
    select 1 from public.employees e
    where e.id = employee_work_schedules.employee_id
      and e.organization_id = employee_work_schedules.organization_id
      and e.profile_id = (select auth.uid())
      and e.is_active
  )
);

create or replace function public.list_my_technician_tasks_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user is null or not private.has_effective_organization_permission(p_organization_id,'technician_panel.view')
    or not exists(select 1 from public.organization_modules module
      where module.organization_id=p_organization_id and module.module_key='orders' and module.is_enabled)
    then raise exception 'Acesso negado ao Painel do Técnico.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', task.item_id,
      'service_order_id', task.service_order_id,
      'os_number', ord.os_number,
      'title', item.title_snapshot,
      'description', item.description_snapshot,
      'status', task.status,
      'started_at', task.started_at,
      'completed_at', task.completed_at,
      'execution_report', task.execution_report,
      'customer_name',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.customer')
         then customer.full_name else null end,
      'customer_contact',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.contact')
         then coalesce(nullif(customer.whatsapp,''),customer.phone) else null end,
      'equipment',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.equipment')
         then equipment.name else null end,
      'diagnosis',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.diagnosis')
         then ord.diagnosis else null end,
      'problem',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.problem')
         then ord.customer_notes else null end,
      'service_address',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.address')
        then jsonb_build_object(
          'street',coalesce(nullif(ord.service_street,''),customer_address.street),
          'number',coalesce(nullif(ord.service_number,''),customer_address.number),
          'complement',coalesce(nullif(ord.service_complement,''),customer_address.complement),
          'neighborhood',coalesce(nullif(ord.service_neighborhood,''),customer_address.neighborhood),
          'city',coalesce(nullif(ord.service_city,''),customer_address.city),
          'state',coalesce(nullif(ord.service_state,''),customer_address.state),
          'zip_code',coalesce(nullif(ord.service_zip_code,''),customer_address.zip_code)
        ) else null end,
      'equipment_model',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.equipment')
        then ord.model else null end,
      'serial_number',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.equipment')
        then ord.serial_number else null end,
      'scheduled_at',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.schedule')
         then ord.scheduled_at else null end,
      'order_completed_at',ord.completed_at,
      'order_cancelled_at',ord.cancelled_at,
      'start_location',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location')
         then jsonb_build_object('lat',task.started_lat,'lng',task.started_lng,'accuracy_m',task.started_accuracy_m,'captured_at',task.started_location_at) else null end,
      'finish_location',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location')
         then jsonb_build_object('lat',task.completed_lat,'lng',task.completed_lng,'accuracy_m',task.completed_accuracy_m,'captured_at',task.completed_location_at) else null end
    ) order by case task.status when 'in_progress' then 0 when 'pending' then 1 when 'completed' then 2 else 3 end,
       ord.os_number desc, task.updated_at desc
  ),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task

  join public.service_order_items item
    on item.id=task.item_id and item.service_order_id=task.service_order_id
       and item.organization_id=task.organization_id and item.item_type in ('service','custom_service')
  join public.service_orders ord
    on ord.id=task.service_order_id and ord.organization_id=task.organization_id
  left join public.customers customer
    on customer.id=ord.customer_id and customer.organization_id=p_organization_id
  left join public.equipment_types equipment
    on equipment.id=ord.equipment_type_id and equipment.organization_id=p_organization_id
  left join lateral (
    select ca.street,ca.number,ca.complement,ca.neighborhood,ca.city,ca.state,ca.zip_code
    from public.customer_addresses ca
    where ca.customer_id=ord.customer_id and ca.organization_id=p_organization_id
    order by (ca.id=ord.service_customer_address_id) desc,ca.is_default desc,ca.created_at desc
    limit 1
  ) customer_address on true
  where task.organization_id=p_organization_id
    and exists (
      select 1
      from public.service_order_item_task_assignees link
      join public.employees employee
        on employee.id=link.employee_id and employee.organization_id=task.organization_id
      where link.item_id=task.item_id and link.organization_id=task.organization_id
        and employee.profile_id=v_user and employee.is_active
    );
  return v_result;
end;
$$;

revoke all on function public.list_my_technician_tasks_v1(uuid) from public, anon;
grant execute on function public.list_my_technician_tasks_v1(uuid) to authenticated;

commit;
