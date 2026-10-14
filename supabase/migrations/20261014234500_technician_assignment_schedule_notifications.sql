
-- Notificações destinadas a funcionários e auditoria dos agendamentos individuais.
alter table public.organization_notifications
  add column if not exists recipient_user_id uuid references public.profiles(id) on delete cascade;

create index if not exists organization_notifications_recipient_org_date_idx
  on public.organization_notifications (recipient_user_id,organization_id,created_at desc)
  where recipient_user_id is not null;

drop policy if exists organization_notifications_select on public.organization_notifications;
create policy organization_notifications_select
on public.organization_notifications for select to authenticated
using (
  private.is_organization_member(organization_id)
  and (recipient_user_id is null or recipient_user_id=(select auth.uid()))
  and (
    coalesce(array_length(visibility_permissions,1),0)=0
    or exists (
      select 1 from unnest(visibility_permissions) as permission_key
      where private.has_organization_permission(organization_id,permission_key)
    )
  )
);

-- Reutiliza a auditoria existente em vez de duplicar ações no frontend.
drop trigger if exists universal_audit_row_changes on public.service_order_item_task_assignees;
create trigger universal_audit_row_changes
after insert or delete on public.service_order_item_task_assignees
for each row execute function private.audit_log_row_change();

-- Audita somente mudanças reais de horário, evitando logs de status/GPS e Realtime.
create or replace function private.audit_service_task_schedule_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if current_setting('app.union_catalog_automatic',true) = 'on' then return new; end if;

  insert into public.organization_audit_logs(
    organization_id,actor_user_id,actor_name_snapshot,action,operation,
    entity_type,entity_id,table_name,module_key,context_type,context_id,source,
    changed_fields,row_snapshot,metadata
  )
  values(
    new.organization_id,v_actor,
    (select p.full_name from public.profiles p where p.id=v_actor),
    'service_order_item_tasks.update','update',
    'service_order_item_tasks',new.item_id::text,'service_order_item_tasks','orders',
    'service_order',new.service_order_id::text,
    case when v_actor is null then 'system' else 'authenticated_user' end,
    jsonb_build_object(
      'scheduled_start_at',jsonb_build_object('before',old.scheduled_start_at,'after',new.scheduled_start_at),
      'scheduled_end_at',jsonb_build_object('before',old.scheduled_end_at,'after',new.scheduled_end_at)
    ),
    jsonb_build_object(
      'item_id',new.item_id,'service_order_id',new.service_order_id,
      'scheduled_start_at',new.scheduled_start_at,'scheduled_end_at',new.scheduled_end_at
    ),
    jsonb_build_object('schema','public','trigger','technician_schedule_audit_v1')
  );
  return new;
end;
$$;
revoke all on function private.audit_service_task_schedule_change() from public,anon,authenticated;
drop trigger if exists audit_service_task_schedule_change on public.service_order_item_tasks;
create trigger audit_service_task_schedule_change
after update of scheduled_start_at,scheduled_end_at on public.service_order_item_tasks
for each row when (
  old.scheduled_start_at is distinct from new.scheduled_start_at
  or old.scheduled_end_at is distinct from new.scheduled_end_at
)
execute function private.audit_service_task_schedule_change();

-- Só o perfil relacionado ao funcionário ativo recebe o aviso.
create or replace function private.send_technician_notification_v1(
  p_org uuid,p_employee uuid,p_audit_id bigint,p_actor uuid,p_actor_name text,
  p_event_type text,p_entity_type text,p_entity_id text,p_title text,
  p_message text,p_route text,p_permission text,p_metadata jsonb
)
returns void language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;
begin
  select employee.profile_id into v_recipient
  from public.employees employee
  where employee.id=p_employee and employee.organization_id=p_org
    and employee.is_active and employee.profile_id is not null;
  if v_recipient is null then return; end if;

  insert into public.organization_notifications(
    organization_id,audit_log_id,actor_user_id,actor_name_snapshot,
    module_key,event_type,entity_type,entity_id,title,message,route,
    visibility_permissions,metadata,recipient_user_id
  ) values (
    p_org,null,p_actor,p_actor_name,
    case when p_permission='agenda.view' then 'agenda' else 'technicianPanel' end,
    p_event_type,p_entity_type,p_entity_id,p_title,p_message,p_route,
    array[p_permission],coalesce(p_metadata,'{}'::jsonb) ||
      jsonb_build_object('audit_log_id',p_audit_id,'employee_id',p_employee),v_recipient
  );
end;
$$;
revoke all on function private.send_technician_notification_v1(
  uuid,uuid,bigint,uuid,text,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated;

create or replace function private.notify_technicians_from_audit_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_employee uuid;
  v_item_id uuid;
  v_order_id uuid;
  v_appointment_id uuid;
  v_order_number text;
  v_service text;
  v_title text;
  v_message text;
  v_route text;
  v_kind text;
  v_start timestamptz;
  v_appointment_date date;
  v_table text := coalesce(new.table_name,new.entity_type,'');
begin
  if new.organization_id is null or current_setting('app.union_catalog_automatic',true)='on' then
    return new;
  end if;

  if v_table='service_order_item_task_assignees' and new.operation='insert' then
    v_employee := private.audit_try_uuid(new.row_snapshot->>'employee_id');
    v_item_id := private.audit_try_uuid(new.row_snapshot->>'item_id');
    if v_employee is null or v_item_id is null then return new; end if;

    select item.service_order_id,coalesce(nullif(item.title_snapshot,''),'Serviço'),
      coalesce(ord.os_number::text,'')
      into v_order_id,v_service,v_order_number
    from public.service_order_items item
    join public.service_orders ord on ord.id=item.service_order_id
      and ord.organization_id=new.organization_id
    where item.id=v_item_id and item.organization_id=new.organization_id;
    if v_order_id is null then return new; end if;
    perform private.send_technician_notification_v1(
      new.organization_id,v_employee,new.id,new.actor_user_id,new.actor_name_snapshot,
      'created','service_order_item_task_assignees',v_item_id::text,
      'Novo serviço atribuído · OS '||v_order_number,
      'Você foi designado para '||v_service||' na OS '||v_order_number||'.',
      '/admin/technician-panel/os/'||v_order_id::text||'?service='||v_item_id::text,
      'technician_panel.view',jsonb_build_object('service_order_id',v_order_id,'item_id',v_item_id,'event','assigned')
    );

  elsif v_table='appointment_technicians' and new.operation='insert' then
    v_employee:=private.audit_try_uuid(new.row_snapshot->>'employee_id');
    v_appointment_id:=private.audit_try_uuid(new.row_snapshot->>'appointment_id');
    if v_employee is null or v_appointment_id is null then return new; end if;
    select a.appointment_date into v_appointment_date
    from public.appointments a
    where a.id=v_appointment_id and a.organization_id=new.organization_id;
    if v_appointment_date is null then return new; end if;
    perform private.send_technician_notification_v1(
      new.organization_id,v_employee,new.id,new.actor_user_id,new.actor_name_snapshot,
      'created','appointment_technicians',v_appointment_id::text,
      'Novo agendamento para você',
      'Você foi incluído em um agendamento para '||to_char(v_appointment_date,'DD/MM/YYYY')||'.',
      '/admin/agenda','agenda.view',
      jsonb_build_object('appointment_id',v_appointment_id,'event','assigned')
    );

  elsif v_table='service_order_item_tasks' and new.operation='update'
    and (new.changed_fields ? 'scheduled_start_at' or new.changed_fields ? 'scheduled_end_at') then
    v_item_id:=private.audit_try_uuid(new.row_snapshot->>'item_id');
    v_order_id:=private.audit_try_uuid(new.row_snapshot->>'service_order_id');
    if v_item_id is null or v_order_id is null then return new; end if;
    v_start:=nullif(new.row_snapshot->>'scheduled_start_at','')::timestamptz;
    select coalesce(ord.os_number::text,''),coalesce(nullif(item.title_snapshot,''),'Serviço')
      into v_order_number,v_service
    from public.service_orders ord
    join public.service_order_items item on item.service_order_id=ord.id
    where ord.id=v_order_id and item.id=v_item_id
      and ord.organization_id=new.organization_id;
    if not found then return new; end if;

    v_title:=case when v_start is null then 'Agendamento do serviço cancelado'
      when new.changed_fields->'scheduled_start_at'->>'before' is null then 'Serviço agendado'
      else 'Serviço reagendado' end;
    v_message:=v_service||' · OS '||v_order_number||
      case when v_start is null then ': horário removido.'
      else ' · '||to_char(v_start at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'.' end;
    for v_employee in
      select link.employee_id from public.service_order_item_task_assignees link
        where link.item_id=v_item_id and link.organization_id=new.organization_id
      union
      select task.assigned_employee_id from public.service_order_item_tasks task
        where task.item_id=v_item_id and task.organization_id=new.organization_id
          and task.assigned_employee_id is not null
    loop
      perform private.send_technician_notification_v1(
        new.organization_id,v_employee,new.id,new.actor_user_id,new.actor_name_snapshot,
        'updated','service_order_item_tasks',v_item_id::text,
        v_title,v_message,
        '/admin/technician-panel/os/'||v_order_id::text||'?service='||v_item_id::text,
        'technician_panel.view',
        jsonb_build_object('service_order_id',v_order_id,'item_id',v_item_id,'event','schedule_changed')
      );
    end loop;

  elsif v_table='appointments' and new.operation='update' and (
    new.changed_fields ? 'appointment_date' or new.changed_fields ? 'start_time'
    or new.changed_fields ? 'end_time' or new.changed_fields ? 'period'
  ) then
    v_appointment_id:=private.audit_try_uuid(new.entity_id);
    if v_appointment_id is null then return new; end if;
    select a.appointment_date into v_appointment_date from public.appointments a
      where a.id=v_appointment_id and a.organization_id=new.organization_id;
    if v_appointment_date is null then return new; end if;
    for v_employee in
      select distinct link.employee_id from public.appointment_technicians link
      where link.appointment_id=v_appointment_id and link.organization_id=new.organization_id
    loop
      perform private.send_technician_notification_v1(
        new.organization_id,v_employee,new.id,new.actor_user_id,new.actor_name_snapshot,
        'updated','appointments',v_appointment_id::text,
        'Seu agendamento foi alterado',
        'Confira o novo horário do agendamento de '||to_char(v_appointment_date,'DD/MM/YYYY')||'.',
        '/admin/agenda','agenda.view',
        jsonb_build_object('appointment_id',v_appointment_id,'event','schedule_changed')
      );
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_technicians_from_audit_v1() from public,anon,authenticated;
drop trigger if exists notify_technicians_from_audit_v1 on public.organization_audit_logs;
create trigger notify_technicians_from_audit_v1
after insert on public.organization_audit_logs
for each row execute function private.notify_technicians_from_audit_v1();
