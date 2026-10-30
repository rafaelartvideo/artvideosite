-- Corrige trilha de auditoria compartilhada: cada tabela possui colunas próprias.
begin;
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