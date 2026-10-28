-- Central de Gestão: acervo interno da organização operadora Union World.
-- Espaços de projetos NÃO são tenants nem concedem acesso a dados das parceiras.
begin;

insert into public.permissions (key, label, description, module_name, sort_order) values
 ('platform.management.view', 'Visualizar Central de Gestão', 'Consultar espaços e conteúdo do acervo interno.', 'Central de Gestão', 985),
 ('platform.management.manage', 'Gerenciar Central de Gestão', 'Criar e editar espaços, pastas, registros e arquivos do acervo interno.', 'Central de Gestão', 986)
on conflict (key) do update set label=excluded.label, description=excluded.description, module_name=excluded.module_name, sort_order=excluded.sort_order;

-- Mantém a nova permissão restrita ao operador da plataforma.
create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean language sql immutable set search_path to '' as $$
 select (p_key like 'organizations.%' and p_key <> 'organizations.audit.view')
 or p_key like 'integrations.%' or p_key like 'audit.%'
 or p_key like 'orders.monitor.%' or p_key like 'platform.billing.%'
 or p_key like 'platform.announcements.%' or p_key like 'platform.management.%';
$$;
revoke all on function private.is_platform_only_permission_key(text) from public;

insert into public.role_permissions (role_id,permission_id)
select distinct src.role_id, dst.id
from public.role_permissions src
join public.permissions existing on existing.id=src.permission_id
join public.roles r on r.id=src.role_id
cross join public.permissions dst
where r.organization_id=public.platform_operator_organization_id()
  and ((existing.key='organizations.view' and dst.key='platform.management.view')
    or (existing.key='organizations.edit' and dst.key in ('platform.management.view','platform.management.manage')))
on conflict (role_id,permission_id) do nothing;

create table public.management_spaces (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 name text not null check (char_length(btrim(name)) between 1 and 100),
 description text not null default '',
 icon_text text not null default '' check (char_length(icon_text) <= 6),
 accent_color text not null default '#1032DC' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
 is_archived boolean not null default false,
 created_by uuid references public.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.management_folders (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.management_spaces(id) on delete cascade,
 parent_id uuid,
 name text not null check (char_length(btrim(name)) between 1 and 100),
 created_by uuid references public.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (id,space_id),
 foreign key (parent_id,space_id) references public.management_folders(id,space_id) on delete restrict,
 check (parent_id is null or parent_id <> id)
);
create unique index management_folders_sibling_unique on public.management_folders(space_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
create index management_folders_parent_idx on public.management_folders(space_id,parent_id);

create table public.management_records (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.management_spaces(id) on delete cascade,
 folder_id uuid not null,
 title text not null check (char_length(btrim(title)) between 1 and 160),
 kind text not null check (kind in ('note','account','website','campaign','link','file')),
 description text not null default '',
 url text,
 metadata jsonb not null default '{}'::jsonb,
 storage_path text,
 mime_type text,
 size_bytes bigint check (size_bytes is null or size_bytes >= 0),
 created_by uuid references public.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (folder_id,space_id) references public.management_folders(id,space_id) on delete restrict,
 check ((kind='file' and storage_path is not null) or (kind<>'file' and storage_path is null)),
 check (storage_path is null or storage_path like space_id::text || '/%')
);
create index management_records_folder_idx on public.management_records(space_id,folder_id,created_at desc);
create index management_records_title_idx on public.management_records(space_id,title);

-- Não expor nada a visitantes ou membros apenas por serem autenticados.
alter table public.management_spaces enable row level security;
alter table public.management_folders enable row level security;
alter table public.management_records enable row level security;
revoke all on public.management_spaces, public.management_folders, public.management_records from anon;
grant select,insert,update,delete on public.management_spaces, public.management_folders, public.management_records to authenticated;

create policy management_spaces_read on public.management_spaces for select to authenticated
 using ((select private.has_platform_permission('platform.management.view')) or (select private.has_platform_permission('platform.management.manage')));
create policy management_spaces_create on public.management_spaces for insert to authenticated
 with check ((select private.has_platform_permission('platform.management.manage')));
create policy management_spaces_update on public.management_spaces for update to authenticated
 using ((select private.has_platform_permission('platform.management.manage')))
 with check ((select private.has_platform_permission('platform.management.manage')));
create policy management_spaces_delete on public.management_spaces for delete to authenticated
 using ((select private.has_platform_permission('platform.management.manage')));

create policy management_folders_read on public.management_folders for select to authenticated
 using ((select private.has_platform_permission('platform.management.view')) or (select private.has_platform_permission('platform.management.manage')));
create policy management_folders_create on public.management_folders for insert to authenticated
 with check ((select private.has_platform_permission('platform.management.manage')));
create policy management_folders_update on public.management_folders for update to authenticated
 using ((select private.has_platform_permission('platform.management.manage')))
 with check ((select private.has_platform_permission('platform.management.manage')));
create policy management_folders_delete on public.management_folders for delete to authenticated
 using ((select private.has_platform_permission('platform.management.manage')));

create policy management_records_read on public.management_records for select to authenticated
 using ((select private.has_platform_permission('platform.management.view')) or (select private.has_platform_permission('platform.management.manage')));
create policy management_records_create on public.management_records for insert to authenticated
 with check ((select private.has_platform_permission('platform.management.manage')));
create policy management_records_update on public.management_records for update to authenticated
 using ((select private.has_platform_permission('platform.management.manage')))
 with check ((select private.has_platform_permission('platform.management.manage')));
create policy management_records_delete on public.management_records for delete to authenticated
 using ((select private.has_platform_permission('platform.management.manage')));

create or replace function private.management_touch()
returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at := now(); return new; end; $$;
revoke all on function private.management_touch() from public,anon,authenticated;
create trigger management_spaces_touch before update on public.management_spaces for each row execute function private.management_touch();
create trigger management_folders_touch before update on public.management_folders for each row execute function private.management_touch();
create trigger management_records_touch before update on public.management_records for each row execute function private.management_touch();

-- Acervo privado; o app gera URL assinada para download, não link público.
insert into storage.buckets (id,name,public,file_size_limit)
values ('union-management','union-management',false,26214400)
on conflict (id) do update set public=false, file_size_limit=26214400;
create policy management_assets_read on storage.objects for select to authenticated
 using (bucket_id='union-management' and ((select private.has_platform_permission('platform.management.view')) or (select private.has_platform_permission('platform.management.manage'))));
create policy management_assets_write on storage.objects for insert to authenticated
 with check (bucket_id='union-management' and (select private.has_platform_permission('platform.management.manage')));
create policy management_assets_edit on storage.objects for update to authenticated
 using (bucket_id='union-management' and (select private.has_platform_permission('platform.management.manage')))
 with check (bucket_id='union-management' and (select private.has_platform_permission('platform.management.manage')));
create policy management_assets_delete on storage.objects for delete to authenticated
 using (bucket_id='union-management' and (select private.has_platform_permission('platform.management.manage')));

-- Estes são espaços de projeto da Union, sem vínculo obrigatório com organizations.
insert into public.management_spaces (slug,name,description,icon_text,accent_color) values
 ('artvideo','Artvideo','Eletrônica e assistência técnica','AV','#1032DC'),
 ('cti','CTI','Centro Técnico Integrado','CTI','#9A6A32'),
 ('union','Union World','Plataforma Union World','U','#263C83')
on conflict (slug) do nothing;

insert into public.management_folders(space_id,name)
select s.id, item.name from public.management_spaces s
cross join (values ('Contas e acessos'),('Sites e domínios'),('Imagens e mídias'),('Arquivos'),('Campanhas'),('Documentos'),('Projetos')) as item(name)
where s.slug in ('artvideo','cti','union')
on conflict do nothing;

commit;
