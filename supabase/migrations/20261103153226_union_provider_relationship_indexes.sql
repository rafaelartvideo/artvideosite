begin;
create index if not exists platform_provider_attachments_provider_org_idx
 on public.platform_provider_attachments(provider_id,organization_id);
create index if not exists platform_provider_links_provider_org_idx
 on public.platform_provider_service_links(provider_id,organization_id);
create index if not exists platform_provider_links_service_org_idx
 on public.platform_provider_service_links(service_id,organization_id);
commit;