-- The dialer is a permission hint, not a call admission decision. Keep the
-- last confirmed UI authorization during a transient capability downgrade.
-- Native endpoint ACLs, manifest lease and atomic quota remain mandatory.
do $migration$
declare body text:=pg_get_functiondef('private.pbx_can_dial_external(uuid,text)'::regprocedure);
old_gate text:=$old$and private.pbx_universal_ready(cfg.agent_id) and private.pbx_universal_capacity_ready(cfg.document)$old$;
new_gate text:=$new$and exists(select 1 from public.pbx_agents agent
    join private.pbx_universal_capabilities cap on cap.agent_id=agent.id
    where agent.id=cfg.agent_id and agent.organization_id=cfg.organization_id
      and cap.organization_id=cfg.organization_id and agent.enabled and cap.enabled
      and cap.seen_at between now()-interval '90 seconds' and now()+interval '5 seconds')
   and private.pbx_universal_capacity_ready(cfg.document)$new$;
begin
 if strpos(body,old_gate)=0 then raise exception 'Unexpected universal dialer permission gate';end if;
 execute replace(body,old_gate,new_gate);
end
$migration$;
