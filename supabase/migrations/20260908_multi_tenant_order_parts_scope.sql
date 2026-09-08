-- Multiempresa (fase 4C.3): isolamento do fluxo de peças vinculado às OS.

begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:multi_tenant_order_parts_scope', 0));

create or replace function private.can_read_order_part_flow(p_service_order_id uuid)
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
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and private.can_access_shared_organization_resource(service_order.organization_id, 'orders', 'read')
      and (
        private.can_view_service_order(service_order.id)
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.manage_part_requests')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.dispatch_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.confirm_part_delivery')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.register_part_return')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.receive_returned_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.record_test_results')
      )
  );
$$;

create or replace function private.can_write_order_part_flow(p_service_order_id uuid)
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
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and private.can_access_shared_organization_resource(service_order.organization_id, 'orders', 'manage')
      and (
        private.has_effective_organization_permission(service_order.organization_id, 'orders.request_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.manage_part_requests')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.dispatch_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.confirm_part_delivery')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.register_part_return')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.receive_returned_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.record_test_results')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.solve')
      )
  );
$$;

revoke all on function private.can_read_order_part_flow(uuid) from public;
revoke all on function private.can_write_order_part_flow(uuid) from public;
grant execute on function private.can_read_order_part_flow(uuid) to authenticated;
grant execute on function private.can_write_order_part_flow(uuid) to authenticated;

-- SELECT policies são permissivas (OR). Removemos as antigas do papel
-- authenticated nestas tabelas para que nenhuma regra global sobreviva.
do $$
declare
  target_table text;
  policy_row record;
begin
  foreach target_table in array array[
    'service_order_part_requests',
    'service_order_part_request_items',
    'service_order_part_custody_events',
    'service_order_part_test_events'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and cmd = 'SELECT'
        and 'authenticated' = any (roles)
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;
end;
$$;

create policy service_order_part_requests_tenant_select
on public.service_order_part_requests
for select to authenticated
using (organization_id is not null and private.can_read_order_part_flow(service_order_id));

create policy service_order_part_request_items_tenant_select
on public.service_order_part_request_items
for select to authenticated
using (
  organization_id is not null
  and exists (
    select 1
    from public.service_order_part_requests request
    where request.id = service_order_part_request_items.request_id
      and request.organization_id = service_order_part_request_items.organization_id
      and private.can_read_order_part_flow(request.service_order_id)
  )
);

do $$
begin
  if to_regclass('public.service_order_part_custody_events') is not null then
    execute 'create policy service_order_part_custody_events_tenant_select on public.service_order_part_custody_events for select to authenticated using (organization_id is not null and private.can_read_order_part_flow(service_order_id))';
  end if;

  if to_regclass('public.service_order_part_test_events') is not null then
    execute 'create policy service_order_part_test_events_tenant_select on public.service_order_part_test_events for select to authenticated using (organization_id is not null and private.can_read_order_part_flow(service_order_id))';
  end if;
end;
$$;

-- Barreiras de escrita também protegem chamadas SECURITY DEFINER antigas.
create or replace function private.guard_order_part_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_id uuid;
begin
  if tg_op = 'DELETE' then
    order_id := old.service_order_id;
  else
    order_id := new.service_order_id;
  end if;

  if order_id is not null and not private.can_write_order_part_flow(order_id) then
    raise exception 'Você não possui permissão para alterar peças desta OS nesta empresa.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_order_part_item_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request_id uuid;
  order_id uuid;
begin
  if tg_op = 'DELETE' then
    target_request_id := old.request_id;
  else
    target_request_id := new.request_id;
  end if;

  select request.service_order_id into order_id
  from public.service_order_part_requests request
  where request.id = target_request_id;

  if order_id is null then
    raise exception 'Solicitação de peças não encontrada.' using errcode = '23503';
  end if;

  if not private.can_write_order_part_flow(order_id) then
    raise exception 'Você não possui permissão para alterar itens desta solicitação nesta empresa.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_order_part_write() from public;
revoke all on function private.guard_order_part_item_write() from public;

drop trigger if exists service_order_part_requests_tenant_guard on public.service_order_part_requests;
create trigger service_order_part_requests_tenant_guard
before insert or update or delete on public.service_order_part_requests
for each row execute function private.guard_order_part_write();

drop trigger if exists service_order_part_request_items_tenant_guard on public.service_order_part_request_items;
create trigger service_order_part_request_items_tenant_guard
before insert or update or delete on public.service_order_part_request_items
for each row execute function private.guard_order_part_item_write();

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'service_order_part_custody_events',
    'service_order_part_test_events',
    'service_order_used_items',
    'inventory_movements'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null
       or not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = target_table
           and column_name = 'service_order_id'
       ) then
      continue;
    end if;

    trigger_name := left(target_table || '_tenant_guard', 63);
    execute format('drop trigger if exists %I on public.%I', trigger_name, target_table);
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_order_part_write()',
      trigger_name,
      target_table
    );
  end loop;
end;
$$;

commit;
