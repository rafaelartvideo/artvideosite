-- Lixeira da Central de Gestão: remoção definitiva via Storage API, com fila e cron.
-- Vault: segredo de execução guardado exclusivamente no banco; Edge valida antes de operar.
begin;
create table if not exists private.management_purge_jobs (
 id uuid primary key default gen_random_uuid(),
 target_kind text not null check(target_kind in ('record','folder')),
 target_id uuid not null,
 space_id uuid not null references public.management_spaces(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','processing','failed','done')),
 requested_by uuid references public.profiles(id) on delete set null,
 requested_at timestamptz not null default now(),
 claimed_at timestamptz,
 attempts int not null default 0,
 error_message text
);
create unique index if not exists management_purge_active_unique
 on private.management_purge_jobs(target_kind,target_id)
 where state in ('pending','processing');
create index if not exists management_purge_queue_idx
 on private.management_purge_jobs(state,requested_at);
alter table private.management_purge_jobs enable row level security;
revoke all on private.management_purge_jobs from public,anon,authenticated;
revoke all on private.management_purge_jobs from service_role;

-- A credencial do cron jamais é incluída na migração ou nos logs.
do $$
begin
 if not exists(select 1 from vault.secrets where name='management_purge_cron_token') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
     'management_purge_cron_token','Agendamento interno do expurgo da Central de Gestão',null);
 end if;
end $$;

create or replace function public.management_cleanup_token_valid(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
   raise exception 'Acesso restrito' using errcode='42501';
 end if;
 return p_token is not null and length(p_token)=64 and exists(
   select 1 from vault.decrypted_secrets where name='management_purge_cron_token' and decrypted_secret=p_token
 );
end; $$;
revoke all on function public.management_cleanup_token_valid(text) from public,anon,authenticated;
grant execute on function public.management_cleanup_token_valid(text) to service_role;

-- Retorna a quantidade de itens colocados na fila, respeitando permissão de gestão.
create or replace function public.management_enqueue_purge(
 p_kind text, p_id uuid default null, p_space uuid default null
) returns integer language plpgsql security definer set search_path='' as $$
declare v_count int:=0; v_space uuid;
begin
 if (select auth.uid()) is null or not private.has_platform_permission('platform.management.manage') then
   raise exception 'Sem permissão' using errcode='42501'; end if;
 if p_kind not in ('record','folder','all') then raise exception 'Operação inválida'; end if;
 if p_kind='record' then
   select space_id into v_space from public.management_records where id=p_id and deleted_at is not null;
   if v_space is null or (p_space is not null and p_space<>v_space) then raise exception 'Item não está na lixeira'; end if;
   if exists(select 1 from public.management_folders f join public.management_records r on r.folder_id=f.id
      where r.id=p_id and f.deleted_at is not null) then raise exception 'Remova a pasta superior pela lixeira'; end if;
   insert into private.management_purge_jobs(target_kind,target_id,space_id,requested_by)
    values('record',p_id,v_space,(select auth.uid())) on conflict do nothing;
   get diagnostics v_count=row_count;
 elsif p_kind='folder' then
   select space_id into v_space from public.management_folders where id=p_id and deleted_at is not null;
   if v_space is null or (p_space is not null and p_space<>v_space) then raise exception 'Pasta não está na lixeira'; end if;
   if exists(select 1 from public.management_folders f join public.management_folders p on p.id=f.parent_id
      where f.id=p_id and p.deleted_at is not null) then raise exception 'Remova a pasta superior pela lixeira'; end if;
   insert into private.management_purge_jobs(target_kind,target_id,space_id,requested_by)
    values('folder',p_id,v_space,(select auth.uid())) on conflict do nothing;
   get diagnostics v_count=row_count;
 else
   with add_folders as (
     insert into private.management_purge_jobs(target_kind,target_id,space_id,requested_by)
     select 'folder',f.id,f.space_id,(select auth.uid())
       from public.management_folders f
       where f.deleted_at is not null and (p_space is null or f.space_id=p_space)
       and not exists(select 1 from public.management_folders p where p.id=f.parent_id and p.deleted_at is not null)
     on conflict do nothing returning id
   ),add_records as (
     insert into private.management_purge_jobs(target_kind,target_id,space_id,requested_by)
     select 'record',r.id,r.space_id,(select auth.uid())
       from public.management_records r
       where r.deleted_at is not null and (p_space is null or r.space_id=p_space)
       and not exists(select 1 from public.management_folders f where f.id=r.folder_id and f.deleted_at is not null)
     on conflict do nothing returning id
   ) select (select count(*) from add_folders)+(select count(*) from add_records) into v_count;
 end if;
 return v_count;
end; $$;
revoke all on function public.management_enqueue_purge(text,uuid,uuid) from public,anon;
grant execute on function public.management_enqueue_purge(text,uuid,uuid) to authenticated;

create or replace function private.management_enqueue_expired()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
 with old_folders as (
  insert into private.management_purge_jobs(target_kind,target_id,space_id)
  select 'folder',f.id,f.space_id from public.management_folders f
  where f.deleted_at < now()-interval '7 days'
   and not exists(select 1 from public.management_folders p where p.id=f.parent_id and p.deleted_at is not null)
  on conflict do nothing returning id
 ), old_records as (
  insert into private.management_purge_jobs(target_kind,target_id,space_id)
  select 'record',r.id,r.space_id from public.management_records r
  where r.deleted_at < now()-interval '7 days'
   and not exists(select 1 from public.management_folders f where f.id=r.folder_id and f.deleted_at is not null)
  on conflict do nothing returning id
 ) select (select count(*) from old_folders)+(select count(*) from old_records) into v_count;
 return v_count;
end; $$;
revoke all on function private.management_enqueue_expired() from public,anon,authenticated,service_role;

-- Processador: só service_role. Recebe uma tarefa e lista arquivos sem remover banco antes de confirmar Storage.
create or replace function public.management_cleanup_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.management_purge_jobs%rowtype; v_paths jsonb:='[]'::jsonb;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
   raise exception 'Acesso restrito' using errcode='42501'; end if;
 -- Processar novamente tarefas interrompidas; falhas ficam em fila para retry com intervalo.
 select * into v_job from private.management_purge_jobs
 where (state='pending'
    or (state='processing' and claimed_at<now()-interval '10 minutes')
    or (state='failed' and requested_at<now()-interval '10 minutes'))
   and attempts<5
 order by requested_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update private.management_purge_jobs
 set state='processing',claimed_at=now(),attempts=attempts+1,error_message=null where id=v_job.id;
 if v_job.target_kind='record' then
   select coalesce(jsonb_agg(distinct p.path),'[]'::jsonb) into v_paths from (
      select storage_path as path from public.management_records where id=v_job.target_id and storage_path is not null
      union select v.storage_path from public.management_file_versions v where v.record_id=v_job.target_id
   ) p;
 else
   with recursive all_folders as (
     select id from public.management_folders where id=v_job.target_id
     union all select f.id from public.management_folders f join all_folders x on f.parent_id=x.id
   ), members as (
     select id,storage_path from public.management_records where folder_id in (select id from all_folders)
   ),paths as (
     select storage_path as path from members where storage_path is not null
     union select v.storage_path from public.management_file_versions v where v.record_id in (select id from members)
   ) select coalesce(jsonb_agg(distinct path),'[]'::jsonb) into v_paths from paths;
 end if;
 return jsonb_build_object('id',v_job.id,'kind',v_job.target_kind,'paths',v_paths);
end; $$;
revoke all on function public.management_cleanup_claim() from public,anon,authenticated;
grant execute on function public.management_cleanup_claim() to service_role;

create or replace function public.management_cleanup_complete(p_job uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_job private.management_purge_jobs%rowtype; v_folder record;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
   raise exception 'Acesso restrito' using errcode='42501'; end if;
 select * into v_job from private.management_purge_jobs where id=p_job and state='processing' for update;
 if not found then raise exception 'Processamento não encontrado'; end if;
 if not p_success then
   update private.management_purge_jobs set state='failed',requested_at=now(),
     error_message=left(coalesce(p_error,'Falha no Storage'),400),claimed_at=null where id=p_job;
   return;
 end if;
 if v_job.target_kind='record' then
   -- Evita excluir um item recuperado por outra sessão antes do processamento.
   if not exists(select 1 from public.management_records where id=v_job.target_id and deleted_at is not null) then
     update private.management_purge_jobs set state='done' where id=p_job;return;end if;
   delete from vault.secrets where id in (
     select secret_id from public.management_credentials where record_id=v_job.target_id);
   delete from public.management_records where id=v_job.target_id;
 else
   if not exists(select 1 from public.management_folders where id=v_job.target_id and deleted_at is not null) then
     update private.management_purge_jobs set state='done' where id=p_job;return;end if;
   with recursive all_folders as (
     select id from public.management_folders where id=v_job.target_id
     union all select f.id from public.management_folders f join all_folders x on f.parent_id=x.id
   ),members as (
     select id from public.management_records where folder_id in (select id from all_folders)
   ) delete from vault.secrets where id in (
     select secret_id from public.management_credentials where record_id in (select id from members));
   with recursive all_folders as (
     select id from public.management_folders where id=v_job.target_id
     union all select f.id from public.management_folders f join all_folders x on f.parent_id=x.id
   ) delete from public.management_records where folder_id in (select id from all_folders);
   for v_folder in
     with recursive all_folders as (
       select id,0 as depth from public.management_folders where id=v_job.target_id
       union all select f.id,x.depth+1 from public.management_folders f join all_folders x on f.parent_id=x.id
     ) select id from all_folders order by depth desc
   loop
     delete from public.management_folders where id=v_folder.id;
   end loop;
 end if;
 update private.management_purge_jobs set state='done',claimed_at=null where id=p_job;
end; $$;
revoke all on function public.management_cleanup_complete(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.management_cleanup_complete(uuid,boolean,text) to service_role;

-- Não restaurar itens que já entraram em remoção definitiva.
create or replace function private.management_block_restore_during_purge()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.deleted_at is not null and new.deleted_at is null and exists(
    select 1 from private.management_purge_jobs j
    where j.target_id=old.id and j.target_kind=case when tg_table_name='management_folders' then 'folder' else 'record' end
      and j.state in ('pending','processing')
 ) then raise exception 'Este item está em exclusão definitiva'; end if;
 return new;
end; $$;
revoke all on function private.management_block_restore_during_purge() from public,anon,authenticated;
create trigger management_record_restore_guard before update of deleted_at on public.management_records
 for each row execute function private.management_block_restore_during_purge();
create trigger management_folder_restore_guard before update of deleted_at on public.management_folders
 for each row execute function private.management_block_restore_during_purge();

-- Chamada privada ao Worker. Sem chave em arquivo, git, logs ou cron.command.
create or replace function private.management_purge_dispatch()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
 perform private.management_enqueue_expired();
 select decrypted_secret into v_token from vault.decrypted_secrets where name='management_purge_cron_token';
 if v_token is null then raise exception 'Token interno não configurado'; end if;
 return net.http_post(
   url:='https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/union-management-trash-cleanup',
   headers:=jsonb_build_object('Content-Type','application/json','X-Management-Cron-Token',v_token),
   body:='{"action":"scheduled"}'::jsonb,
   timeout_milliseconds:=60000
 );
end; $$;
revoke all on function private.management_purge_dispatch() from public,anon,authenticated,service_role;
select cron.schedule('union-management-trash-expire-7days','*/10 * * * *',
  'select private.management_purge_dispatch();');
commit;