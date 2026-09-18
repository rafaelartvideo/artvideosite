-- Finance cash sessions structural verification.
DO $$
DECLARE
  v_rls boolean;
  v_anon integer;
  v_direct integer;
  v_delete integer;
  v_rpc integer;
BEGIN
  if to_regclass('public.financial_cash_sessions') is null then raise exception 'financial_cash_sessions is missing'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_movements' and column_name='cash_session_id') then raise exception 'financial_movements.cash_session_id is missing'; end if;

  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='financial_cash_sessions';
  if not coalesce(v_rls,false) then raise exception 'financial_cash_sessions must have RLS'; end if;

  select count(*) into v_anon from information_schema.role_table_grants where table_schema='public' and table_name='financial_cash_sessions' and grantee='anon';
  if v_anon<>0 then raise exception 'unexpected anon grants on financial_cash_sessions'; end if;

  select count(*) into v_direct from information_schema.role_table_grants where table_schema='public' and table_name='financial_cash_sessions' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_direct<>0 then raise exception 'authenticated direct writes found on financial_cash_sessions'; end if;

  select count(*) into v_delete from pg_policies where schemaname='public' and tablename='financial_cash_sessions' and cmd='DELETE';
  if v_delete<>0 then raise exception 'DELETE policy found on financial_cash_sessions'; end if;

  select count(*) into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('open_financial_cash_session','record_financial_cash_adjustment','close_financial_cash_session');
  if v_rpc<>3 then raise exception 'cash session RPCs are incomplete'; end if;
END $$;

select 'finance cash sessions structural test ok' as result;
