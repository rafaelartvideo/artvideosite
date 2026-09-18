-- Finance recurrence structural verification.
DO $$
DECLARE
  v_rls boolean;
  v_anon integer;
  v_direct integer;
  v_delete integer;
  v_rpc integer;
  v_cron integer;
BEGIN
  if to_regclass('public.financial_recurring_rules') is null then raise exception 'financial_recurring_rules is missing'; end if;
  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='financial_recurring_rules';
  if not coalesce(v_rls,false) then raise exception 'financial_recurring_rules must have RLS'; end if;

  select count(*) into v_anon from information_schema.role_table_grants where table_schema='public' and table_name='financial_recurring_rules' and grantee='anon';
  if v_anon<>0 then raise exception 'unexpected anon grants on financial_recurring_rules'; end if;

  select count(*) into v_direct from information_schema.role_table_grants where table_schema='public' and table_name='financial_recurring_rules' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_direct<>0 then raise exception 'authenticated direct writes found on financial_recurring_rules'; end if;

  select count(*) into v_delete from pg_policies where schemaname='public' and tablename='financial_recurring_rules' and cmd='DELETE';
  if v_delete<>0 then raise exception 'DELETE policy found on financial_recurring_rules'; end if;

  select count(*) into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('save_financial_recurring_rule','generate_financial_recurring_occurrences','set_financial_recurring_rule_active');
  if v_rpc<>3 then raise exception 'recurring RPCs are incomplete'; end if;

  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='financial_entries' and indexname='financial_entries_recurring_origin_uidx') then raise exception 'recurring idempotency index is missing'; end if;
  select count(*) into v_cron from cron.job where jobname='finance-recurring-90-days' and active=true;
  if v_cron<>1 then raise exception 'finance recurring cron job is missing or duplicated'; end if;
END $$;

select 'finance recurring structural test ok' as result;
