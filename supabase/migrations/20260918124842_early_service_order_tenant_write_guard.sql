begin;

create or replace function private.guard_service_order_tenant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_organization_id := case
    when tg_op = 'DELETE' then old.organization_id
    else coalesce(new.organization_id, old.organization_id)
  end;

  if v_organization_id is null
     or not private.is_organization_module_enabled(v_organization_id, 'orders')
     or not private.can_access_shared_organization_resource(
       v_organization_id,
       'orders',
       'manage'
     ) then
    raise exception 'Você não possui acesso para alterar ordens de serviço desta empresa.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_service_order_tenant_write() from public;

drop trigger if exists aaa_service_orders_tenant_write_guard
  on public.service_orders;
create trigger aaa_service_orders_tenant_write_guard
before insert or update or delete
on public.service_orders
for each row
execute function private.guard_service_order_tenant_write();

commit;
