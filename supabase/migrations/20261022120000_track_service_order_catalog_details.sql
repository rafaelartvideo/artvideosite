-- Consulta pública da OS da Artvideo: apenas títulos dos itens e situação, sem dados do cliente, preços ou observações internas.
create or replace function public.track_service_order(p_os_number text, p_tracking_token uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_artvideo_organization_id constant uuid := public.artvideo_organization_id();
  v_order record;
  v_history jsonb;
  v_items jsonb;
  v_services text;
  v_products text;
begin
  if nullif(btrim(coalesce(p_os_number,'')),'') is null then return null; end if;
  select so.id, so.os_number, so.created_at, so.updated_at, so.scheduled_at, so.completed_at,
         coalesce(gs.name,ss.title,'') as service_title,
         case when lower(coalesce(st.name,'')) in ('fechada','cancelada') then st.name
           else coalesce(sit.name,st.name,'Em andamento') end as current_status,
         coalesce(nullif(ce.equipment_type_name,''),et.name,'') as equipment_type,
         coalesce(nullif(ce.equipment_brand_name,''),eb.name,'') as equipment_brand,
         coalesce(nullif(ce.equipment_model_name,''),em.name,nullif(so.model,''),'') as equipment_model,
         coalesce(pr.name,'') as product_title
    into v_order
  from public.service_orders so
  left join public.general_services gs on gs.id=so.general_service_id and gs.organization_id=so.organization_id
  left join public.services ss on ss.id=so.service_id and ss.organization_id=so.organization_id
  left join public.order_statuses st on st.id=so.status_id and st.organization_id=so.organization_id
  left join public.os_situations sit on sit.id=so.situation_id and sit.organization_id=so.organization_id
  left join public.customer_equipments ce on ce.id=so.customer_equipment_id and ce.organization_id=so.organization_id
  left join public.equipment_types et on et.id=so.equipment_type_id and et.organization_id=so.organization_id
  left join public.equipment_brands eb on eb.id=so.equipment_brand_id and eb.organization_id=so.organization_id
  left join public.equipment_models em on em.id=so.equipment_model_id and em.organization_id=so.organization_id
  left join public.products pr on pr.id=so.product_id and pr.organization_id=so.organization_id
  where so.organization_id=v_artvideo_organization_id
    and upper(so.os_number)=upper(btrim(p_os_number))
    and (p_tracking_token is null or so.tracking_token=p_tracking_token)
  limit 1;

  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'created_at',h.created_at,'notes',h.note,'order_status',jsonb_build_object('name',st.name))
    order by h.created_at),'[]'::jsonb)
  into v_history
  from public.service_order_status_history h
  left join public.order_statuses st on st.id=h.to_status_id and st.organization_id=v_artvideo_organization_id
  where h.organization_id=v_artvideo_organization_id and h.service_order_id=v_order.id
    and h.visible_to_customer=true;

  select coalesce(jsonb_agg(jsonb_build_object('title',q.title_snapshot,'type',q.item_type)
    order by q.created_at),'[]'::jsonb)
  into v_items
  from (select title_snapshot,item_type,created_at from public.service_order_items
        where organization_id=v_artvideo_organization_id and service_order_id=v_order.id
          and item_type in ('service','custom_service','product')
          and nullif(btrim(coalesce(title_snapshot,'')),'') is not null
        order by created_at limit 12) q;

  select string_agg(distinct title_snapshot,', ') filter(where item_type in ('service','custom_service')),
         string_agg(distinct title_snapshot,', ') filter(where item_type='product')
  into v_services,v_products
  from public.service_order_items
  where organization_id=v_artvideo_organization_id and service_order_id=v_order.id;

  return jsonb_build_object(
    'id',v_order.id,'os_number',v_order.os_number,'created_at',v_order.created_at,
    'updated_at',v_order.updated_at,'status',v_order.current_status,
    'title',coalesce(nullif(v_services,''),nullif(v_order.service_title,''),'Assistência técnica'),
    'product_title',coalesce(nullif(v_products,''),nullif(v_order.product_title,'')),
    'equipment',nullif(concat_ws(' ',nullif(v_order.equipment_type,''),nullif(v_order.equipment_brand,''),nullif(v_order.equipment_model,'')),''),
    'items',v_items,'estimated_delivery',v_order.scheduled_at,
    'completed_at',v_order.completed_at,'history',v_history
  );
end;
$function$;
