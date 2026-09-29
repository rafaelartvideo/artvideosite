
create or replace function public.search_scheduled_financial_settlement_page_ids_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 10
)
returns table(id uuid, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      private.can_access_finance(
        p_organization_id,
        'finance.receivables.view'
      ) as can_view_receivables,
      private.can_access_finance(
        p_organization_id,
        'finance.payables.view'
      ) as can_view_payables
  ),
  filtered as (
    select settlement.id, settlement.expected_settlement_at, settlement.created_at
    from public.financial_settlements settlement
    cross join access_context access
    where access.user_id is not null
      and settlement.organization_id = p_organization_id
      and settlement.settlement_status = 'scheduled'
      and (
        (settlement.entry_type = 'receivable' and access.can_view_receivables)
        or
        (settlement.entry_type = 'payable' and access.can_view_payables)
      )
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by ranked.expected_settlement_at asc, ranked.created_at asc, ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

revoke all on function public.search_scheduled_financial_settlement_page_ids_v1(
  uuid, integer, integer
) from public, anon;

grant execute on function public.search_scheduled_financial_settlement_page_ids_v1(
  uuid, integer, integer
) to authenticated;
