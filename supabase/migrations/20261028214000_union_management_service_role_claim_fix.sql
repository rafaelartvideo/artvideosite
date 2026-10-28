-- Supabase PostgREST usa request.jwt.claims (JSON), não request.jwt.claim.role.
begin;
create or replace function public.management_cleanup_token_valid(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
   raise exception 'Acesso restrito' using errcode='42501';
 end if;
 return p_token is not null and length(p_token)=64 and exists(
   select 1 from vault.decrypted_secrets where name='management_purge_cron_token' and decrypted_secret=p_token
 );
end; $$;

create or replace function public.management_cleanup_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.management_purge_jobs%rowtype; v_paths jsonb:='[]'::jsonb;
begin
 if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
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

create or replace function public.management_cleanup_complete(p_job uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_job private.management_purge_jobs%rowtype; v_folder record;
begin
 if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
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
commit;
