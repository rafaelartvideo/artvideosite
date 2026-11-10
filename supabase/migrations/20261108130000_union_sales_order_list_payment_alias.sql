-- Sincroniza o campo JSON da situação de pagamento com a lista de Pedidos.
begin;
create or replace function public.list_sales_orders_v1(
 p_organization_id uuid,
 p_search text default '',
 p_status text default 'all',
 p_payment text default 'all',
 p_from date default null,
 p_to date default null,
 p_page integer default 1,
 p_page_size integer default 15
) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare
 v_search text:=left(btrim(coalesce(p_search,'')),120);
 v_page integer:=greatest(1,coalesce(p_page,1));
 v_page_size integer:=least(50,greatest(5,coalesce(p_page_size,15)));
 v_count integer;
 v_pending integer;
 v_paid integer;
 v_total numeric;
 v_open numeric;
 v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.view'
 ) then raise exception 'Sem permissão para visualizar pedidos comerciais.' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_from>p_to then
   raise exception 'O período selecionado é inválido.' using errcode='22023'; end if;
 if coalesce(p_status,'all') not in ('all','confirmed','cancelled') then
   raise exception 'Filtro de situação inválido.' using errcode='22023'; end if;
 if coalesce(p_payment,'all') not in ('all','pending','partial','paid','cancelled') then
   raise exception 'Filtro de pagamento inválido.' using errcode='22023'; end if;
 with base as (
   select o.id,o.order_number,o.created_at,o.updated_at,o.status,
    o.fulfillment_status,o.customer_name_snapshot,o.customer_document_snapshot,
    o.total_amount,o.subtotal,o.discount_amount,o.due_date,o.financial_entry_id,
    coalesce(nullif(pr.full_name,''),'Não identificado') as seller_name,
    least(o.total_amount,greatest(0,coalesce(payment.received,0))) as received_amount
   from public.sales_orders o
   left join public.profiles pr on pr.id=o.created_by
   left join lateral (
     select sum(i.settled_amount) as received
     from public.financial_installments i
     where i.organization_id=p_organization_id and i.financial_entry_id=o.financial_entry_id
   ) payment on true
   where o.organization_id=p_organization_id
     and (v_search='' or o.order_number::text ilike '%'||v_search||'%'
       or coalesce(o.customer_name_snapshot,'') ilike '%'||v_search||'%'
       or coalesce(o.customer_document_snapshot,'') ilike '%'||v_search||'%'
       or exists (
         select 1 from public.sales_order_items item
         where item.organization_id=p_organization_id and item.order_id=o.id
           and (item.product_name_snapshot ilike '%'||v_search||'%'
             or coalesce(item.sku_snapshot,'') ilike '%'||v_search||'%')
       ))
     and (p_from is null or o.created_at::date>=p_from)
     and (p_to is null or o.created_at::date<=p_to)
 ), classified as (
   select b.*,
   case
    when b.status='cancelled' then 'cancelled'
    when b.received_amount>=b.total_amount-0.005 then 'paid'
    when b.received_amount>0 then 'partial'
    else 'pending'
   end as payment_status,
   greatest(0,b.total_amount-b.received_amount) as open_amount
   from base b
 ), filtered as (
   select * from classified
   where (coalesce(p_status,'all')='all' or status=p_status)
     and (coalesce(p_payment,'all')='all' or payment_status=p_payment)
 ), page_rows as (
   select * from filtered
   order by created_at desc,order_number desc
   limit v_page_size offset (v_page-1)*v_page_size
 )
 select
   (select count(*) from filtered),
   (select count(*) from filtered where payment_status in ('pending','partial')),
   (select count(*) from filtered where payment_status='paid'),
   (select coalesce(sum(total_amount),0) from filtered where status<>'cancelled'),
   (select coalesce(sum(open_amount),0) from filtered where status<>'cancelled'),
   (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.order_number desc),'[]'::jsonb)
      from page_rows p)
 into v_count,v_pending,v_paid,v_total,v_open,v_items;
 return jsonb_build_object(
   'total',v_count,'pending',v_pending,'paid',v_paid,
   'gross_total',v_total,'open_total',v_open,
   'page',v_page,'page_size',v_page_size,'items',v_items
 );
end;$function$;


revoke all on function public.list_sales_orders_v1(uuid,text,text,text,date,date,integer,integer) from public;
grant execute on function public.list_sales_orders_v1(uuid,text,text,text,date,date,integer,integer) to authenticated;
commit;
