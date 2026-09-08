-- Fechamento multiempresa dos perfis diretamente vinculados à OS.
-- assigned_to é a âncora/autor da criação da OS e completed_by registra quem
-- realizou a conclusão financeira. Ambos precisam pertencer à empresa da OS.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_order_profile_links', 0)
);

create or replace function private.ensure_service_order_profile_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    raise exception 'A empresa da OS é obrigatória.' using errcode = '23502';
  end if;

  if new.assigned_to is not null and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.assigned_to
      and member.status = 'active'
  ) then
    raise exception 'O responsável vinculado não pertence à empresa da OS.'
      using errcode = '42501';
  end if;

  if new.completed_by is not null and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.completed_by
      and member.status = 'active'
  ) then
    raise exception 'O usuário da conclusão não pertence à empresa da OS.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_service_order_profile_organization() from public;

drop trigger if exists service_orders_validate_profile_organization
  on public.service_orders;
create trigger service_orders_validate_profile_organization
before insert or update of organization_id, assigned_to, completed_by
on public.service_orders
for each row
execute function private.ensure_service_order_profile_organization();

-- Garante também que a regra central de visualização só reconheça assigned_to
-- quando o usuário continua sendo membro ativo daquela empresa.
create or replace function private.can_view_service_order(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(
        service_order.organization_id,
        'orders'
      )
      and private.can_access_shared_organization_resource(
        service_order.organization_id,
        'orders',
        'read'
      )
      and (
        private.has_effective_organization_permission(
          service_order.organization_id,
          'orders.view_all'
        )
        or (
          private.has_effective_organization_permission(
            service_order.organization_id,
            'orders.view'
          )
          and (
            (
              service_order.assigned_to = (select auth.uid())
              and exists (
                select 1
                from public.organization_members member
                where member.organization_id = service_order.organization_id
                  and member.user_id = (select auth.uid())
                  and member.status = 'active'
              )
            )
            or exists (
              select 1
              from public.employees employee
              where employee.organization_id = service_order.organization_id
                and employee.profile_id = (select auth.uid())
                and employee.id in (
                  service_order.technician_id,
                  service_order.seller_id
                )
            )
            or exists (
              select 1
              from public.service_order_technicians technician_link
              join public.employees employee
                on employee.id = technician_link.employee_id
               and employee.organization_id = service_order.organization_id
              where technician_link.service_order_id = service_order.id
                and technician_link.organization_id = service_order.organization_id
                and employee.profile_id = (select auth.uid())
            )
            or exists (
              select 1
              from public.service_order_sellers seller_link
              join public.employees employee
                on employee.id = seller_link.employee_id
               and employee.organization_id = service_order.organization_id
              where seller_link.service_order_id = service_order.id
                and seller_link.organization_id = service_order.organization_id
                and employee.profile_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;

revoke all on function private.can_view_service_order(uuid) from public;
grant execute on function private.can_view_service_order(uuid) to authenticated;

comment on function private.ensure_service_order_profile_organization() is
  'Impede assigned_to/completed_by de referenciarem usuários que não sejam membros ativos da empresa da OS.';

commit;
