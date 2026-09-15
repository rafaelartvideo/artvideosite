alter policy registration_files_select
on storage.objects
using (
  bucket_id = 'registration-files'
  and exists (
    select 1
    from public.organizations o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and (
        private.has_effective_organization_permission(o.id, 'registrations.records.view')
        or private.has_effective_organization_permission(o.id, 'registrations.records.create')
      )
  )
);

alter policy registration_files_insert
on storage.objects
with check (
  bucket_id = 'registration-files'
  and exists (
    select 1
    from public.organizations o
    where o.id::text = (storage.foldername(storage.objects.name))[1]
      and private.has_effective_organization_permission(o.id, 'registrations.records.create')
  )
);
