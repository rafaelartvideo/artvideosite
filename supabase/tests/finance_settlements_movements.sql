-- Finance settlements/movements verification. Run against a migrated database.

DO $$
DECLARE
  v_missing integer;
  v_rls_missing integer;
  v_anon_grants integer;
  v_direct_writes integer;
  v_delete_policies integer;
  v_anon_rpc integer;
BEGIN
  select count(*) into v_missing
  from (values
    ('financial_settlements'),
    ('financial_movements'),
    ('financial_transfers')
  ) expected(table_name)
  where to_regclass('public.' || expected.table_name) is null;
  if v_missing <> 0 then raise exception 'finance settlement/movement tables missing: %', v_missing; end if;

  select count(*) into v_rls_missing
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('financial_settlements','financial_movements','financial_transfers')
    and not c.relrowsecurity;
  if v_rls_missing <> 0 then raise exception 'finance money tables without RLS: %', v_rls_missing; end if;

  select count(*) into v_anon_grants
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('financial_settlements','financial_movements','financial_transfers')
    and grantee='anon';
  if v_anon_grants <> 0 then raise exception 'unexpected anon finance money grants: %', v_anon_grants; end if;

  select count(*) into v_direct_writes
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('financial_settlements','financial_movements','financial_transfers')
    and grantee='authenticated'
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_direct_writes <> 0 then raise exception 'unexpected authenticated direct money writes: %', v_direct_writes; end if;

  select count(*) into v_delete_policies
  from pg_policies
  where schemaname='public'
    and tablename in ('financial_settlements','financial_movements','financial_transfers')
    and cmd='DELETE';
  if v_delete_policies <> 0 then raise exception 'unexpected finance money DELETE policies: %', v_delete_policies; end if;

  select count(*) into v_anon_rpc
  from information_schema.routine_privileges
  where routine_schema='public'
    and routine_name in (
      'register_financial_settlement','confirm_financial_settlement','reverse_financial_settlement',
      'transfer_financial_funds','reverse_financial_transfer','configure_financial_opening_balance',
      'get_financial_account_balances'
    )
    and grantee='anon'
    and privilege_type='EXECUTE';
  if v_anon_rpc <> 0 then raise exception 'unexpected anon finance money RPC grants: %', v_anon_rpc; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financial_accounts' and column_name='opening_balance_configured_at'
  ) then raise exception 'opening balance marker missing on financial_accounts'; end if;
END $$;

select proname
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'register_financial_settlement','confirm_financial_settlement','reverse_financial_settlement',
    'transfer_financial_funds','reverse_financial_transfer','configure_financial_opening_balance',
    'get_financial_account_balances'
  )
order by proname;
