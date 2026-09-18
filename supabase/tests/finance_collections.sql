-- Finance collections structural verification.
DO $$
DECLARE
  v_rls boolean;
  v_anon integer;
  v_direct integer;
  v_delete integer;
  v_rpc integer;
BEGIN
  if to_regclass('public.financial_collection_logs') is null then raise exception 'financial_collection_logs is missing'; end if;
  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='financial_collection_logs';
  if not coalesce(v_rls,false) then raise exception 'financial_collection_logs must have RLS'; end if;

  select count(*) into v_anon from information_schema.role_table_grants where table_schema='public' and table_name='financial_collection_logs' and grantee='anon';
  if v_anon<>0 then raise exception 'unexpected anon grants on financial_collection_logs'; end if;

  select count(*) into v_direct from information_schema.role_table_grants where table_schema='public' and table_name='financial_collection_logs' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_direct<>0 then raise exception 'authenticated direct writes found on financial_collection_logs'; end if;

  select count(*) into v_delete from pg_policies where schemaname='public' and tablename='financial_collection_logs' and cmd='DELETE';
  if v_delete<>0 then raise exception 'DELETE policy found on financial_collection_logs'; end if;

  select count(*) into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='register_financial_collection_log';
  if v_rpc<>1 then raise exception 'collection RPC is missing'; end if;
END $$;

select 'finance collections structural test ok' as result;
