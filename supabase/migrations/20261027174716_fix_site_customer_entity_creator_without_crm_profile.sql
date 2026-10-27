-- Na sincronizacao de clientes criados pelo site, guardar created_by apenas se for perfil CRM valido.\n
CREATE OR REPLACE FUNCTION private.sync_customer_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_entity_id uuid;
begin
  select id into v_entity_id from public.entities
  where organization_id = new.organization_id and (legacy_customer_id = new.id or id = new.id);
  if v_entity_id is null then
    insert into public.entities(id, organization_id, person_type, name, legal_name, trade_name, document,
      state_registration, birth_date, foundation_date, phone, whatsapp, email, legacy_customer_id, created_by)
    values(new.id, new.organization_id, new.customer_type,
      case when new.customer_type='PJ' then coalesce(nullif(new.trade_name,''),nullif(new.legal_name,''),new.full_name) else new.full_name end,
      new.legal_name,new.trade_name,nullif(regexp_replace(case when new.customer_type='PJ' then coalesce(nullif(new.cnpj,''),new.document) else new.document end,'[^0-9]','','g'),''),
      new.state_registration,new.birth_date,new.foundation_date,new.phone,new.whatsapp,new.email,new.id,
      (select p.id from public.profiles p where p.id=auth.uid()));
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
end $function$
;
