-- Cidade e UF do certificado: quando a OS não informa endereço de atendimento,
-- utilizar o endereço preferencial do cliente dentro da mesma empresa.
create or replace function public.issue_service_order_warranty_v1(
  p_organization_id uuid, p_service_order_id uuid, p_warranty_option_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_os public.service_orders%rowtype;
  v_option public.equipment_warranty_options%rowtype;
  v_label text;
  v_days int;
  v_begin date;
  v_customer jsonb;
  v_customer_address public.customer_addresses%rowtype;
  v_brand text;
  v_model text;
  v_equipment text;
  v_service text;
  v_org text;
  v_record public.service_order_warranty_certificates%rowtype;
begin
 if auth.uid() is null or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 then raise exception 'Sem permissão para emitir certificado.' using errcode='42501'; end if;
 select * into v_record from public.service_order_warranty_certificates
 where organization_id=p_organization_id and service_order_id=p_service_order_id;
 if found then return to_jsonb(v_record); end if;
 select * into v_os from public.service_orders
 where id=p_service_order_id and organization_id=p_organization_id for update;
 if not found or v_os.completed_at is null or v_os.cancelled_at is not null
 then raise exception 'O certificado só pode ser emitido após concluir a OS.' using errcode='22023'; end if;
 if p_warranty_option_id is not null then
   select * into v_option from public.equipment_warranty_options w
   where w.id=p_warranty_option_id and w.organization_id=p_organization_id
     and w.equipment_type_id=v_os.equipment_type_id;
   if not found then raise exception 'Garantia não corresponde ao equipamento desta OS.' using errcode='22023'; end if;
 else
   select * into v_option from public.equipment_warranty_options w
   where w.organization_id=p_organization_id and w.equipment_type_id=v_os.equipment_type_id
   order by w.is_default desc,w.sort_order asc limit 1;
 end if;
 v_days:=coalesce(v_option.warranty_days,90);
 v_label:=coalesce(v_option.label,'Garantia do serviço');
 v_begin:=(v_os.completed_at at time zone 'America/Sao_Paulo')::date;
 select to_jsonb(c) into v_customer from public.customers c
   where c.id=v_os.customer_id and c.organization_id=p_organization_id;
 select a.* into v_customer_address from public.customer_addresses a
   where a.customer_id=v_os.customer_id and a.organization_id=p_organization_id
   order by a.is_default desc, a.created_at desc limit 1;
 select name into v_brand from public.equipment_brands
   where id=v_os.equipment_brand_id and organization_id=p_organization_id;
 select name into v_model from public.equipment_models
   where id=v_os.equipment_model_id and organization_id=p_organization_id;
 select name into v_equipment from public.equipment_types
   where id=v_os.equipment_type_id and organization_id=p_organization_id;
 select name into v_service from public.general_services
   where id=v_os.general_service_id and organization_id=p_organization_id;
 select name into v_org from public.organizations where id=p_organization_id and status='active';
 if v_org is null then raise exception 'Empresa inválida.' using errcode='23503'; end if;
 insert into public.service_order_warranty_certificates (
  organization_id,service_order_id,equipment_type_id,warranty_option_label,warranty_days,starts_at,expires_at,issued_by,snapshot
 ) values (
  p_organization_id,p_service_order_id,v_os.equipment_type_id,v_label,v_days,v_begin,v_begin+v_days,auth.uid(),
  jsonb_build_object(
    'organization_name',v_org,'os_number',v_os.os_number,
    'customer_name',coalesce(v_customer->>'trade_name',v_customer->>'full_name','Cliente'),
    'customer_document',coalesce(nullif(v_customer->>'cnpj',''),v_customer->>'document'),
    'customer_phone',coalesce(nullif(v_customer->>'whatsapp',''),v_customer->>'phone'),
    'customer_city',coalesce(nullif(btrim(v_os.service_city),''),nullif(btrim(v_customer_address.city),'')),
    'customer_state',coalesce(nullif(btrim(v_os.service_state),''),nullif(btrim(v_customer_address.state),'')),
    'equipment_name',coalesce(v_equipment,'Equipamento'),'equipment_brand',coalesce(v_brand,''),
    'equipment_model',coalesce(v_model,v_os.model,''),'serial_number',v_os.serial_number,
    'accessories',v_os.accessories,'solution',coalesce(nullif(trim(v_os.solution),''),nullif(v_service,''),'Serviço descrito na Ordem de Serviço')
  )
 ) on conflict (organization_id,service_order_id) do nothing
 returning * into v_record;
 if v_record.id is null then
   select * into v_record from public.service_order_warranty_certificates
   where organization_id=p_organization_id and service_order_id=p_service_order_id;
 end if;
 return to_jsonb(v_record);
end $$;

-- Corrigir APENAS os campos Cidade/UF ausentes nos certificados já emitidos;
-- número, prazo, datas e demais dados do certificado permanecem inalterados.
with address_fallback as (
  select c.id,
    coalesce(nullif(btrim(o.service_city),''),nullif(btrim(a.city),'')) as city,
    coalesce(nullif(btrim(o.service_state),''),nullif(btrim(a.state),'')) as state
  from public.service_order_warranty_certificates c
  join public.service_orders o on o.id=c.service_order_id and o.organization_id=c.organization_id
  left join lateral (
    select ca.city,ca.state
    from public.customer_addresses ca
    where ca.customer_id=o.customer_id and ca.organization_id=c.organization_id
    order by ca.is_default desc,ca.created_at desc
    limit 1
  ) a on true
)
update public.service_order_warranty_certificates c
set snapshot = jsonb_set(
   jsonb_set(c.snapshot,'{customer_city}',
     to_jsonb(coalesce(nullif(btrim(c.snapshot->>'customer_city'),''),address_fallback.city)),true),
   '{customer_state}',
     to_jsonb(coalesce(nullif(btrim(c.snapshot->>'customer_state'),''),address_fallback.state)),true)
from address_fallback
where c.id=address_fallback.id
and (address_fallback.city is not null or address_fallback.state is not null)
and (nullif(btrim(c.snapshot->>'customer_city'),'') is null or nullif(btrim(c.snapshot->>'customer_state'),'') is null);
