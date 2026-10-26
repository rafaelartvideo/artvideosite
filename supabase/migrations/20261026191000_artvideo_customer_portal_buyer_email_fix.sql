-- Corrige a chave real do checkout e totaliza todos os itens de carrinho.
drop index if exists public.artvideo_store_orders_site_buyer_email_idx;
create index if not exists artvideo_store_orders_site_buyer_email_idx
 on public.artvideo_store_orders (organization_id, lower(btrim(buyer->>'buyer_email')));

CREATE OR REPLACE FUNCTION public.artvideo_customer_portal_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_org uuid; v_entity public.entities%rowtype;
 v_customer uuid; v_email text; v_orders jsonb; v_services jsonb; v_quotes jsonb;
begin
 if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_uid and u.email_confirmed_at is not null;
 if v_email is null then return jsonb_build_object('status','verify_email'); end if;
 v_org:=public.artvideo_organization_id();
 select e.* into v_entity from public.artvideo_customer_accounts a
 join public.entities e on e.id=a.entity_id and e.organization_id=a.organization_id
 where a.user_id=v_uid and a.organization_id=v_org and e.is_active;
 if not found then return jsonb_build_object('status','unlinked'); end if;
 v_customer:=v_entity.legacy_customer_id;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
 into v_orders from (
  select o.id,coalesce(o.order_number::text,'') as number,o.status,o.created_at,
   case when (select count(*) from public.artvideo_store_order_items i
      where i.order_id=o.id and i.organization_id=o.organization_id)>1
    then 'Compra com '||(select count(*)::text from public.artvideo_store_order_items i
      where i.order_id=o.id and i.organization_id=o.organization_id)||' produtos'
    else coalesce(o.product_name,'Produto') end as product_name,
   (coalesce((select sum(coalesce(i.unit_price,0)*coalesce(i.quantity,1))
    from public.artvideo_store_order_items i
    where i.order_id=o.id and i.organization_id=o.organization_id),
    coalesce(o.unit_price,0)*coalesce(o.quantity,1))+coalesce(o.shipping_price,0)) as total,
   coalesce(f.status,'') as delivery_status
  from public.artvideo_store_orders o
  left join public.artvideo_store_fulfillments f on f.order_id=o.id and f.organization_id=o.organization_id
  where o.organization_id=v_org and lower(btrim(o.buyer->>'buyer_email'))=v_email
  order by o.created_at desc limit 50
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
 into v_services from (
  select s.id,s.os_number as number,
   coalesce(nullif(btrim(concat_ws(' ',s.model,s.serial_number)),''),'Equipamento ou serviço') as equipment,
   case when st.visible_to_customer then st.name else 'Em acompanhamento' end as status,
   s.created_at
  from public.service_orders s left join public.order_statuses st on st.id=s.status_id and st.organization_id=s.organization_id
  where s.organization_id=v_org and s.customer_id=v_customer
  order by s.created_at desc limit 50
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
 into v_quotes from (
  select q.id,q.protocol as number,coalesce(nullif(q.equipment_name,''),'Serviço solicitado') as description,
   coalesce(case when st.visible_to_customer then st.name end,'Em acompanhamento') as status,q.created_at
  from public.quote_requests q left join public.order_statuses st on st.id=q.status_id and st.organization_id=q.organization_id
  where q.organization_id=v_org and q.customer_id=v_customer and q.archived_at is null
  order by q.created_at desc limit 50
 ) t;
 return jsonb_build_object('status','ready',
  'customer',jsonb_build_object('name',v_entity.name,'email',v_email,'phone',v_entity.phone),
  'orders',v_orders,'services',v_services,'quotes',v_quotes);
end $function$;
