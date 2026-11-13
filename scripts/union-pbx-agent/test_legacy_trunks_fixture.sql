-- Synthetic, non-secret fixture installed before migration to test discovery.
create table private.pbx_legacy_test_fixture(org uuid,other_org uuid,agent uuid,other_agent uuid,trunk uuid,ext uuid,actor uuid,managed uuid);
do $$declare o uuid=gen_random_uuid(); p uuid=gen_random_uuid(); a uuid; b uuid; t uuid; e uuid; actor uuid;begin
select id into strict actor from public.profiles limit 1;
insert into public.organizations(id,name,slug,settings) values(o,'Legacy fixture','legacy-'||o,jsonb_build_object('is_platform_operator',true)),(p,'Partner fixture','partner-'||p,'{}');
insert into public.organization_modules(organization_id,module_key,is_enabled) values(o,'pbx',true),(p,'pbx',true);
insert into public.organization_members(organization_id,user_id,is_owner) values(o,actor,true),(p,actor,true);
insert into public.pbx_agents(organization_id,label,public_key) values(o,'Legacy fixture',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64')) returning id into a;
insert into public.pbx_agents(organization_id,label,public_key) values(p,'Partner fixture',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64')) returning id into b;
insert into public.pbx_trunks(organization_id,agent_id,name,provider,inbound_endpoint,outbound_endpoint) values(o,a,'FVX fixture','FVX','union-fvx-in','union-fvx-out-test') returning id into t;
insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(p,501,'Partner fixture','applied') returning id into e;
insert into private.pbx_legacy_test_fixture values(o,p,a,b,t,e,actor,null);
end;$$;
