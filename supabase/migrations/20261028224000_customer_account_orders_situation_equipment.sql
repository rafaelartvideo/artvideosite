-- Minha Conta / Minhas Ordens de Serviços:
-- exibe a situação real da OS (não seu status administrativo) e somente dados do equipamento.
-- Mantém a verificação de identidade pré-existente e o isolamento por organização/cliente.
begin;

create or replace function public.artvideo_customer_portal_extended_v1()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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
  if v_uid is null then
    raise exception 'Sessao invalida.' using errcode='42501';
  end if;

  v_base := public.artvideo_customer_portal_v1();
  v_customer_id := private.artvideo_verified_portal_customer_v1();
  if v_customer_id is null then
    return v_base || jsonb_build_object(
      'crm_access',false,'service_orders','[]'::jsonb,'documents','[]'::jsonb
    );
  end if;

  select coalesce(c.email,''),c.full_name,c.document,c.whatsapp
    into v_customer_email,v_customer_name,v_customer_cpf,v_customer_phone
    from public.customers c
    where c.id=v_customer_id and c.organization_id=v_org;

  select jsonb_build_object(
    'street',a.street,'number',a.number,'neighborhood',a.neighborhood,
    'city',a.city,'state',a.state,'zip_code',a.zip_code,'complement',a.complement
  ) into v_address from public.customer_addresses a
    where a.customer_id=v_customer_id and a.organization_id=v_org
    order by a.is_default desc,a.created_at desc limit 1;

  v_base := jsonb_set(v_base,'{customer,email}',to_jsonb(coalesce(v_customer_email,'')),true);
  v_base := v_base || jsonb_build_object('crm_profile',jsonb_build_object(
    'name',v_customer_name,'cpf',v_customer_cpf,'whatsapp',v_customer_phone,'address',v_address
  ));

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_orders from (
      select so.id,so.os_number,so.created_at,so.scheduled_at,so.completed_at,so.cancelled_at,
             coalesce(case when st.visible_to_customer then st.name end,'Em acompanhamento') as status,
             -- Etapa atualmente vinculada à OS; jamais inferir pelo status aberto/fechado/cancelado.
             coalesce(nullif(trim(sit.name),''),'Sem situação') as situation_name,
             sit.color as situation_color,
             coalesce(gs.name,svc.title,'Ordem de serviço') as description,
             coalesce(so.model,'') as model,
             -- Equipamento, marca e modelo: não usar o nome do serviço como fallback.
             coalesce(nullif(concat_ws(' · ',
               nullif(trim(et.name),''),
               nullif(trim(eb.name),''),
               coalesce(nullif(trim(em.name),''),nullif(trim(so.model),''))
             ),''),'') as equipment
      from public.service_orders so
      left join public.order_statuses st
        on st.id=so.status_id and st.organization_id=so.organization_id
      left join public.os_situations sit
        on sit.id=so.situation_id and sit.organization_id=so.organization_id
      left join public.equipment_types et
        on et.id=so.equipment_type_id and et.organization_id=so.organization_id
      left join public.equipment_brands eb
        on eb.id=so.equipment_brand_id and eb.organization_id=so.organization_id
      left join public.equipment_models em
        on em.id=so.equipment_model_id and em.organization_id=so.organization_id
      left join public.general_services gs
        on gs.id=so.general_service_id and gs.organization_id=so.organization_id
      left join public.services svc
        on svc.id=so.service_id and svc.organization_id=so.organization_id
      where so.organization_id=v_org and so.customer_id=v_customer_id
      order by so.created_at desc limit 100
    ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.signed_at desc),'[]'::jsonb)
    into v_docs from (
      select r.id,so.os_number,r.template_name_snapshot as title,r.signed_at
      from public.document_signature_requests r
      join public.service_orders so
        on so.id=r.service_order_id and so.organization_id=r.organization_id
      where r.organization_id=v_org and so.customer_id=v_customer_id
        and r.signed_at is not null and r.final_pdf_storage_path is not null
        and r.cancelled_at is null and r.require_external_signature=true
      order by r.signed_at desc limit 100
    ) x;

  return v_base || jsonb_build_object(
    'crm_access',true,'service_orders',v_orders,'documents',v_docs
  );
end $function$;

revoke all on function public.artvideo_customer_portal_extended_v1() from public,anon;
grant execute on function public.artvideo_customer_portal_extended_v1() to authenticated,service_role;

commit;
