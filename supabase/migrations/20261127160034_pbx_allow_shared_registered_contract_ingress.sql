-- Permit shared signaling ACL only for registered accounts of the same tenant, contract, provider and host.
CREATE OR REPLACE FUNCTION private.pbx_save_universal_telephony(p_organization_id uuid, p_expected_revision bigint, p_document jsonb, p_secrets jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg private.pbx_universal_configs%rowtype; agent uuid; k text; r jsonb; s record; sid uuid; cid uuid; d jsonb:=p_document; n bigint; net cidr; claim record;
begin
 if not private.pbx_has_permission(p_organization_id,'pbx.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,786251));
 perform pg_advisory_xact_lock(786252001);
 select * into cfg from private.pbx_universal_configs where organization_id=p_organization_id for update;
 if p_expected_revision is distinct from coalesce(cfg.revision,0) then raise exception 'Configuration changed; refresh before saving' using errcode='40001'; end if;
 perform private.pbx_validate_universal(p_organization_id,d);
 if jsonb_typeof(p_secrets) is distinct from 'object' or octet_length(p_secrets::text)>30000 then perform private.pbx_universal_error(); end if;
 select id into agent from public.pbx_agents where organization_id=p_organization_id and enabled;
 if agent is null or (cfg.agent_id is not null and cfg.agent_id<>agent) then perform private.pbx_universal_error(); end if;
 -- Disable, verify zero legs and application, THEN change routes/membership/limits.
 if cfg.document->'routing_enabled'='true' then
  if d->'routing_enabled'<>'false' or (d-'routing_enabled') is distinct from (cfg.document-'routing_enabled') or p_secrets<>'{}'::jsonb then
   raise exception 'Disable routing and await application before changing configuration' using errcode='23514'; end if;
 elsif exists(select 1 from private.pbx_universal_claims where organization_id=p_organization_id)
 or exists(select 1 from private.pbx_universal_ingress_claims where organization_id=p_organization_id) then
  raise exception 'Await verified drain before changing configuration' using errcode='23514';
 end if;
 foreach k in array array['providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'] loop
  for r in select value from jsonb_array_elements(d->k) loop
   cid=(r->>'id')::uuid;
   if exists(select 1 from private.pbx_universal_entities where id=cid and (organization_id<>p_organization_id or kind<>k)) then perform private.pbx_universal_error(); end if;
   insert into private.pbx_universal_entities(id,organization_id,kind) values(cid,p_organization_id,k) on conflict(id) do nothing;
  end loop;
 end loop;
 for s in select * from jsonb_each(p_secrets) loop
  if not private.pbx_universal_uuid(s.key) or jsonb_typeof(s.value)<>'string' or not exists(select 1 from jsonb_array_elements(d->'connections') a where a->>'id'=s.key and a->>'auth_mode'<>'ip') then perform private.pbx_universal_error(); end if;
  if s.value#>>'{}'='' then continue; end if;
  if char_length(s.value#>>'{}') not between 1 and 256 or (s.value#>>'{}') collate "C" ~ '[[:space:][:cntrl:]]' or (s.value#>>'{}') ~ '[-   -   ]' then raise exception 'SIP credential format unsupported' using errcode='23514'; end if;
  select secret_id into sid from private.pbx_universal_secrets where connection_id=s.key::uuid and organization_id=p_organization_id;
  begin
   if sid is null then sid=vault.create_secret(s.value#>>'{}','pbx-universal-'||s.key,'PBX connection credential');
   else perform vault.update_secret(sid,s.value#>>'{}'); end if;
  exception when others then raise exception 'Credential could not be saved' using errcode='23514'; end;
  insert into private.pbx_universal_secrets(connection_id,organization_id,secret_id) values(s.key::uuid,p_organization_id,sid) on conflict(connection_id) do update set secret_id=excluded.secret_id;
 end loop;
 if d->'routing_enabled'='true' then
  if p_secrets<>'{}'::jsonb then raise exception 'Save credentials in a disabled draft before activation' using errcode='23514'; end if;
  if not private.pbx_universal_can_activate(p_organization_id,d) then raise exception 'Activation prerequisites unavailable' using errcode='23514'; end if;
  if exists(select 1 from private.pbx_legacy_trunk_controls where host is null and (enabled or status<>'applied' or observed_enabled is distinct from false)) then raise exception 'SIP identity admission unavailable' using errcode='23514'; end if;
  for r in select value from jsonb_array_elements(d->'connections') where value->'enabled'='true' loop
   if r->>'auth_mode'<>'ip' then
    if exists(select 1 from private.pbx_sip_account_claims where lower(host)=lower(r->>'host') and lower(username)=lower(r->>'username'))
    or exists(select 1 from private.pbx_universal_claims where host=lower(r->>'host') and username=lower(r->>'username')) then raise exception 'SIP identity admission unavailable' using errcode='23514'; end if;
    insert into private.pbx_universal_claims(host,username,connection_id,organization_id) values(lower(r->>'host'),lower(r->>'username'),(r->>'id')::uuid,p_organization_id);
   end if;
   if r->'inbound_enabled'='true' then
    for net in select (value#>>'{}')::cidr from jsonb_array_elements(r->'inbound_cidrs') loop
     -- Registered accounts of the same tenant/contract may share provider signaling ACLs.
     -- PJSIP registration line tokens identify each account, not the source IP.
     -- Never relax overlaps for IP/digest identification or another organization.
     if exists(select 1 from private.pbx_universal_ingress_claims ic
       where ic.network && net and ic.connection_id<>(r->>'id')::uuid
       and not (ic.organization_id=p_organization_id and r->>'auth_mode'='registration'
         and exists(select 1 from jsonb_array_elements(d->'connections') peer
           where peer->>'id'=ic.connection_id::text and peer->>'auth_mode'='registration'
             and peer->>'provider_id'=r->>'provider_id' and peer->>'contract_id'=r->>'contract_id'
             and lower(peer->>'host')=lower(r->>'host'))))
     then raise exception 'Inbound identity admission unavailable' using errcode='23514'; end if;
     insert into private.pbx_universal_ingress_claims(connection_id,organization_id,network) values((r->>'id')::uuid,p_organization_id,net);
    end loop;
   end if;
  end loop;
 end if;
 n=coalesce(cfg.revision,0)+1;
 insert into private.pbx_universal_configs(organization_id,agent_id,revision,document) values(p_organization_id,agent,n,d)
 on conflict(organization_id) do update set revision=excluded.revision,document=excluded.document,status='pending',last_error=null,updated_at=now();
 insert into private.pbx_universal_audit(organization_id,revision,actor_id,action) values(p_organization_id,n,auth.uid(),'save');
 return private.pbx_list_universal_telephony(p_organization_id);
exception when unique_violation then raise exception 'Telephony identity unavailable' using errcode='23514';
end;$function$;
