begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-files', 'registration-files', false, 20971520, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.entity_record_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  record_id uuid not null references public.entity_records(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  unique (record_id, media_id)
);

create index if not exists entity_record_media_org_record_idx
  on public.entity_record_media(organization_id, record_id, created_at);
create index if not exists entity_record_media_media_idx
  on public.entity_record_media(media_id);

alter table public.entity_record_media enable row level security;
revoke all on table public.entity_record_media from anon, authenticated;
grant select, insert on table public.entity_record_media to authenticated;

drop policy if exists entity_record_media_select on public.entity_record_media;
drop policy if exists entity_record_media_insert on public.entity_record_media;
drop policy if exists entity_record_media_update on public.entity_record_media;
drop policy if exists entity_record_media_delete on public.entity_record_media;

create policy entity_record_media_select
on public.entity_record_media
for select
to authenticated
using (
  (
    private.has_effective_organization_permission(organization_id, 'registrations.records.view')
    or private.has_effective_organization_permission(organization_id, 'registrations.records.create')
  )
  and exists (
    select 1
    from public.entity_records r
    where r.id = entity_record_media.record_id
      and r.organization_id = entity_record_media.organization_id
  )
);

create policy entity_record_media_insert
on public.entity_record_media
for insert
to authenticated
with check (
  private.has_effective_organization_permission(organization_id, 'registrations.records.create')
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.entity_records r
    where r.id = entity_record_media.record_id
      and r.organization_id = entity_record_media.organization_id
  )
  and exists (
    select 1
    from public.media m
    where m.id = entity_record_media.media_id
      and m.organization_id = entity_record_media.organization_id
      and m.bucket_id = 'registration-files'
  )
);

drop policy if exists registration_files_select on storage.objects;
drop policy if exists registration_files_insert on storage.objects;
drop policy if exists registration_files_update on storage.objects;
drop policy if exists registration_files_delete on storage.objects;

create policy registration_files_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'registration-files'
  and exists (
    select 1
    from public.organizations o
    where o.id::text = (storage.foldername(name))[1]
      and (
        private.has_effective_organization_permission(o.id, 'registrations.records.view')
        or private.has_effective_organization_permission(o.id, 'registrations.records.create')
      )
  )
);

create policy registration_files_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'registration-files'
  and exists (
    select 1
    from public.organizations o
    where o.id::text = (storage.foldername(name))[1]
      and private.has_effective_organization_permission(o.id, 'registrations.records.create')
  )
);

commit;
