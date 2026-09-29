create or replace function private.is_monitored_service_type(
  p_organization_id uuid,
  p_service_type_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_organization_id is not null
    and p_service_type_id is not null
    and exists (
      select 1
      from public.service_type_monitoring monitoring
      where monitoring.organization_id = p_organization_id
        and monitoring.service_type_id = p_service_type_id
    );
$function$;

revoke all on function private.is_monitored_service_type(uuid, uuid) from public, anon;
grant execute on function private.is_monitored_service_type(uuid, uuid) to authenticated;

create or replace function private.is_current_user_service_order_staff(
  p_service_order_id uuid,
  p_organization_id uuid,
  p_technician_id uuid,
  p_seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_service_order_id is not null
    and p_organization_id is not null
    and (
      exists (
        select 1
        from public.employees employee
        where employee.organization_id = p_organization_id
          and employee.profile_id = (select auth.uid())
          and employee.id in (p_technician_id, p_seller_id)
      )
      or exists (
        select 1
        from public.service_order_technicians technician_link
        join public.employees employee
          on employee.id = technician_link.employee_id
         and employee.organization_id = p_organization_id
        where technician_link.service_order_id = p_service_order_id
          and technician_link.organization_id = p_organization_id
          and employee.profile_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.service_order_sellers seller_link
        join public.employees employee
          on employee.id = seller_link.employee_id
         and employee.organization_id = p_organization_id
        where seller_link.service_order_id = p_service_order_id
          and seller_link.organization_id = p_organization_id
          and employee.profile_id = (select auth.uid())
      )
    );
$function$;

revoke all on function private.is_current_user_service_order_staff(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.is_current_user_service_order_staff(uuid, uuid, uuid, uuid) to authenticated;

create index if not exists employees_org_profile_id_idx
  on public.employees (organization_id, profile_id, id)
  where profile_id is not null;
