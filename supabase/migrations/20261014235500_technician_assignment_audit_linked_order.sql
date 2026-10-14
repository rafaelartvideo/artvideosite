
-- A atribuição de um serviço aparece na auditoria dentro da OS correta.
-- Não alterar a função universal (compartilhada por todo o CRM).
create or replace function private.audit_service_task_assignee_change_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_item uuid;
  v_employee uuid;
  v_org uuid;
  v_order uuid;
  v_actor uuid;
  v_service text;
  v_technician text;
  v_operation text := lower(tg_op);
begin
  if current_setting('app.union_catalog_automatic',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if tg_op='DELETE' then
    v_item:=old.item_id;
    v_employee:=old.employee_id;
    v_org:=old.organization_id;
  else
    v_item:=new.item_id;
    v_employee:=new.employee_id;
    v_org:=new.organization_id;
  end if;
  select item.service_order_id,item.title_snapshot
    into v_order,v_service
  from public.service_order_items item
  where item.id=v_item and item.organization_id=v_org;

  if v_order is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  select employee.full_name into v_technician
  from public.employees employee
  where employee.id=v_employee and employee.organization_id=v_org;

  v_actor:=coalesce((select auth.uid()),
    case when tg_op='INSERT' then new.assigned_by else null end);

  insert into public.organization_audit_logs(
    organization_id,actor_user_id,actor_name_snapshot,action,operation,
    entity_type,entity_id,table_name,module_key,context_type,context_id,source,
    changed_fields,row_snapshot,metadata
  ) values(
    v_org,v_actor,
    (select p.full_name from public.profiles p where p.id=v_actor),
    'service_order_item_task_assignees.'||v_operation,v_operation,
    'service_order_item_task_assignees',v_item::text,
    'service_order_item_task_assignees','orders','service_order',v_order::text,
    case when (select auth.uid()) is null then 'server_on_behalf' else 'authenticated_user' end,
    '{}'::jsonb,
    jsonb_build_object('item_id',v_item,'employee_id',v_employee,
      'service_order_id',v_order,'service_title',v_service,'technician_name',v_technician),
    jsonb_build_object('schema','public','trigger','technician_assignment_audit_v1')
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_service_task_assignee_change_v1() from public,anon,authenticated;
drop trigger if exists universal_audit_row_changes on public.service_order_item_task_assignees;
drop trigger if exists audit_service_task_assignee_change_v1 on public.service_order_item_task_assignees;
create trigger audit_service_task_assignee_change_v1
after insert or delete on public.service_order_item_task_assignees
for each row execute function private.audit_service_task_assignee_change_v1();
