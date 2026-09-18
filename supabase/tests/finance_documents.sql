-- Finance documents structural verification.
DO $$
DECLARE
  v_rls boolean;
  v_anon integer;
  v_direct integer;
  v_delete integer;
  v_rpc integer;
  v_public boolean;
BEGIN
  if to_regclass('public.financial_attachments') is null then raise exception 'financial_attachments is missing'; end if;
  select public into v_public from storage.buckets where id='financial-documents';
  if not found or coalesce(v_public,true) then raise exception 'financial-documents bucket must be private'; end if;

  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='financial_attachments';
  if not coalesce(v_rls,false) then raise exception 'financial_attachments must have RLS'; end if;

  select count(*) into v_anon from information_schema.role_table_grants where table_schema='public' and table_name='financial_attachments' and grantee='anon';
  if v_anon<>0 then raise exception 'unexpected anon grants on financial_attachments'; end if;

  select count(*) into v_direct from information_schema.role_table_grants where table_schema='public' and table_name='financial_attachments' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_direct<>0 then raise exception 'authenticated direct writes found on financial_attachments'; end if;

  select count(*) into v_delete from pg_policies where schemaname='public' and tablename='financial_attachments' and cmd='DELETE';
  if v_delete<>0 then raise exception 'DELETE policy found on financial_attachments'; end if;

  select count(*) into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('register_financial_attachment','archive_financial_attachment');
  if v_rpc<>2 then raise exception 'document RPCs are incomplete'; end if;

  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='financial_documents_delete_orphan' and cmd='DELETE') then raise exception 'orphan cleanup storage policy is missing'; end if;
END $$;

select 'finance documents structural test ok' as result;
