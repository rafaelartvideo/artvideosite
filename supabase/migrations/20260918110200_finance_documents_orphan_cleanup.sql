begin;

drop policy if exists financial_documents_delete_orphan on storage.objects;
create policy financial_documents_delete_orphan
on storage.objects
for delete
to authenticated
using (
  bucket_id='financial-documents'
  and exists(
    select 1 from public.organizations o
    where o.id::text=(storage.foldername(name))[1]
      and private.can_access_finance(o.id,'finance.documents.manage')
  )
  and not exists(
    select 1 from public.financial_attachments a
    where a.storage_path=storage.objects.name
  )
);

commit;
