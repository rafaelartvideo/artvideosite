-- Storage catalog shell for disposable PostgreSQL only; no actual blob operations.
\set ON_ERROR_STOP on
create schema storage;
create table storage.buckets(
 id text primary key,name text not null,public boolean not null default false,
 file_size_limit bigint,allowed_mime_types text[]
);
create table storage.objects(
 id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),
 name text not null,metadata jsonb,owner_id text,unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated,service_role;
grant all on storage.buckets to service_role;
-- Deliberately broad pre-existing policy: bucket-specific restrictive guards
-- must still enforce isolation and prevent overwrites after the migration.
create policy storage_existing_broad_policy on storage.objects for all to authenticated
 using(true) with check(true);
