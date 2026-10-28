begin;
-- Signed-in customer may access their unique matched CRM record after
-- verifying the WhatsApp on their site account; no invitation is necessary.
create or replace function private.artvideo_verified_portal_customer_v1()
returns uuid language sql stable security definer set search_path=''
as $$
  select a.entity_id
  from public.artvideo_customer_accounts a
  join public.customers c on c.id=a.entity_id and c.organization_id=a.organization_id
  join public.entities e on e.id=c.id and e.organization_id=c.organization_id
  where a.user_id=(select auth.uid())
    and a.organization_id=public.artvideo_organization_id()
    and a.entity_id is not null
    and a.link_status in ('matched','created','approved')
    and a.whatsapp_verified_at is not null
    and a.whatsapp_verified_number is not null
    and a.whatsapp_verified_number=case
      when regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') like '55%'
      then regexp_replace(coalesce(a.phone,''),'[^0-9]','','g')
      else '55'||regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') end
    and length(regexp_replace(coalesce(a.cpf,''),'[^0-9]','','g'))=11
    and regexp_replace(coalesce(c.document,''),'[^0-9]','','g')=a.cpf
    and public.artvideo_first_name_key_v1(a.full_name)=public.artvideo_first_name_key_v1(c.full_name)
    and e.is_active and c.customer_type='PF'
    and exists(select 1 from public.entity_roles er
      where er.entity_id=e.id and er.role='customer' and er.is_active)
    and not exists(select 1 from public.artvideo_customer_accounts duplicate
      where duplicate.organization_id=a.organization_id
        and duplicate.user_id<>a.user_id
        and (duplicate.entity_id=a.entity_id or duplicate.cpf=a.cpf))
  limit 1
$$;
revoke all on function private.artvideo_verified_portal_customer_v1() from public,anon;
grant execute on function private.artvideo_verified_portal_customer_v1() to authenticated;

CREATE OR REPLACE FUNCTION public.artvideo_customer_portal_extended_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.artvideo_organization_id();
  v_customer_id uuid;
  v_base jsonb;
  v_orders jsonb;
  v_docs jsonb;
  v_customer_email text;
  v_customer_phone text;
  v_customer_name text;
  v_customer_cpf text;
  v_address jsonb;
begin
  if v_uid is null then raise exception 'Sessao invalida.' using errcode='42501'; end if;
  v_base := public.artvideo_customer_portal_v1();
  v_customer_id := private.artvideo_verified_portal_customer_v1();
  if v_customer_id is null then
    return v_base || jsonb_build_object('crm_access',false,'service_orders','[]'::jsonb,'documents','[]'::jsonb);
  end if;
  select coalesce(c.email,''),c.full_name,c.document,c.whatsapp
    into v_customer_email,v_customer_name,v_customer_cpf,v_customer_phone
    from public.customers c where c.id=v_customer_id and c.organization_id=v_org;
  select jsonb_build_object('street',a.street,'number',a.number,'neighborhood',a.neighborhood,
    'city',a.city,'state',a.state,'zip_code',a.zip_code,'complement',a.complement)
    into v_address from public.customer_addresses a
    where a.customer_id=v_customer_id and a.organization_id=v_org
    order by a.is_default desc,a.created_at desc limit 1;
  v_base := jsonb_set(v_base,'{customer,email}',to_jsonb(coalesce(v_customer_email,'')),true);
  v_base := v_base || jsonb_build_object('crm_profile',jsonb_build_object(
    'name',v_customer_name,'cpf',v_customer_cpf,'whatsapp',v_customer_phone,'address',v_address));
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_orders from (
      select so.id,so.os_number,so.created_at,so.scheduled_at,so.completed_at,
             coalesce(case when st.visible_to_customer then st.name end,'Em acompanhamento') as status,
             coalesce(gs.name, s.title, 'Ordem de serviço') as description,
             coalesce(so.model,'') as model
      from public.service_orders so
      left join public.order_statuses st on st.id=so.status_id and st.organization_id=so.organization_id
      left join public.general_services gs on gs.id=so.general_service_id and gs.organization_id=so.organization_id
      left join public.services s on s.id=so.service_id and s.organization_id=so.organization_id
      where so.organization_id=v_org and so.customer_id=v_customer_id
      order by so.created_at desc limit 100
    ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.signed_at desc),'[]'::jsonb)
    into v_docs from (
      select r.id,so.os_number,r.template_name_snapshot as title,r.signed_at
      from public.document_signature_requests r
      join public.service_orders so on so.id=r.service_order_id and so.organization_id=r.organization_id
      where r.organization_id=v_org and so.customer_id=v_customer_id
        and r.signed_at is not null and r.final_pdf_storage_path is not null
        and r.cancelled_at is null and r.require_external_signature = true
      order by r.signed_at desc limit 100
    ) x;
  return v_base || jsonb_build_object('crm_access',true,'service_orders',v_orders,'documents',v_docs);
end $function$
;
commit;
