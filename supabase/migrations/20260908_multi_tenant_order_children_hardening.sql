-- Multiempresa (fase 4C.2): endurecimento dos registros filhos da OS.
-- Garante herança da empresa em toda tabela filha que possua service_order_id
-- e impede alteração direta de organization_id depois da criação.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_order_children_hardening', 0)
);

do $$
declare
  table_row record;
  inherit_trigger_name text;
  immutable_trigger_name text;
begin
  for table_row in
    select column_table.table_name
    from information_schema.columns column_table
    where column_table.table_schema = 'public'
      and column_table.column_name = 'service_order_id'
      and exists (
        select 1
        from information_schema.columns organization_column
        where organization_column.table_schema = column_table.table_schema
          and organization_column.table_name = column_table.table_name
          and organization_column.column_name = 'organization_id'
      )
      and column_table.table_name <> 'service_orders'
  loop
    inherit_trigger_name := left(table_row.table_name || '_inherit_organization', 63);
    immutable_trigger_name := left(table_row.table_name || '_prevent_organization_change', 63);

    execute format('drop trigger if exists %I on public.%I', inherit_trigger_name, table_row.table_name);
    execute format(
      'create trigger %I before insert or update of service_order_id on public.%I for each row execute function private.inherit_service_order_organization()',
      inherit_trigger_name,
      table_row.table_name
    );

    execute format('drop trigger if exists %I on public.%I', immutable_trigger_name, table_row.table_name);
    execute format(
      'create trigger %I before update of organization_id on public.%I for each row execute function private.prevent_organization_id_change()',
      immutable_trigger_name,
      table_row.table_name
    );
  end loop;
end;
$$;

-- Itens de solicitação não têm service_order_id direto: herdam pela solicitação.
create or replace function private.inherit_part_request_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_organization_id uuid;
begin
  select request.organization_id
    into request_organization_id
  from public.service_order_part_requests request
  where request.id = new.request_id;

  if request_organization_id is null then
    raise exception 'Solicitação de peças não encontrada.' using errcode = '23503';
  end if;

  new.organization_id := request_organization_id;
  return new;
end;
$$;

revoke all on function private.inherit_part_request_organization() from public;

do $$
begin
  if to_regclass('public.service_order_part_request_items') is not null then
    drop trigger if exists service_order_part_request_items_inherit_organization
      on public.service_order_part_request_items;
    create trigger service_order_part_request_items_inherit_organization
    before insert or update of request_id
    on public.service_order_part_request_items
    for each row
    execute function private.inherit_part_request_organization();

    drop trigger if exists service_order_part_request_items_prevent_organization_change
      on public.service_order_part_request_items;
    create trigger service_order_part_request_items_prevent_organization_change
    before update of organization_id
    on public.service_order_part_request_items
    for each row
    execute function private.prevent_organization_id_change();
  end if;
end;
$$;

comment on function private.inherit_part_request_organization() is
  'Faz itens de solicitação de peças herdarem organization_id da solicitação pai.';

commit;
