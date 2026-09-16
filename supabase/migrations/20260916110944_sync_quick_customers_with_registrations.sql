create or replace function private.sync_customer_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_entity_id uuid;
begin
  select id into v_entity_id from public.entities
  where organization_id = new.organization_id and (legacy_customer_id = new.id or id = new.id);
  if v_entity_id is null then
    insert into public.entities(id, organization_id, person_type, name, legal_name, trade_name, document,
      state_registration, birth_date, foundation_date, phone, whatsapp, email, legacy_customer_id)
    values(new.id, new.organization_id, new.customer_type,
      case when new.customer_type='PJ' then coalesce(nullif(new.trade_name,''),nullif(new.legal_name,''),new.full_name) else new.full_name end,
      new.legal_name,new.trade_name,nullif(regexp_replace(case when new.customer_type='PJ' then coalesce(nullif(new.cnpj,''),new.document) else new.document end,'[^0-9]','','g'),''),
      new.state_registration,new.birth_date,new.foundation_date,new.phone,new.whatsapp,new.email,new.id);
    insert into public.entity_roles(entity_id,role,is_active) values(new.id,'customer',true);
  elsif tg_op = 'UPDATE' then
    update public.entities set person_type=new.customer_type,
      name=case when new.customer_type='PJ' then coalesce(nullif(new.trade_name,''),nullif(new.legal_name,''),new.full_name) else new.full_name end,
      legal_name=new.legal_name,trade_name=new.trade_name,
      document=nullif(regexp_replace(case when new.customer_type='PJ' then coalesce(nullif(new.cnpj,''),new.document) else new.document end,'[^0-9]','','g'),''),
      state_registration=new.state_registration,birth_date=new.birth_date,foundation_date=new.foundation_date,
      phone=new.phone,whatsapp=new.whatsapp,email=new.email
    where id=v_entity_id and organization_id=new.organization_id;
  end if;
  return new;
end $$;
revoke all on function private.sync_customer_registration() from public, anon, authenticated;
create trigger customers_sync_registration after insert or update on public.customers
for each row execute function private.sync_customer_registration();

create or replace function private.sync_customer_address_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_entity_id uuid; v_address_id uuid;
begin
  select id into v_entity_id from public.entities where legacy_customer_id=new.customer_id and organization_id=new.organization_id;
  if v_entity_id is null then return new; end if;
  select id into v_address_id from public.entity_addresses where entity_id=v_entity_id and organization_id=new.organization_id and (legacy_customer_address_id=new.id or id=new.id);
  if v_address_id is null then
    insert into public.entity_addresses(id,entity_id,organization_id,type,zip_code,state,city,neighborhood,street,number,complement,reference,location_url,is_primary,is_active,legacy_customer_address_id)
    values(new.id,v_entity_id,new.organization_id,case when new.is_default then 'Principal' else 'Outro' end,new.zip_code,new.state,new.city,new.neighborhood,new.street,new.number,new.complement,new.reference,new.shared_map_url,new.is_default,true,new.id);
  elsif tg_op='UPDATE' then
    update public.entity_addresses set zip_code=new.zip_code,state=new.state,city=new.city,neighborhood=new.neighborhood,street=new.street,number=new.number,complement=new.complement,reference=new.reference,location_url=new.shared_map_url,is_primary=new.is_default
    where id=v_address_id and entity_id=v_entity_id and organization_id=new.organization_id;
  end if;
  return new;
end $$;
revoke all on function private.sync_customer_address_registration() from public, anon, authenticated;
create trigger customer_addresses_sync_registration after insert or update on public.customer_addresses
for each row execute function private.sync_customer_address_registration();

-- Recover only missing registrations, preserving existing roles and OS/customer IDs.
insert into public.entities(id,organization_id,person_type,name,legal_name,trade_name,document,state_registration,birth_date,foundation_date,phone,whatsapp,email,legacy_customer_id,created_at,updated_at)
select c.id,c.organization_id,c.customer_type,
case when c.customer_type='PJ' then coalesce(nullif(c.trade_name,''),nullif(c.legal_name,''),c.full_name) else c.full_name end,
c.legal_name,c.trade_name,nullif(regexp_replace(case when c.customer_type='PJ' then coalesce(nullif(c.cnpj,''),c.document) else c.document end,'[^0-9]','','g'),''),
c.state_registration,c.birth_date,c.foundation_date,c.phone,c.whatsapp,c.email,c.id,c.created_at,c.updated_at
from public.customers c where not exists(select 1 from public.entities e where e.legacy_customer_id=c.id or e.id=c.id);
insert into public.entity_roles(entity_id,role,is_active)
select e.id,'customer',true from public.entities e where e.legacy_customer_id is not null
on conflict(entity_id,role) do nothing;
insert into public.entity_addresses(id,entity_id,organization_id,type,zip_code,state,city,neighborhood,street,number,complement,reference,location_url,is_primary,is_active,legacy_customer_address_id,created_at,updated_at)
select a.id,e.id,a.organization_id,case when a.is_default then 'Principal' else 'Outro' end,a.zip_code,a.state,a.city,a.neighborhood,a.street,a.number,a.complement,a.reference,a.shared_map_url,a.is_default,true,a.id,a.created_at,a.updated_at
from public.customer_addresses a join public.entities e on e.legacy_customer_id=a.customer_id and e.organization_id=a.organization_id
where not exists(select 1 from public.entity_addresses ea where ea.legacy_customer_address_id=a.id or ea.id=a.id);
