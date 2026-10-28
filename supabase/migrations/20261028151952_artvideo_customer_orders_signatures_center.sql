-- Consulta do cliente: OS, mídia autorizada, certificado emitido e assinaturas
-- com isolamento por organização, CPF e WhatsApp confirmado.
begin;
create or replace function private.artvideo_verified_portal_customer_v1()
returns uuid language sql stable security definer set search_path=''
as $$
 select a.entity_id from public.artvideo_customer_accounts a
 join public.customers c on c.id=a.entity_id and c.organization_id=a.organization_id
 where a.user_id=(select auth.uid()) and a.organization_id=public.artvideo_organization_id()
   and a.entity_id is not null
   and a.whatsapp_verified_at is not null and a.crm_access_activated_at is not null
   and a.link_status in ('matched','created','approved')
   and regexp_replace(coalesce(c.document,''),'[^0-9]','','g')=a.cpf
   and a.whatsapp_verified_number in (
     regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g'),
     '55'||regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g')
   )
 limit 1
$$;
revoke all on function private.artvideo_verified_portal_customer_v1() from public,anon;
grant execute on function private.artvideo_verified_portal_customer_v1() to authenticated;

create or replace function public.artvideo_customer_order_details_v1(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_org uuid:=public.artvideo_organization_id();
 v_customer uuid:=private.artvideo_verified_portal_customer_v1();
 v_order jsonb; v_items jsonb; v_photos jsonb; v_documents jsonb; v_certificate jsonb;
begin
 if (select auth.uid()) is null or v_customer is null then
   raise exception 'Acesso não autorizado.' using errcode='42501';
 end if;
 select jsonb_build_object(
    'id',o.id,'os_number',o.os_number,
    'status',coalesce(case when s.visible_to_customer then s.name end,'Em acompanhamento'),
    'status_slug',case when o.cancelled_at is not null then 'cancelada'
         when o.completed_at is not null then 'fechada'
         when s.visible_to_customer then s.slug else 'em-acompanhamento' end,
    'created_at',o.created_at,'started_at',o.started_at,'completed_at',o.completed_at,
    'cancelled_at',o.cancelled_at,'scheduled_at',o.scheduled_at,
    'problem',coalesce(o.customer_notes,''), 'model',coalesce(o.model,''),
    'serial_number',coalesce(o.serial_number,''),'accessories',coalesce(o.accessories,''),
    'equipment_type',coalesce(et.name,''),'brand',coalesce(eb.name,''),'equipment_model',coalesce(em.name,'')
 ) into v_order
 from public.service_orders o
 left join public.order_statuses s on s.id=o.status_id and s.organization_id=o.organization_id
 left join public.equipment_types et on et.id=o.equipment_type_id and et.organization_id=o.organization_id
 left join public.equipment_brands eb on eb.id=o.equipment_brand_id and eb.organization_id=o.organization_id
 left join public.equipment_models em on em.id=o.equipment_model_id and em.organization_id=o.organization_id
 where o.id=p_order_id and o.customer_id=v_customer and o.organization_id=v_org;
 if v_order is null then raise exception 'OS não encontrada.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
     'title',x.title_snapshot,'description',coalesce(x.description_snapshot,''),
     'quantity',x.quantity,'item_type',x.item_type
   ) order by x.created_at), '[]'::jsonb) into v_items
 from public.service_order_items x
 where x.organization_id=v_org and x.service_order_id=p_order_id
   and x.item_type in ('service','product','servico','produto');
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.file_name,'mime_type',x.mime_type)
    order by x.created_at), '[]'::jsonb) into v_photos
 from (
   select distinct on(m.id) m.id,m.file_name,m.mime_type,m.created_at
   from public.media m
   where m.organization_id=v_org and m.mime_type like 'image/%' and (
     exists(select 1 from public.service_order_media som where som.service_order_id=p_order_id
       and som.organization_id=v_org and som.media_id=m.id)
     or exists(select 1 from public.service_order_situation_media sm where sm.service_order_id=p_order_id
       and sm.organization_id=v_org and sm.media_id=m.id)
   ) order by m.id,m.created_at
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.template_name_snapshot,
   'signed_at',r.signed_at,'type','signature') order by r.signed_at desc),'[]'::jsonb)
 into v_documents from public.document_signature_requests r
 where r.organization_id=v_org and r.service_order_id=p_order_id and r.require_external_signature
   and r.signed_at is not null and r.final_pdf_storage_path is not null and r.cancelled_at is null;
 select jsonb_build_object('id',c.id,'number',c.certificate_number,'issued_at',c.issued_at,
   'starts_at',c.starts_at,'expires_at',c.expires_at,'warranty',c.warranty_option_label)
   into v_certificate from public.service_order_warranty_certificates c
 where c.organization_id=v_org and c.service_order_id=p_order_id limit 1;
 return jsonb_build_object('order',v_order,'items',v_items,'photos',v_photos,
   'documents',v_documents,'certificate',v_certificate);
end $$;
revoke all on function public.artvideo_customer_order_details_v1(uuid) from public,anon;
grant execute on function public.artvideo_customer_order_details_v1(uuid) to authenticated;

-- Somente solicitações cujo assinante usa o mesmo WhatsApp validado na conta.
-- Não retornamos tokens, documentos pessoais, IPs ou caminhos privados.
create or replace function public.artvideo_customer_signatures_v1()
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
 from (
   select r.id,r.service_order_id,so.os_number,r.template_name_snapshot as title,
     r.created_at,r.signed_at,r.expires_at,r.status,
     case when r.cancelled_at is not null then 'cancelled'
       when r.signed_at is not null then 'signed'
       when r.expires_at <= now() then 'expired'
       else 'pending' end as customer_status,
     (r.signed_at is not null and r.final_pdf_storage_path is not null) as downloadable
   from public.document_signature_requests r
   join public.service_orders so on so.id=r.service_order_id and so.organization_id=r.organization_id
   join public.artvideo_customer_accounts a on a.user_id=(select auth.uid())
     and a.organization_id=r.organization_id and a.entity_id=so.customer_id
   where r.organization_id=public.artvideo_organization_id()
     and so.customer_id=private.artvideo_verified_portal_customer_v1()
     and r.require_external_signature=true
     and regexp_replace(coalesce(r.external_signer_phone,''),'[^0-9]','','g') in (
       a.whatsapp_verified_number,
       regexp_replace(a.whatsapp_verified_number,'^55','','g')
     )
   order by r.created_at desc limit 100
 ) x;
$$;
revoke all on function public.artvideo_customer_signatures_v1() from public,anon;
grant execute on function public.artvideo_customer_signatures_v1() to authenticated;
commit;
