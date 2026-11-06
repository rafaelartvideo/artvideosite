-- Resumo em lote das quantidades com prazo de comercialização e aviso antecipado de 7 dias.
CREATE OR REPLACE FUNCTION public.get_inventory_sale_batch_summaries_v1(p_organization_id uuid)
 RETURNS TABLE(inventory_item_id uuid, tracked_quantity numeric, untracked_quantity numeric, warning_quantity numeric, overdue_quantity numeric, next_deadline timestamp with time zone, active_batch_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select b.inventory_item_id,
  coalesce(sum(b.remaining_quantity) filter(where b.sell_by_at is not null),0),
  coalesce(sum(b.remaining_quantity) filter(where b.sell_by_at is null),0),
  coalesce(sum(b.remaining_quantity) filter(where b.sell_by_at > now() and b.sell_by_at <= now()+interval '7 days'),0),
  coalesce(sum(b.remaining_quantity) filter(where b.sell_by_at <= now()),0),
  min(b.sell_by_at) filter(where b.sell_by_at > now()),
  count(*)
from public.inventory_sale_batches b
where b.organization_id=p_organization_id and b.remaining_quantity>0
group by b.inventory_item_id;
$function$
;
revoke all on function public.get_inventory_sale_batch_summaries_v1(uuid) from public,anon;
grant execute on function public.get_inventory_sale_batch_summaries_v1(uuid) to authenticated;
