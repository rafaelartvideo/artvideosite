begin;
drop policy if exists platform_provider_files_insert on storage.objects;
create policy platform_provider_files_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'platform-provider-documents'
  and (storage.foldername(storage.objects.name))[1] = (select public.platform_operator_organization_id()::text)
  and (select private.has_organization_permission(public.platform_operator_organization_id(), 'platform.providers.manage'))
  and exists (
    select 1 from public.platform_service_providers provider
    where provider.id::text = (storage.foldername(storage.objects.name))[2]
      and provider.organization_id = (select public.platform_operator_organization_id())
  )
);
commit;