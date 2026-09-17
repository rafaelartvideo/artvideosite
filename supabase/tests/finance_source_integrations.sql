-- Finance source integrations verification. Run against a migrated database.

DO $$
DECLARE
  v_count integer;
  v_anon_execute integer;
  v_authenticated_private integer;
BEGIN
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financial_entries' and column_name='source_details' and data_type='jsonb'
  ) then
    raise exception 'financial_entries.source_details jsonb is missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='financial_entries'
      and indexname='financial_entries_integrated_origin_uidx'
  ) then
    raise exception 'integrated origin unique index is missing';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='complete_service_order'
    and pg_get_function_identity_arguments(p.oid) in (
      'p_service_order_id uuid, p_discount_percentage numeric',
      'p_service_order_id uuid, p_discount_percentage numeric, p_finance_payload jsonb'
    );
  if v_count <> 2 then
    raise exception 'complete_service_order overloads are incomplete: %', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_inventory_purchase_with_finance'
  ) then
    raise exception 'record_inventory_purchase_with_finance RPC is missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_order_completion_finance_options'
  ) then
    raise exception 'get_order_completion_finance_options RPC is missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='create_integrated_financial_entry'
  ) then
    raise exception 'private.create_integrated_financial_entry wrapper is missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='create_integrated_financial_entry_enabled_impl'
  ) then
    raise exception 'private.create_integrated_financial_entry_enabled_impl is missing';
  end if;

  select count(*) into v_anon_execute
  from information_schema.routine_privileges
  where routine_schema='public'
    and routine_name in ('complete_service_order','record_inventory_purchase_with_finance','get_order_completion_finance_options')
    and grantee='anon'
    and privilege_type='EXECUTE';
  if v_anon_execute <> 0 then
    raise exception 'unexpected anon EXECUTE grant on finance integration RPCs: %', v_anon_execute;
  end if;

  select count(*) into v_authenticated_private
  from information_schema.routine_privileges
  where routine_schema='private'
    and routine_name in ('create_integrated_financial_entry','create_integrated_financial_entry_enabled_impl')
    and grantee='authenticated'
    and privilege_type='EXECUTE';
  if v_authenticated_private <> 0 then
    raise exception 'authenticated can execute private integration helpers directly: %', v_authenticated_private;
  end if;
END $$;

-- Acceptance scenarios are additionally exercised in transactions with ROLLBACK:
-- 1. concluding an OS creates exactly one approved receivable linked by service_order origin;
-- 2. mixed immediate receipts create settlements/movements and leave the remaining amount open;
-- 3. an organization with Finance disabled can still complete an OS without a finance title;
-- 4. a stock purchase creates the inventory movement and one pending payable in the same transaction;
-- 5. payable required_approvals snapshots 1 or 2 from the organization threshold;
-- 6. rejecting the payable never rolls back the already registered stock movement;
-- 7. integrated origin uniqueness blocks duplicate financial titles;
-- 8. all acceptance tests end with ROLLBACK and leave no business rows behind.
