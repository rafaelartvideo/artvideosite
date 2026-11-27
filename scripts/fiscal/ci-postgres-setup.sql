-- ONLY for the disposable PostgreSQL CI service. Never run against Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema private;
create schema storage;
create schema vault;
grant usage on schema public,private to service_role;
create table public.organizations(id uuid primary key,name text,document text,status text not null,settings jsonb not null default '{}');
create table public.profiles(id uuid primary key,is_active boolean not null);
create table public.organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id),user_id uuid,status text);
create table public.system_modules(key text primary key,name text,description text,category text check(category in ('management','operation','site')),sort_order integer,is_active boolean);
create table public.permissions(id uuid primary key default gen_random_uuid(),key text unique,label text,description text,module_name text,sort_order integer);
create table public.organization_modules(organization_id uuid references public.organizations(id),module_key text references public.system_modules(key),is_enabled boolean,enabled_by uuid,enabled_at timestamptz,updated_at timestamptz default now(),primary key(organization_id,module_key));
grant select,insert,update on public.organizations,public.profiles,public.organization_members,public.organization_modules to service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects,storage.buckets to anon,authenticated,service_role;
create policy stub_existing_broad_object_access on storage.objects for all to authenticated using(true) with check(true);
create policy stub_existing_broad_bucket_access on storage.buckets for all to authenticated using(true) with check(true);
-- Mock Vault signatures for SQL integration tests, NOT a cryptographic test.
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(p_secret text,p_name text,p_description text) returns uuid language sql as $$
 insert into vault.secrets(name,secret) values(p_name,p_secret) returning id
$$;
create function vault.update_secret(p_id uuid,p_secret text) returns void language sql as $$
 update vault.secrets set secret=p_secret where id=p_id
$$;
insert into public.organizations(id,name,document,status,settings) values
('00000000-0000-0000-0000-000000000001','Platform',null,'active','{"is_platform_operator":true}'),
('00000000-0000-0000-0000-000000000002','Pilot','00.000.000/0000-01','active','{}'),
('00000000-0000-0000-0000-000000000003','Other','00000000000002','active','{}'),
('00000000-0000-0000-0000-000000000004','Conflicting tenant','00000000000001','active','{}');
insert into public.profiles values('00000000-0000-0000-0000-000000000011',true);
insert into public.organization_members(organization_id,user_id,status) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','active');
