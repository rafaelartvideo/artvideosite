-- Restaurar uma pasta não pode ressuscitar registros previamente excluídos à parte.
begin;
alter table public.management_records add column if not exists deleted_batch_id uuid;
alter table public.management_folders add column if not exists deleted_batch_id uuid;
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
 if p_restore then
   with recursive descendants as (
     select id from public.management_folders where id=p_folder
     union all select f.id from public.management_folders f join descendants d on f.parent_id=d.id
   ) update public.management_records r
     set deleted_at=null,deleted_by=null,deleted_batch_id=null
     where r.folder_id in (select id from descendants) and r.deleted_batch_id=p_folder;
   with recursive descendants as (
     select id from public.management_folders where id=p_folder
     union all select f.id from public.management_folders f join descendants d on f.parent_id=d.id
   ) update public.management_folders f
     set deleted_at=null,deleted_by=null,deleted_batch_id=null
     where f.id in (select id from descendants) and f.deleted_batch_id=p_folder;
 else
   with recursive descendants as (
     select id from public.management_folders where id=p_folder
     union all select f.id from public.management_folders f join descendants d on f.parent_id=d.id
   ) update public.management_records r
     set deleted_at=now(),deleted_by=(select auth.uid()),deleted_batch_id=p_folder
     where r.folder_id in (select id from descendants) and r.deleted_at is null;
   with recursive descendants as (
     select id from public.management_folders where id=p_folder
     union all select f.id from public.management_folders f join descendants d on f.parent_id=d.id
   ) update public.management_folders f
     set deleted_at=now(),deleted_by=(select auth.uid()),deleted_batch_id=p_folder
     where f.id in (select id from descendants) and f.deleted_at is null;
 end if;
end; $$;
revoke all on function public.management_trash_folder(uuid,boolean) from public,anon;
grant execute on function public.management_trash_folder(uuid,boolean) to authenticated;
commit;