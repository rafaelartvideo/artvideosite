-- Minha Conta Artvideo: documentos assinados e notas fiscais explicitamente classificadas.
-- Reusa a função atual de identidade verificada/escopo por cliente; jamais retorna caminhos privados.
begin;
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
 v_order jsonb; v_items jsonb; v_photos jsonb; v_documents jsonb; v_certificate jsonb; v_situations jsonb;
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

 -- Somente etapas vinculadas ao tipo desta OS, mais situações efetivamente
 -- percorridas ou atualmente selecionadas. Nunca usa o status geral como etapa.
 with current_order as (
   select o.situation_id, o.service_type_id
   from public.service_orders o
   where o.id=p_order_id and o.organization_id=v_org and o.customer_id=v_customer
 ), linked as (
   select s.id,s.name,s.color,coalesce(sts.sort_order,0)::bigint as position
   from current_order o
   join public.service_type_situations sts
     on sts.service_type_id=o.service_type_id and sts.organization_id=v_org
   join public.os_situations s on s.id=sts.situation_id and s.organization_id=v_org
 ), visited as (
   select distinct on (v.situation_id) v.situation_id,v.situation_name_snapshot,
     v.situation_color_snapshot,v.entered_at
   from public.service_order_situation_visits v
   where v.service_order_id=p_order_id and v.organization_id=v_org
     and v.situation_id is not null
   order by v.situation_id,v.entered_at desc
 ), extra as (
   select v.situation_id as id,v.situation_name_snapshot as name,
     v.situation_color_snapshot as color,
     (1000000+row_number() over(order by v.entered_at,v.situation_id))::bigint as position
   from visited v
   where not exists(select 1 from linked l where l.id=v.situation_id)
 ), current_only as (
   select s.id,s.name,s.color,2000000::bigint as position
   from current_order o
   join public.os_situations s on s.id=o.situation_id and s.organization_id=v_org
   where not exists(select 1 from linked l where l.id=s.id)
     and not exists(select 1 from visited v where v.situation_id=s.id)
 ), steps as (
   select id,name,color,position from linked
   union all select id,name,color,position from extra
   union all select id,name,color,position from current_only
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',steps.id,'name',steps.name,'color',steps.color,
   'visited',exists(select 1 from public.service_order_situation_visits v
      where v.service_order_id=p_order_id and v.organization_id=v_org
        and v.situation_id=steps.id),
   'current',steps.id=(select situation_id from current_order)
 ) order by steps.position,steps.id),'[]'::jsonb) into v_situations
 from steps;

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
   ) and not exists (
      -- Nota fiscal é documento do cliente, não foto comum do equipamento.
      select 1 from public.service_order_situation_media inv_link
      join public.attachment_types inv_type
        on inv_type.id=inv_link.attachment_type_id
       and inv_type.organization_id=inv_link.organization_id
      where inv_link.organization_id=v_org
        and inv_link.service_order_id=p_order_id
        and inv_link.media_id=m.id
        and lower(btrim(inv_type.name))='nota fiscal'
   ) order by m.id,m.created_at
 ) x;
 -- Expor SOMENTE notas fiscais classificadas como tal em Documentos > Anexos.
 -- A lista não contém bucket, storage_path nem URLs de acesso.
 select coalesce(jsonb_agg(jsonb_build_object(
     'id',d.id,'title',d.title,'signed_at',d.signed_at,
     'type',d.doc_type,'created_at',d.created_at,
     'file_name',d.file_name,'mime_type',d.mime_type
   ) order by d.created_at desc),'[]'::jsonb) into v_documents
 from (
   select r.id,r.template_name_snapshot as title,r.signed_at,
      'signature'::text as doc_type,r.created_at,
      null::text as file_name,'application/pdf'::text as mime_type
   from public.document_signature_requests r
   where r.organization_id=v_org and r.service_order_id=p_order_id
     and r.require_external_signature
     and r.signed_at is not null and r.final_pdf_storage_path is not null
     and r.cancelled_at is null
   union all
   select sm.id,'Nota Fiscal'::text as title,null::timestamptz as signed_at,
     'invoice'::text as doc_type,sm.created_at,m.file_name,m.mime_type
   from public.service_order_situation_media sm
   join public.attachment_types at on at.id=sm.attachment_type_id
      and at.organization_id=v_org
   join public.media m on m.id=sm.media_id and m.organization_id=v_org
   where sm.organization_id=v_org and sm.service_order_id=p_order_id
     and lower(btrim(at.name))='nota fiscal'
     and m.storage_path is not null and length(m.storage_path)>0
 ) d;
 select jsonb_build_object('id',c.id,'number',c.certificate_number,'issued_at',c.issued_at,
   'starts_at',c.starts_at,'expires_at',c.expires_at,'warranty',c.warranty_option_label)
   into v_certificate from public.service_order_warranty_certificates c
 where c.organization_id=v_org and c.service_order_id=p_order_id limit 1;
 return jsonb_build_object('order',v_order,'items',v_items,'photos',v_photos,
   'documents',v_documents,'certificate',v_certificate,'situations',v_situations);
end $function$;
revoke all on function public.artvideo_customer_order_details_v1(uuid) from public,anon;
grant execute on function public.artvideo_customer_order_details_v1(uuid) to authenticated;

commit;
