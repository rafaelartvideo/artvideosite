-- Perdas: eventos operacionais de descarte/devolução sem caixa ou receita fictícia.
-- A visão mantém os lançamentos originais de orçamento e acrescenta apenas o registro das saídas.
create or replace view public.finance_losses_unified_v1 with (security_invoker=true) as
select l.id,l.organization_id,l.service_order_id,l.quote_version,l.os_number,
       l.customer_name,l.amount,l.reason,l.items_snapshot,l.status,l.occurred_at,l.confirmed_at,
       l.source_type,null::uuid as signature_request_id,null::uuid as evidence_media_id
from public.financial_losses l
union all
select e.id,e.organization_id,e.service_order_id,0 as quote_version,
       coalesce(e.order_snapshot->>'os_number','') as os_number,
       coalesce(c.full_name,c.legal_name,'') as customer_name,
       0::numeric(14,2) as amount,e.reason,e.stock_snapshot as items_snapshot,
       'confirmed'::text as status,e.confirmed_at as occurred_at,e.confirmed_at,
       e.outcome as source_type,e.signature_request_id,e.evidence_media_id
from public.service_order_terminal_closures e
join public.service_orders o on o.id=e.service_order_id and o.organization_id=e.organization_id
left join public.customers c on c.id=o.customer_id and c.organization_id=e.organization_id;
grant select on public.finance_losses_unified_v1 to authenticated;

create or replace function public.get_financial_terminal_outcomes_summary_v1(
 p_organization_id uuid,p_from timestamptz default null,p_until timestamptz default null
) returns jsonb language sql stable security invoker set search_path=''
as $sum$
 select jsonb_build_object(
   'disposal_count',count(*) filter(where outcome='disposal_confirmed'),
   'unrepaired_return_count',count(*) filter(where outcome='returned_unrepaired'),
   'stock_returned_quantity',coalesce(sum((select coalesce(sum(quantity_restored),0)
      from public.service_order_terminal_stock_lines s where s.closure_id=c.id)),0)
 )
 from public.service_order_terminal_closures c
 where c.organization_id=p_organization_id
 and (p_from is null or c.confirmed_at>=p_from)
 and (p_until is null or c.confirmed_at<p_until);
$sum$;
revoke all on function public.get_financial_terminal_outcomes_summary_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_financial_terminal_outcomes_summary_v1(uuid,timestamptz,timestamptz) to authenticated;
