-- Central de Gestão Union: lixeira, versões, cofre cifrado, atividade e vínculo com tarefas.
-- Nunca armazene senhas em management_records.metadata ou em logs.
begin;

alter table public.management_records add column if not exists deleted_at timestamptz;
alter table public.management_records add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
alter table public.management_folders add column if not exists deleted_at timestamptz;
alter table public.management_folders add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
create index if not exists management_records_deleted_idx on public.management_records(space_id,deleted_at,folder_id);
create index if not exists management_folders_deleted_idx on public.management_folders(space_id,deleted_at,parent_id);

create table if not exists public.management_file_versions (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.management_records(id) on delete cascade,
 version_no int not null check(version_no>0),
 storage_path text not null,
 mime_type text,
 size_bytes bigint not null default 0 check(size_bytes>=0),
 created_by uuid references public.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 unique(record_id,version_no),
 unique(record_id,storage_path)
);
create index if not exists management_file_versions_record_idx on public.management_file_versions(record_id,version_no desc);
alter table public.management_file_versions enable row level security;
revoke all on public.management_file_versions from anon;
grant select,insert on public.management_file_versions to authenticated;
create policy management_versions_read on public.management_file_versions for select to authenticated
 using ((select private.has_platform_permission('platform.management.view')) or (select private.has_platform_permission('platform.management.manage')));
create policy management_versions_write on public.management_file_versions for insert to authenticated
 with check ((select private.has_platform_permission('platform.management.manage')));
-- Versões só são acrescentadas pela RPC register_management_file_version no aplicativo.
insert into public.management_file_versions(record_id,version_no,storage_path,mime_type,size_bytes,created_by,created_at)
select id,1,storage_path,mime_type,coalesce(size_bytes,0),created_by,created_at
from public.management_records where kind='file' and storage_path is not null
on conflict do nothing;

create table if not exists public.management_activity (
 id bigint generated always as identity primary key,
 space_id uuid not null references public.management_spaces(id) on delete cascade,
 entity_type text not null check(entity_type in ('space','folder','record','file','vault','work_item')),
 entity_id uuid not null,
 operation text not null check(char_length(operation) between 1 and 70),
 label text not null default '',
 actor_user_id uuid references public.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists management_activity_space_idx on public.management_activity(space_id,created_at desc);
alter table public.management_activity enable row level security;
revoke all on public.management_activity from anon;
grant select,insert on public.management_activity to authenticated;
create policy management_activity_read on public.management_activity for select to authenticated
 using ((select private.has_platform_permission('platform.management.view')) or (select private.has_platform_permission('platform.management.manage')));
create policy management_activity_insert on public.management_activity for insert to authenticated
 with check ((select private.has_platform_permission('platform.management.manage')) and actor_user_id=(select auth.uid()));
-- A trilha registra ações e títulos, NUNCA o conteúdo de segredos, dados antigos ou anotações.
create or replace function private.management_audit_trigger()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_space uuid; v_entity uuid; v_name text; v_operation text; v_type text;
begin
 if tg_table_name='management_spaces' then
   v_type:='space'; v_space:=coalesce(new.id,old.id); v_entity:=v_space;
   v_name:=coalesce(new.name,old.name);
 elsif tg_table_name='management_folders' then
   v_type:='folder'; v_space:=coalesce(new.space_id,old.space_id);
   v_entity:=coalesce(new.id,old.id); v_name:=coalesce(new.name,old.name);
 else
   v_type:='record'; v_space:=coalesce(new.space_id,old.space_id);
   v_entity:=coalesce(new.id,old.id); v_name:=coalesce(new.title,old.title);
 end if;
 v_operation:=case when tg_op='INSERT' then 'created' when tg_op='DELETE' then 'deleted'
   when tg_table_name='management_folders' and new.deleted_at is distinct from old.deleted_at then case when new.deleted_at is null then 'restored' else 'trashed' end
   when tg_table_name='management_records' and new.deleted_at is distinct from old.deleted_at then case when new.deleted_at is null then 'restored' else 'trashed' end
   else 'updated' end;
 insert into public.management_activity(space_id,entity_type,entity_id,operation,label)
 values(v_space,v_type,v_entity,v_operation,left(v_name,160));
 return coalesce(new,old);
end; $$;
revoke all on function private.management_audit_trigger() from public,anon,authenticated;
create trigger management_audit_spaces after insert or update or delete on public.management_spaces for each row execute function private.management_audit_trigger();
create trigger management_audit_folders after insert or update or delete on public.management_folders for each row execute function private.management_audit_trigger();
create trigger management_audit_records after insert or update or delete on public.management_records for each row execute function private.management_audit_trigger();

-- Exclusão lógica: preservar arquivos e versões para recuperação; pastas em cascata controlada.
create or replace function public.management_trash_folder(p_folder uuid, p_restore boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare v_space uuid; v_parent uuid;
begin
 if not private.has_platform_permission('platform.management.manage') then
   raise exception 'Sem permissão' using errcode='42501';
 end if;
 select space_id,parent_id into v_space,v_parent from public.management_folders where id=p_folder;
 if v_space is null then raise exception 'Pasta não encontrada'; end if;
 if p_restore and v_parent is not null and exists(
    select 1 from public.management_folders where id=v_parent and deleted_at is not null
 ) then raise exception 'Restaure a pasta superior primeiro'; end if;
 with recursive descendants as (
   select id from public.management_folders where id=p_folder
   union all select f.id from public.management_folders f
    join descendants d on f.parent_id=d.id
 ) update public.management_records r
 set deleted_at=case when p_restore then null else now() end,
     deleted_by=case when p_restore then null else (select auth.uid()) end
 where r.folder_id in (select id from descendants)
   and (p_restore=false or r.deleted_at is not null);
 with recursive descendants as (
   select id from public.management_folders where id=p_folder
   union all select f.id from public.management_folders f
     join descendants d on f.parent_id=d.id
 ) update public.management_folders f
 set deleted_at=case when p_restore then null else now() end,
     deleted_by=case when p_restore then null else (select auth.uid()) end
 where f.id in (select id from descendants);
end; $$;
revoke all on function public.management_trash_folder(uuid,boolean) from public,anon;
grant execute on function public.management_trash_folder(uuid,boolean) to authenticated;

create or replace function public.management_register_file_version(
 p_record uuid,p_path text,p_mime text,p_size bigint
) returns void language plpgsql security invoker set search_path='' as $$
declare v_record public.management_records%rowtype; v_version int;
begin
 if not private.has_platform_permission('platform.management.manage') then
   raise exception 'Sem permissão' using errcode='42501';
 end if;
 select * into v_record from public.management_records where id=p_record for update;
 if not found or v_record.kind <> 'file' or v_record.deleted_at is not null
   then raise exception 'Arquivo não encontrado'; end if;
 if p_path not like v_record.space_id::text||'/'||v_record.folder_id::text||'/%'
   or p_size<0 or p_size>26214400 then raise exception 'Arquivo inválido'; end if;
 select coalesce(max(version_no),0)+1 into v_version from public.management_file_versions where record_id=p_record;
 insert into public.management_file_versions(record_id,version_no,storage_path,mime_type,size_bytes)
 values(p_record,v_version,p_path,left(coalesce(p_mime,''),160),p_size);
 update public.management_records set storage_path=p_path,mime_type=left(coalesce(p_mime,''),160),size_bytes=p_size
 where id=p_record;
end; $$;
revoke all on function public.management_register_file_version(uuid,text,text,bigint) from public,anon;
grant execute on function public.management_register_file_version(uuid,text,text,bigint) to authenticated;

-- Metadados do cofre nunca armazenam a senha. A senha reside SOMENTE no Supabase Vault.
create table if not exists public.management_credentials (
 record_id uuid primary key references public.management_records(id) on delete cascade,
 secret_id uuid not null unique,
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.management_credentials enable row level security;
revoke all on public.management_credentials from public,anon,authenticated;
-- Não há SELECT direto: somente funções RPC verificadas.
create or replace function public.management_vault_has_secret(p_record uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not (
  private.has_platform_permission('platform.management.view')
  or private.has_platform_permission('platform.management.manage')
 ) then raise exception 'Sem permissão' using errcode='42501'; end if;
 return exists(select 1 from public.management_credentials c
    join public.management_records r on r.id=c.record_id
    where c.record_id=p_record and r.kind='account' and r.deleted_at is null);
end; $$;
create or replace function public.management_vault_write(p_record uuid,p_secret text)
returns void language plpgsql security definer set search_path='' as $$
declare v_record public.management_records%rowtype; v_secret uuid; v_prev uuid;
begin
 if (select auth.uid()) is null or not private.has_platform_permission('platform.management.manage') then
   raise exception 'Sem permissão' using errcode='42501'; end if;
 if p_secret is null or char_length(p_secret)<1 or char_length(p_secret)>4096 then
   raise exception 'Segredo inválido'; end if;
 select * into v_record from public.management_records where id=p_record and kind='account' and deleted_at is null for update;
 if not found then raise exception 'Conta não encontrada'; end if;
 select secret_id into v_prev from public.management_credentials where record_id=p_record;
 if v_prev is null then
   v_secret:=vault.create_secret(p_secret,'management-'||p_record::text,'Conta da Central de Gestão',null);
   insert into public.management_credentials(record_id,secret_id,updated_by)
   values(p_record,v_secret,(select auth.uid()));
 else
   perform vault.update_secret(v_prev,p_secret,null,null,null);
   update public.management_credentials set updated_by=(select auth.uid()), updated_at=now() where record_id=p_record;
 end if;
 insert into public.management_activity(space_id,entity_type,entity_id,operation,label,actor_user_id)
 values(v_record.space_id,'vault',p_record,'secret_saved','Credencial protegida',(select auth.uid()));
end; $$;
create or replace function public.management_vault_reveal(p_record uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_record public.management_records%rowtype; v_secret uuid; v_content text;
begin
 if (select auth.uid()) is null or not private.has_platform_permission('platform.management.manage') then
   raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into v_record from public.management_records where id=p_record and kind='account' and deleted_at is null;
 if not found then raise exception 'Conta não encontrada'; end if;
 select secret_id into v_secret from public.management_credentials where record_id=p_record;
 if v_secret is null then return null; end if;
 select decrypted_secret into v_content from vault.decrypted_secrets where id=v_secret;
 insert into public.management_activity(space_id,entity_type,entity_id,operation,label,actor_user_id)
 values(v_record.space_id,'vault',p_record,'secret_revealed','Credencial visualizada',(select auth.uid()));
 return v_content;
end; $$;
revoke all on function public.management_vault_has_secret(uuid) from public,anon;
revoke all on function public.management_vault_write(uuid,text) from public,anon;
revoke all on function public.management_vault_reveal(uuid) from public,anon;
grant execute on function public.management_vault_has_secret(uuid) to authenticated;
grant execute on function public.management_vault_write(uuid,text) to authenticated;
grant execute on function public.management_vault_reveal(uuid) to authenticated;

alter table public.work_items add column if not exists management_space_id uuid references public.management_spaces(id) on delete set null;
create index if not exists work_items_management_space_idx on public.work_items(management_space_id) where management_space_id is not null;
commit;
