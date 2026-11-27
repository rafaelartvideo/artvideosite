-- Candidate migration; verify existing storage policies and test in staging.
begin;
insert into storage.buckets(id,name,public,file_size_limit)
values('fiscal-originals','fiscal-originals',false,10485760);
-- Restrictive policies prevent broad permissive policies elsewhere in this CRM
-- from granting direct browser access to the fiscal bucket.
create policy fiscal_originals_no_direct_client_access
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'fiscal-originals')
with check (bucket_id <> 'fiscal-originals');
create policy fiscal_bucket_no_direct_client_access
on storage.buckets as restrictive for all to anon, authenticated
using (id <> 'fiscal-originals')
with check (id <> 'fiscal-originals');
commit;
