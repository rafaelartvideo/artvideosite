begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('quote-images','quote-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.quote_media (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bucket_id text not null default 'quote-images' check (bucket_id='quote-images'),
  storage_path text not null unique,
  file_name text not null,
  kind text not null default 'equipment' check (kind in ('equipment','label','site')),
  created_at timestamptz not null default now()
);
create index if not exists quote_media_quote_idx on public.quote_media(organization_id,quote_request_id);
alter table public.quote_media enable row level security;

create policy quote_media_read on public.quote_media for select to authenticated using (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','read')
  and private.has_effective_organization_permission(organization_id,'quotes.view')
  and exists (select 1 from public.quote_requests q where q.id=quote_request_id and q.organization_id=organization_id)
);
create policy quote_media_insert on public.quote_media for insert to authenticated with check (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','manage')
  and (private.has_effective_organization_permission(organization_id,'quotes.create') or private.has_effective_organization_permission(organization_id,'quotes.edit') or private.has_effective_organization_permission(organization_id,'quotes.update'))
  and exists (select 1 from public.quote_requests q where q.id=quote_request_id and q.organization_id=organization_id and q.origin='internal')
);
create policy quote_media_delete on public.quote_media for delete to authenticated using (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','manage')
  and (private.has_effective_organization_permission(organization_id,'quotes.edit') or private.has_effective_organization_permission(organization_id,'quotes.update'))
  and exists (select 1 from public.quote_requests q where q.id=quote_request_id and q.organization_id=organization_id and q.origin='internal')
);
grant select,insert,delete on public.quote_media to authenticated;

create policy quote_images_read on storage.objects for select to authenticated using (
  bucket_id='quote-images' and name ~ '^quotes/[0-9a-f-]{36}/[0-9a-f-]{36}/'
  and private.is_organization_module_enabled(split_part(name,'/',2)::uuid,'quotes')
  and private.can_access_shared_organization_resource(split_part(name,'/',2)::uuid,'quotes','read')
  and private.has_effective_organization_permission(split_part(name,'/',2)::uuid,'quotes.view')
);
create policy quote_images_insert on storage.objects for insert to authenticated with check (
  bucket_id='quote-images' and name ~ '^quotes/[0-9a-f-]{36}/[0-9a-f-]{36}/'
  and private.is_organization_module_enabled(split_part(name,'/',2)::uuid,'quotes')
  and private.can_access_shared_organization_resource(split_part(name,'/',2)::uuid,'quotes','manage')
  and (private.has_effective_organization_permission(split_part(name,'/',2)::uuid,'quotes.create') or private.has_effective_organization_permission(split_part(name,'/',2)::uuid,'quotes.edit'))
  and exists (
    select 1 from public.quote_requests q where q.id=split_part(name,'/',3)::uuid
      and q.organization_id=split_part(name,'/',2)::uuid and q.origin='internal'
  )
);
create policy quote_images_delete on storage.objects for delete to authenticated using (
  bucket_id='quote-images' and name ~ '^quotes/[0-9a-f-]{36}/[0-9a-f-]{36}/'
  and private.can_access_shared_organization_resource(split_part(name,'/',2)::uuid,'quotes','manage')
  and (private.has_effective_organization_permission(split_part(name,'/',2)::uuid,'quotes.edit') or private.has_effective_organization_permission(split_part(name,'/',2)::uuid,'quotes.update'))
);
commit;