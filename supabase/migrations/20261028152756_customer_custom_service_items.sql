begin;
CREATE OR REPLACE FUNCTION public.artvideo_customer_order_details_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and x.item_type in ('service','custom_service','product','servico','produto');
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
end $function$;
commit;