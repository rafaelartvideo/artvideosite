-- Existing authorized ramals keep their browser authorization while an operational
-- revision is awaiting acknowledgment. New grants wait for the applied document.
alter table private.pbx_universal_configs add column if not exists applied_document jsonb;
update private.pbx_universal_configs set applied_document=document where status='applied' and applied_revision=revision;
create or replace function private.pbx_capture_applied_universal_document() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.status='applied' and new.applied_revision=new.revision then new.applied_document:=new.document;end if;
 return new;
end;$$;
drop trigger if exists pbx_capture_applied_universal_document on private.pbx_universal_configs;
create trigger pbx_capture_applied_universal_document before insert or update on private.pbx_universal_configs for each row execute function private.pbx_capture_applied_universal_document();
revoke all on function private.pbx_capture_applied_universal_document() from public,anon,authenticated,service_role;
do $migration$
declare body text:=pg_get_functiondef('private.pbx_can_dial_external(uuid,text)'::regprocedure);
old_gate text:=$old$and cfg.status='applied' and cfg.applied_revision=cfg.revision$old$;
new_gate text:=$new$and ((cfg.status='applied' and cfg.applied_revision=cfg.revision)
    or (cfg.status='pending' and cfg.applied_revision<cfg.revision and private.pbx_hot_groups_ready(cfg.organization_id)
     and cfg.applied_document->'routing_enabled'='true'::jsonb
     and (cfg.document-'groups')=(cfg.applied_document-'groups')
     and private.pbx_group_operational_shape(cfg.document->'groups')=private.pbx_group_operational_shape(cfg.applied_document->'groups')
     and exists(select 1 from jsonb_array_elements(cfg.applied_document->'outbound_routes') old_route
       join jsonb_array_elements(cfg.applied_document->'groups') old_group on old_group->>'id'=old_route->>'group_id'
       where old_route->'enabled'='true'::jsonb and old_group->'enabled'='true'::jsonb and old_group->'extension_ids' ? e.id::text)))$new$;
begin
 if strpos(body,old_gate)=0 then raise exception 'Unexpected external dialer authorization version';end if;
 execute replace(body,old_gate,new_gate);
end
$migration$;
