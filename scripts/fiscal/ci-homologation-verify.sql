-- Disposable CI only. The prior capture tests create a pilot binding.
do $$
begin
 if has_table_privilege('authenticated','public.fiscal_homologation_operations','SELECT') or
    has_table_privilege('anon','public.fiscal_homologation_issuers','SELECT')
 then raise exception 'homologation privilege leak'; end if;
end $$;
set role service_role;
do $$
declare b public.fiscal_organization_bindings%rowtype; op uuid; k uuid; actor uuid:='00000000-0000-0000-0000-000000000011';
begin
 select * into strict b from public.fiscal_organization_bindings limit 1;
 insert into public.fiscal_homologation_issuers(binding_id,organization_id,account_id,cnpj,external_company_id,session_revision,verified_by,identity_source)
 values(b.id,b.organization_id,b.account_id,b.cnpj,2541,2,actor,'single_company_panel');
 insert into public.fiscal_homologation_operations(binding_id,organization_id,account_id,cnpj,external_company_id,session_revision,request_key,profile_id,profile_version,payload,created_by)
 values(b.id,b.organization_id,b.account_id,b.cnpj,2541,2,gen_random_uuid(),'7','2','{"model":"55"}',actor)
 returning id,issue_key into op,k;
 begin
   insert into public.fiscal_homologation_operations(binding_id,organization_id,account_id,cnpj,external_company_id,session_revision,request_key,profile_id,profile_version,payload,created_by)
   values(b.id,b.organization_id,b.account_id,b.cnpj,2541,2,gen_random_uuid(),'7','2','{"model":"55"}',actor);
   raise exception 'second open operation accepted' using errcode='P1234';
 exception when unique_violation then null; end;
 begin
   update public.fiscal_homologation_operations set environment=1 where id=op;
   raise exception 'production environment accepted' using errcode='P1234';
 exception when check_violation then null; end;
 begin
   update public.fiscal_homologation_operations set state='authorized' where id=op;
   raise exception 'authorization without protocol accepted' using errcode='P1234';
 exception when check_violation then null; end;
 update public.fiscal_homologation_operations set state='create_uncertain' where id=op and state='prepared';
 if not exists(select 1 from public.fiscal_homologation_operations where id=op and issue_key=k and state='create_uncertain') then
 raise exception 'uncertain state lost'; end if;
end $$;
reset role;
select 'Homologation ledger SQL checks passed' as result;
