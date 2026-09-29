
create or replace function public.search_financial_movement_page_ids_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default '',
  p_account_id uuid default null
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
      (
        private.can_access_finance(p_organization_id, 'finance.accounts.view')
        or private.can_access_finance(p_organization_id, 'finance.accounts.manage')
        or private.can_access_finance(p_organization_id, 'finance.reports.cash_flow')
      ) as can_view
  ),
  search_values as materialized (
    select lower(trim(coalesce(p_search, ''))) as needle
  ),
  filtered as (
    select movement.id, movement.occurred_at, movement.created_at
    from public.financial_movements movement
    left join public.financial_accounts account
      on account.id = movement.financial_account_id
     and account.organization_id = movement.organization_id
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.can_view
      and movement.organization_id = p_organization_id
      and (p_account_id is null or movement.financial_account_id = p_account_id)
      and (
        search.needle = ''
        or lower(coalesce(movement.description_snapshot, '')) like '%' || search.needle || '%'
        or lower(coalesce(account.name, '')) like '%' || search.needle || '%'
        or lower(
          case movement.movement_type
            when 'opening_balance' then 'saldo inicial'
            when 'receipt' then 'recebimento'
            when 'payment' then 'pagamento'
            when 'fee' then 'taxa financeira'
            when 'transfer_in' then 'transferência recebida'
            when 'transfer_out' then 'transferência enviada'
            when 'reversal' then 'estorno'
            when 'supply' then 'suprimento'
            when 'withdraw' then 'sangria'
            when 'cash_adjustment' then 'ajuste de caixa'
            else movement.movement_type
          end
        ) like '%' || search.needle || '%'
      )
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by ranked.occurred_at desc, ranked.created_at desc, ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

revoke all on function public.search_financial_movement_page_ids_v1(
  uuid, integer, integer, text, uuid
) from public, anon;

grant execute on function public.search_financial_movement_page_ids_v1(
  uuid, integer, integer, text, uuid
) to authenticated;

create index if not exists financial_movements_org_date_idx
  on public.financial_movements (
    organization_id,
    occurred_at desc,
    created_at desc
  );
