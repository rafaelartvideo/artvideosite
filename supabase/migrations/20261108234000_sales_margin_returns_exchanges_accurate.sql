-- Troca equivalente preserva faturamento; reembolso reduz faturamento.
-- Custo considera mercadoria restocada e substitutos; saldo vem do Financeiro.
begin;
create or replace function public.get_sales_management_v1(
 p_organization_id uuid,p_month date
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
 v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
 v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
 v_can_margin boolean;
 v_cards jsonb;
 v_sellers jsonb;
 v_products jsonb;
 v_trend jsonb;
 v_seller_choices jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.reports.view')
 then raise exception 'Sem permissão para consultar indicadores comerciais.' using errcode='42501'; end if;
 if p_month is not null and (extract(day from p_month)<>1 or p_month<date '2020-01-01'
   or p_month>current_date+interval '1 year') then
   raise exception 'Selecione o primeiro dia de um mês válido.' using errcode='22023'; end if;
 v_can_margin:=private.has_tenant_module_permission(p_organization_id,'sales','sales.reports.margin.view');

 with sold as (
   select o.id,o.created_by,o.total_amount,o.subtotal,o.discount_amount,
    o.financial_entry_id,
    coalesce((select sum(i.settled_amount) from public.financial_installments i
      where i.organization_id=p_organization_id and i.financial_entry_id=o.financial_entry_id),0) as paid_amount,
    coalesce((select sum(r.gross_credit_amount) from public.sales_order_returns r
      where r.organization_id=p_organization_id and r.order_id=o.id and r.request_type='refund'
        and r.status in ('received','closed','awaiting_finance')),0) as credited_amount,
    (
      coalesce((select sum(i.base_quantity*i.unit_cost_snapshot)
        from public.sales_order_items i
        where i.organization_id=p_organization_id and i.order_id=o.id),0)
      - coalesce((select sum(ri.quantity/si.quantity*si.base_quantity*si.unit_cost_snapshot)
        from public.sales_order_return_items ri
        join public.sales_order_items si on si.id=ri.order_item_id and si.organization_id=ri.organization_id
        join public.sales_order_returns sr on sr.id=ri.return_id and sr.organization_id=ri.organization_id
        where sr.organization_id=p_organization_id and sr.order_id=o.id
          and sr.status in ('received','closed','awaiting_finance')
          and sr.disposition='restock'),0)
      + coalesce((select sum(x.base_quantity*x.unit_cost_snapshot)
        from public.sales_order_exchange_items x
        join public.sales_order_returns sr on sr.id=x.return_id and sr.organization_id=x.organization_id
        where sr.organization_id=p_organization_id and sr.order_id=o.id
          and sr.status='closed'),0)
    ) as cost_estimate,
    (exists(select 1 from public.sales_order_items i where i.organization_id=p_organization_id
      and i.order_id=o.id and i.unit_cost_snapshot is null)
      or exists(select 1 from public.sales_order_exchange_items x
       join public.sales_order_returns sr on sr.id=x.return_id and sr.organization_id=x.organization_id
       where sr.organization_id=p_organization_id and sr.order_id=o.id
         and x.unit_cost_snapshot is null)) as missing_cost,
    coalesce((select case when e.approval_status='cancelled' then 0
      else e.original_amount end from public.financial_entries e
      where e.organization_id=p_organization_id and e.id=o.financial_entry_id),o.total_amount)
      as invoiced_amount
   from public.sales_orders o
   where o.organization_id=p_organization_id and o.status='confirmed'
    and o.created_at>=v_start and o.created_at<v_end
 ), rollup as(
   select count(*) orders,
    coalesce(sum(total_amount),0) gross_sales,
    coalesce(sum(credited_amount),0) returns,
    coalesce(sum(total_amount-credited_amount),0) net_sales,
    coalesce(sum(least(total_amount,paid_amount)),0) receipts,
    coalesce(sum(greatest(0,invoiced_amount-paid_amount)),0) open_receivables,
    case when count(*)>0 then round(sum(total_amount-credited_amount)/count(*),2) else 0 end ticket,
    case when bool_or(missing_cost) then null
      else round(sum(total_amount-credited_amount-cost_estimate),2) end estimated_margin
   from sold
 )
 select jsonb_build_object('orders',orders,'gross_sales',gross_sales,
    'returns',returns,'net_sales',net_sales,'received',receipts,
    'open_receivables',open_receivables,'average_ticket',ticket,
    'estimated_margin',case when v_can_margin then estimated_margin else null end,
    'margin_available',v_can_margin and estimated_margin is not null)
 into v_cards from rollup;

 with sales_agg as(
   select o.created_by as seller_id,
    count(*) orders,
    sum(o.total_amount) gross,
    sum(coalesce((select sum(r.gross_credit_amount) from public.sales_order_returns r
       where r.organization_id=p_organization_id and r.order_id=o.id and r.request_type='refund'
       and r.status in ('received','closed','awaiting_finance')),0)) returns,
    sum(least(o.total_amount,coalesce((select sum(i.settled_amount) from public.financial_installments i
       where i.organization_id=p_organization_id and i.financial_entry_id=o.financial_entry_id),0))) received
   from public.sales_orders o
   where o.organization_id=p_organization_id and o.status='confirmed'
      and o.created_at>=v_start and o.created_at<v_end
   group by o.created_by
 ), sellers as(
   select m.user_id,p.full_name,
    coalesce(a.orders,0) orders,
    coalesce(a.gross,0) gross,
    coalesce(a.returns,0) returned,
    greatest(0,coalesce(a.gross,0)-coalesce(a.returns,0)) net,
    greatest(0,coalesce(a.received,0)-coalesce(a.returns,0)) received_net,
    coalesce(g.target_amount,0) target,
    coalesce(g.commission_percent,0) rate,
    coalesce(g.commission_basis,'received') commission_basis
   from public.organization_members m
   join public.profiles p on p.id=m.user_id
   left join sales_agg a on a.seller_id=m.user_id
   left join public.sales_seller_goals g on g.organization_id=p_organization_id
     and g.seller_id=m.user_id and g.month_start=v_start
   where m.organization_id=p_organization_id and m.status='active'
 ), results as(
   select *,round((case when commission_basis='confirmed' then net else received_net end)
     *rate/100,2) commission_estimated
   from sellers
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'seller_id',user_id,'name',full_name,'orders',orders,'gross',gross,
   'returned',returned,'net',net,'received_net',received_net,
   'target',target,'rate',rate,'basis',commission_basis,
   'commission_estimated',commission_estimated,
   'progress',case when target>0 then round(net/target*100,1) else 0 end
 ) order by net desc,full_name),'[]'::jsonb)
 into v_sellers from results;

 with bought as(
   select i.product_id,max(i.product_name_snapshot) name,
    sum(i.quantity) units,sum(i.line_total) gross,
    sum(coalesce((select sum(ri.quantity) from public.sales_order_return_items ri
      join public.sales_order_returns r on r.id=ri.return_id and r.organization_id=ri.organization_id
      where ri.order_item_id=i.id and ri.organization_id=p_organization_id
       and r.status in ('received','closed','awaiting_finance')),0)) returned_units,
    sum(coalesce((select sum(ri.credit_amount) from public.sales_order_return_items ri
      join public.sales_order_returns r on r.id=ri.return_id and r.organization_id=ri.organization_id
      where ri.order_item_id=i.id and ri.organization_id=p_organization_id
       and r.status in ('received','closed','awaiting_finance')),0)) returns
   from public.sales_order_items i
   join public.sales_orders o on o.id=i.order_id and o.organization_id=i.organization_id
   where i.organization_id=p_organization_id and o.status='confirmed'
     and o.created_at>=v_start and o.created_at<v_end
   group by i.product_id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'product_id',product_id,'name',name,'units',units-returned_units,
   'total',gross-returns
 ) order by gross-returns desc,name),'[]'::jsonb)
 into v_products
 from (select * from bought order by gross-returns desc limit 12) ranked;

 with months as(
   select generate_series((v_start-interval '5 months')::date,v_start,interval '1 month')::date as month
 ), vals as(
   select m.month,coalesce(sum(o.total_amount),0) gross,
     coalesce(sum(coalesce((select sum(r.gross_credit_amount)
       from public.sales_order_returns r where r.organization_id=p_organization_id
        and r.order_id=o.id and r.request_type='refund' and r.status in ('received','closed','awaiting_finance')),0)),0) returned
   from months m left join public.sales_orders o
    on o.organization_id=p_organization_id and o.status='confirmed'
    and o.created_at>=m.month and o.created_at<m.month+interval '1 month'
   group by m.month
 )
 select coalesce(jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),
   'gross',gross,'net',gross-returned) order by month),'[]'::jsonb)
 into v_trend from vals;

 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name)
   order by p.full_name),'[]'::jsonb)
 into v_seller_choices
 from public.organization_members m join public.profiles p on p.id=m.user_id
 where m.organization_id=p_organization_id and m.status='active';

 return jsonb_build_object('month',to_char(v_start,'YYYY-MM'),
  'summary',v_cards,'sellers',v_sellers,'top_products',v_products,
  'trend',v_trend,'seller_choices',v_seller_choices,
  'can_manage_goals',private.has_tenant_module_permission(p_organization_id,'sales','sales.targets.manage'));
end;$function$;
revoke all on function public.get_sales_management_v1(uuid,date) from public,anon;
grant execute on function public.get_sales_management_v1(uuid,date) to authenticated;
commit;
