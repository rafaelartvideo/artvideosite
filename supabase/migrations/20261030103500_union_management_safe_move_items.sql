-- Movimentação segura de pastas e registros na Central de Gestão.
-- Apenas dentro do mesmo espaço; sem mover itens excluídos ou criar ciclos.
begin;

create or replace function private.management_guard_folder_move()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_valid boolean;
  v_cycle boolean;
begin
  if new.parent_id is not distinct from old.parent_id
    and new.space_id is not distinct from old.space_id then
    return new;
  end if;
  if new.space_id is distinct from old.space_id then
    raise exception 'Não é possível mover pastas entre espaços';
  end if;
  if old.deleted_at is not null then
    raise exception 'Restaure a pasta antes de movê-la';
  end if;
  -- Serializa reorganizações do mesmo espaço para impedir ciclos por concorrência.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('management-folders-' || new.space_id::text, 0)
  );
  if new.parent_id is not null then
    select exists(
      select 1 from public.management_folders f
      where f.id = new.parent_id and f.space_id = new.space_id and f.deleted_at is null
    ) into v_valid;
    if not v_valid then
      raise exception 'A pasta de destino não existe ou está na lixeira';
    end if;
    with recursive ancestors(id,parent_id,visited) as (
      select f.id, f.parent_id, array[f.id]
      from public.management_folders f where f.id = new.parent_id
      union all
      select f.id, f.parent_id, a.visited || f.id
      from ancestors a join public.management_folders f on f.id = a.parent_id
      where not (f.id = any(a.visited))
    )
    select exists(select 1 from ancestors where id = new.id) into v_cycle;
    if v_cycle then
      raise exception 'Não é possível mover uma pasta para dentro dela mesma ou de suas subpastas';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.management_guard_folder_move() from public, anon, authenticated;
drop trigger if exists management_folders_move_guard on public.management_folders;
create trigger management_folders_move_guard
before update of parent_id, space_id on public.management_folders
for each row execute function private.management_guard_folder_move();

create or replace function private.management_guard_record_move()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.folder_id is not distinct from old.folder_id
    and new.space_id is not distinct from old.space_id then
    return new;
  end if;
  if new.space_id is distinct from old.space_id then
    raise exception 'Não é possível mover registros entre espaços';
  end if;
  if old.deleted_at is not null then
    raise exception 'Restaure o registro antes de movê-lo';
  end if;
  if not exists(
    select 1 from public.management_folders f
    where f.id = new.folder_id and f.space_id = new.space_id and f.deleted_at is null
  ) then
    raise exception 'A pasta de destino não existe ou está na lixeira';
  end if;
  return new;
end;
$$;
revoke all on function private.management_guard_record_move() from public, anon, authenticated;
drop trigger if exists management_records_move_guard on public.management_records;
create trigger management_records_move_guard
before update of folder_id, space_id on public.management_records
for each row execute function private.management_guard_record_move();

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
 v_operation := case when tg_op='INSERT' then 'created'
                     when tg_op='DELETE' then 'deleted'
                     else 'updated' end;
 if tg_op='UPDATE' then
   if tg_table_name='management_folders' then
     if new.deleted_at is distinct from old.deleted_at then
       v_operation:=case when new.deleted_at is null then 'restored' else 'trashed' end;
     elsif new.parent_id is distinct from old.parent_id then
       v_operation:='moved';
     end if;
   elsif tg_table_name='management_records' then
     if new.deleted_at is distinct from old.deleted_at then
       v_operation:=case when new.deleted_at is null then 'restored' else 'trashed' end;
     elsif new.folder_id is distinct from old.folder_id then
       v_operation:='moved';
     end if;
   end if;
 end if;
 insert into public.management_activity(space_id,entity_type,entity_id,operation,label)
 values(v_space,v_type,v_entity,v_operation,left(v_name,160));
 return coalesce(new,old);
end; $$;
revoke all on function private.management_audit_trigger() from public,anon,authenticated;
commit;
