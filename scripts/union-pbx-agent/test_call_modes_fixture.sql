-- Uses the preceding disposable legacy/SIP fixtures; never accesses hosted data.
create table private.pbx_call_modes_test_fixture(org uuid,other_org uuid,agent uuid,other_agent uuid,ext uuid,manual uuid,unknown_manual uuid,actor uuid);
do $$declare f private.pbx_legacy_test_fixture%rowtype;e uuid;m uuid;u uuid;begin
select * into strict f from private.pbx_legacy_test_fixture;
insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(f.org,801,'Call modes fixture','applied') returning id into e;
insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status,is_managed,endpoint_name) values(f.org,301,'Manual fixture','manual',false,'union-301') returning id into m;
insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status,is_managed) values(f.org,802,'Uncontrolled fixture','manual',false) returning id into u;
insert into private.pbx_call_modes_test_fixture values(f.org,f.other_org,f.agent,f.other_agent,e,m,u,f.actor);
end;$$;
