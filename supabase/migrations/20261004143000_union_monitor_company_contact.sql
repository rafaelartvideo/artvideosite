begin;

create or replace function public.get_union_monitored_order_contact(p_service_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.view') then
    raise exception 'Sem permissão para monitorar ordens de serviço.' using errcode = '42501';
  end if;

  if not private.can_monitor_service_order(p_service_order_id) then
    raise exception 'Esta OS não está disponível para monitoramento.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'phone',
      coalesce(
        nullif(btrim(organization.settings->>'phone'), ''),
        nullif(btrim(company_settings.phone), ''),
        nullif(btrim(organization.settings->>'whatsapp'), ''),
        nullif(btrim(owner_contact.employee_phone), ''),
        nullif(btrim(owner_contact.profile_phone), '')
      ),
    'whatsapp',
      coalesce(
        nullif(btrim(organization.settings->>'whatsapp'), ''),
        nullif(btrim(organization.settings->>'phone'), ''),
        nullif(btrim(company_settings.phone), ''),
        nullif(btrim(owner_contact.employee_phone), ''),
        nullif(btrim(owner_contact.profile_phone), '')
      ),
    'email',
      coalesce(
        nullif(btrim(organization.settings->>'email'), ''),
        nullif(btrim(company_settings.email), ''),
        nullif(btrim(owner_contact.profile_email), '')
      ),
    'owner_user_id', owner_contact.user_id,
    'owner_name', owner_contact.owner_name
  )
  into v_result
  from public.service_orders service_order
  join public.organizations organization
    on organization.id = service_order.organization_id
  left join public.organization_company_settings company_settings
    on company_settings.organization_id = service_order.organization_id
  left join lateral (
    select
      membership.user_id,
      profile.full_name as owner_name,
      profile.phone as profile_phone,
      profile.email as profile_email,
      employee.phone as employee_phone
    from public.organization_members membership
    left join public.profiles profile
      on profile.id = membership.user_id
    left join public.employees employee
      on employee.organization_id = membership.organization_id
     and employee.profile_id = membership.user_id
    where membership.organization_id = service_order.organization_id
      and membership.is_owner = true
      and membership.status = 'active'
    order by membership.created_at asc
    limit 1
  ) owner_contact on true
  where service_order.id = p_service_order_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_union_monitored_order_contact(uuid) from public, anon;
grant execute on function public.get_union_monitored_order_contact(uuid) to authenticated;

commit;
