-- UI authorization hint; native endpoint permissions and atomic capacity
-- admission continue to enforce every actual call locally in Asterisk.
create or replace function private.pbx_can_dial_external(p_organization_id uuid,p_endpoint_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or p_endpoint_name is null
  or private.is_platform_organization(p_organization_id)
  or not private.pbx_has_permission(p_organization_id,'pbx.view') then return false; end if;
 return exists(
  select 1 from private.pbx_my_assigned_extension(p_organization_id) mine
  join public.pbx_extensions e on e.organization_id=p_organization_id
   and e.endpoint_name=mine.endpoint_name and e.number=mine.number
  join public.pbx_sip_trunk_configs t on t.organization_id=e.organization_id and e.id=any(t.allowed_extension_ids)
  where mine.endpoint_name=p_endpoint_name and e.is_managed and e.desired_enabled and e.provisioning_status='applied'
   and t.enabled and t.status='applied' and private.pbx_sip_agent_ready(t.agent_id))
 or exists(
  select 1 from private.pbx_my_assigned_extension(p_organization_id) mine
  join public.pbx_extensions e on e.organization_id=p_organization_id
   and e.endpoint_name=mine.endpoint_name and e.number=mine.number
  join private.pbx_universal_configs cfg on cfg.organization_id=e.organization_id
  left join private.pbx_extension_call_modes m on m.organization_id=e.organization_id and m.extension_id=e.id
  where mine.endpoint_name=p_endpoint_name and e.is_managed and e.desired_enabled and e.provisioning_status='applied'
   and coalesce(m.external_mode,'both')<>'receive_only' and coalesce(m.applied_external_mode,'both')<>'receive_only'
   and cfg.document->'routing_enabled'='true'::jsonb
   and cfg.status='applied' and cfg.applied_revision=cfg.revision
   and private.pbx_universal_ready(cfg.agent_id) and private.pbx_universal_capacity_ready(cfg.document)
   and cfg.observed_at between now()-interval '90 seconds' and now()+interval '5 seconds'
   and cfg.observed->'ready'='true'::jsonb and cfg.observed->'legacy_coverage'='true'::jsonb
   and exists(
    select 1 from jsonb_array_elements(cfg.document->'outbound_routes') route
    join jsonb_array_elements(cfg.document->'groups') grp on grp->>'id'=route->>'group_id'
    where route->'enabled'='true'::jsonb and grp->'enabled'='true'::jsonb
     and grp->'extension_ids' ? e.id::text));
end;$$;
