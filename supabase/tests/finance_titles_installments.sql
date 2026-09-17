-- Finance titles/installments verification. Run against a migrated database.

DO $$
DECLARE
  v_missing integer;
  v_rls_missing integer;
  v_anon_grants integer;
  v_delete_grants integer;
  v_delete_policies integer;
BEGIN
  select count(*) into v_missing
  from (values
    ('financial_entries'),
    ('financial_installments'),
    ('financial_allocations'),
    ('financial_events')
  ) expected(table_name)
  where to_regclass('public.' || expected.table_name) is null;
  if v_missing <> 0 then raise exception 'finance titles tables missing: %', v_missing; end if;

  select count(*) into v_rls_missing
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('financial_entries','financial_installments','financial_allocations','financial_events')
    and not c.relrowsecurity;
  if v_rls_missing <> 0 then raise exception 'finance title tables without RLS: %', v_rls_missing; end if;

  select count(*) into v_anon_grants
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('financial_entries','financial_installments','financial_allocations','financial_events')
    and grantee='anon';
  if v_anon_grants <> 0 then raise exception 'unexpected anon finance grants: %', v_anon_grants; end if;

  select count(*) into v_delete_grants
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('financial_entries','financial_installments','financial_allocations','financial_events')
    and grantee='authenticated'
    and privilege_type='DELETE';
  if v_delete_grants <> 0 then raise exception 'unexpected authenticated DELETE grants: %', v_delete_grants; end if;

  select count(*) into v_delete_policies
  from pg_policies
  where schemaname='public'
    and tablename in ('financial_entries','financial_installments','financial_allocations','financial_events')
    and cmd='DELETE';
  if v_delete_policies <> 0 then raise exception 'unexpected finance DELETE policies: %', v_delete_policies; end if;
END $$;

select proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='save_financial_entry';
