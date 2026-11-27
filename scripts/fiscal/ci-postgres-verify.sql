-- Run after candidate scripts on the disposable CI fixture.
do $$
begin
 if exists(select 1 from public.organization_modules where module_key='fiscal' and is_enabled)
 then raise exception 'module unexpectedly enabled'; end if;
 if has_table_privilege('authenticated','public.fiscal_provider_accounts','SELECT') or
    has_table_privilege('authenticated','public.fiscal_captured_documents','SELECT') or
    has_function_privilege('authenticated','public.fiscal_read_provider_session(uuid)','EXECUTE') or
    has_function_privilege('anon','public.fiscal_enable_read_binding(uuid,uuid,uuid,bigint,text[])','EXECUTE')
 then raise exception 'fiscal privilege leak'; end if;
end $$;
set role service_role;
do $$
declare aid uuid; bid uuid; ok boolean; before_cursor bigint; actor uuid:='00000000-0000-0000-0000-000000000011'; org uuid:='00000000-0000-0000-0000-000000000002'; cnpj text:='00000000000001'; sha text:=repeat('a',64);
begin
 aid:=public.fiscal_store_provider_session(null,'CI account',6,'fake-ci-token',actor);
 if public.fiscal_read_provider_session(aid)<>'fake-ci-token' then raise exception 'session contract failed'; end if;
 if exists(select 1 from public.fiscal_provider_accounts where id=aid and is_active) then raise exception 'automatic activation'; end if;
 bid:=public.fiscal_enable_read_binding(aid,org,actor,1,array[cnpj,'00000000000002','00000000000003','00000000000004','00000000000005','00000000000006']);
 if (select count(*) from public.fiscal_account_cnpjs where account_id=aid)<>6 then raise exception 'quota count wrong'; end if;
 if (select count(*) from public.organization_modules where module_key='fiscal' and is_enabled)<>1 then raise exception 'cross tenant activation'; end if;
 if not exists(select 1 from public.fiscal_organization_bindings where id=bid and organization_id=org and is_enabled and not production_enabled and external_company_id is null) then raise exception 'read-only binding failed'; end if;
 begin
   perform public.fiscal_enable_read_binding(aid,'00000000-0000-0000-0000-000000000004',actor,1,array[cnpj]);
   raise exception 'expected duplicate binding rejection' using errcode='P1234';
 exception when raise_exception then null; end;
 begin
   perform public.fiscal_enable_read_binding(aid,org,actor,1,array[cnpj,'00000000000007']);
   raise exception 'expected quota rejection' using errcode='P1234';
 exception when raise_exception then null; end;
 ok:=public.fiscal_commit_capture_page(bid,org,aid,cnpj,'nfe','{}',0,5,
   jsonb_build_array(jsonb_build_object('providerId',5,'fiscalKey','test-key','sha256',sha,'storageKey',org::text||'/'||bid::text||'/nfe/5/'||sha||'.xml')));
 if ok is distinct from true then raise exception 'capture failed'; end if;
 ok:=public.fiscal_commit_capture_page(bid,org,aid,cnpj,'nfe','{}',0,5,
   jsonb_build_array(jsonb_build_object('providerId',5,'fiscalKey','test-key','sha256',sha,'storageKey',org::text||'/'||bid::text||'/nfe/5/'||sha||'.xml')));
 if ok is distinct from false then raise exception 'stale cursor accepted'; end if;
 select last_id into before_cursor from public.fiscal_sync_cursors where binding_id=bid and document_type='nfe' and filter_key='{}';
 if before_cursor<>5 then raise exception 'invalid cursor'; end if;
 perform public.fiscal_store_provider_session(aid,'CI account',6,'fake-rotated-token',actor);
 if public.fiscal_read_provider_session(aid)<>'fake-rotated-token' then raise exception 'rotation failed'; end if;
 begin
   perform public.fiscal_enable_read_binding(aid,org,actor,1,array[cnpj]);
   raise exception 'stale session revision accepted' using errcode='P1234';
 exception when raise_exception then null; end;
 begin
   perform public.fiscal_commit_capture_page(bid,org,aid,cnpj,'nfe','{}',5,6,
     jsonb_build_array(jsonb_build_object('providerId',6,'fiscalKey','other-key','sha256',sha,'storageKey',org::text||'/'||bid::text||'/nfe/6/'||sha||'.xml')));
   raise exception 'capture on inactive account' using errcode='P1234';
 exception when raise_exception then null; end;
end $$;
reset role;
insert into storage.objects(bucket_id) values('fiscal-originals'),('other-bucket');
set role authenticated;
do $$
begin
 if exists(select 1 from storage.objects where bucket_id='fiscal-originals') then raise exception 'private object visible'; end if;
 if not exists(select 1 from storage.objects where bucket_id='other-bucket') then raise exception 'unrelated bucket blocked'; end if;
end $$;
reset role;
select 'Fiscal candidate SQL fixture checks passed' as result;
