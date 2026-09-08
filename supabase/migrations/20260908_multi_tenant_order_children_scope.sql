-- Multiempresa (fase 4C.1): filhos diretos de Ordens de Serviço.
-- Toda linha filha herda a empresa da OS pai no banco, evitando depender do
-- frontend para repetir organization_id corretamente em cada fluxo auxiliar.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_order_children_scope', 0)
);

create or replace function private.inherit_service_order_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_organization_id uuid;
begin
  select service_order.organization_id
    into parent_organization_id
  from public.service_orders service_order
  where service_order.id = new.service_order_id;

  if parent_organization_id is null then
    raise exception 'OS não encontrada para o registro vinculado.'
      using errcode = '23503';
  end if;

  new.organization_id := parent_organization_id;
  return new;
end;
$$;

revoke all on function private.inherit_service_order_organization() from public;

-- Tabelas filhas que possuem service_order_id diretamente.
do $$
declare
  table_name text;
  trigger_name text;
  tables constant text[] := array[
    'service_order_items',
    'service_order_notes',
    'service_order_status_history',
    'service_order_history_notes',
    'service_order_media',
    'service_order_situation_media',
    'service_order_situation_visits',
    'service_order_technical_values',
    'service_order_technicians',
    'service_order_sellers',
    'service_order_part_requests',
    'service_order_used_items'
  ];
begin
  foreach table_name in array tables
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    trigger_name := left(table_name || '_inherit_organization', 63);
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before insert or update of service_order_id on public.%I for each row execute function private.inherit_service_order_organization()',
      trigger_name,
      table_name
    );
  end loop;
end;
$$;

-- Técnicos e vendedores vinculados precisam pertencer à mesma empresa da OS.
create or replace function private.ensure_service_order_employee_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_organization_id uuid;
  employee_organization_id uuid;
begin
  select service_order.organization_id into order_organization_id
  from public.service_orders service_order
  where service_order.id = new.service_order_id;

  select employee.organization_id into employee_organization_id
  from public.employees employee
  where employee.id = new.employee_id;

  if order_organization_id is null or employee_organization_id is null then
    raise exception 'OS ou funcionário não encontrado para o vínculo.' using errcode = '23503';
  end if;

  if order_organization_id is distinct from employee_organization_id then
    raise exception 'O funcionário vinculado deve pertencer à mesma empresa da OS.' using errcode = '42501';
  end if;

  new.organization_id := order_organization_id;
  return new;
end;
$$;

revoke all on function private.ensure_service_order_employee_organization() from public;

drop trigger if exists service_order_technicians_validate_organization on public.service_order_technicians;
create trigger service_order_technicians_validate_organization
before insert or update of service_order_id, employee_id
on public.service_order_technicians
for each row
execute function private.ensure_service_order_employee_organization();

drop trigger if exists service_order_sellers_validate_organization on public.service_order_sellers;
create trigger service_order_sellers_validate_organization
before insert or update of service_order_id, employee_id
on public.service_order_sellers
for each row
execute function private.ensure_service_order_employee_organization();

comment on function private.inherit_service_order_organization() is
  'Faz registros filhos herdarem organization_id da OS pai.';
comment on function private.ensure_service_order_employee_organization() is
  'Impede vincular técnico ou vendedor de outra empresa à OS.';

commit;
