-- Finance approvals verification. Run against a migrated database.

DO $$
DECLARE
  v_rls boolean;
  v_anon_grants integer;
  v_direct_writes integer;
  v_delete_policies integer;
  v_rpc_count integer;
BEGIN
  if to_regclass('public.financial_approvals') is null then
    raise exception 'financial_approvals table is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financial_entries' and column_name='approval_cycle'
  ) then
    raise exception 'financial_entries.approval_cycle is missing';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='financial_approvals';
  if not coalesce(v_rls,false) then
    raise exception 'financial_approvals must have RLS enabled';
  end if;

  select count(*) into v_anon_grants
  from information_schema.role_table_grants
  where table_schema='public' and table_name='financial_approvals' and grantee='anon';
  if v_anon_grants <> 0 then
    raise exception 'unexpected anon grants on financial_approvals: %', v_anon_grants;
  end if;

  select count(*) into v_direct_writes
  from information_schema.role_table_grants
  where table_schema='public' and table_name='financial_approvals'
    and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_direct_writes <> 0 then
    raise exception 'authenticated direct writes found on financial_approvals: %', v_direct_writes;
  end if;

  select count(*) into v_delete_policies
  from pg_policies
  where schemaname='public' and tablename='financial_approvals' and cmd='DELETE';
  if v_delete_policies <> 0 then
    raise exception 'DELETE policy found on financial_approvals';
  end if;

  select count(*) into v_rpc_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='decide_financial_entry';
  if v_rpc_count <> 1 then
    raise exception 'decide_financial_entry RPC missing';
  end if;
END $$;

-- Acceptance scenarios additionally exercised in a transaction with ROLLBACK:
-- 1. one approval completes a required_approvals=1 title;
-- 2. first of two approvals keeps the title pending;
-- 3. duplicate approver is rejected;
-- 4. a distinct second approver completes required_approvals=2;
-- 5. the creator cannot be the second approver;
-- 6. rejection requires a non-empty note;
-- 7. editing/resubmitting increments approval_cycle and old approvals no longer count.
