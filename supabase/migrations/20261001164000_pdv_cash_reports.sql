begin;

alter table public.pdv_sales
  add column if not exists cash_session_id uuid references public.financial_cash_sessions(id) on delete restrict;

create index if not exists pdv_sales_cash_session_idx
  on public.pdv_sales (organization_id,cash_session_id,sold_at desc)
  where cash_session_id is not null;

create or replace function private.pdv_sale_set_cash_session()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_account_id uuid;
begin
  if new.cash_session_id is not null then
    if not exists (
      select 1
      from public.financial_cash_sessions session
      where session.organization_id=new.organization_id
        and session.id=new.cash_session_id
    ) then
      raise exception 'A sessão de caixa informada não pertence à empresa da venda.' using errcode='23503';
    end if;
    return new;
  end if;

  select settings.default_cash_account_id
    into v_account_id
  from public.pdv_settings settings
  where settings.organization_id=new.organization_id;

  if v_account_id is null then
    return new;
  end if;

  select session.id
    into new.cash_session_id
  from public.financial_cash_sessions session
  where session.organization_id=new.organization_id
    and session.financial_account_id=v_account_id
    and session.status='open'
  order by session.opened_at desc
  limit 1;

  return new;
end;
$$;

drop trigger if exists pdv_sale_set_cash_session on public.pdv_sales;
create trigger pdv_sale_set_cash_session
before insert on public.pdv_sales
for each row execute function private.pdv_sale_set_cash_session();

insert into public.permissions (key,label,description,module_name,sort_order)
values (
  'pdv.cash.reports',
  'Ver relatórios de caixa',
  'Permite consultar turnos, resumo de vendas, movimentações e diferenças do caixa do PDV.',
  'PDV — Caixa',
  2534
)
on conflict (key) do update set
  label=excluded.label,
  description=excluded.description,
  module_name=excluded.module_name,
  sort_order=excluded.sort_order;

insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id,p_report.id
from public.role_permissions rp
join public.permissions existing_permission
  on existing_permission.id=rp.permission_id
 and existing_permission.key in ('pdv.cash.close','pdv.settings.manage')
cross join public.permissions p_report
where p_report.key='pdv.cash.reports'
on conflict (role_id,permission_id) do nothing;

create or replace function public.get_pdv_cash_sessions_page_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_page integer := greatest(1,coalesce(p_page,1));
  v_page_size integer := least(100,greatest(5,coalesce(p_page_size,20)));
  v_account_id uuid;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.cash.reports'
  ) then
    raise exception 'Sem permissão para visualizar os relatórios de caixa do PDV.' using errcode='42501';
  end if;

  select settings.default_cash_account_id
    into v_account_id
  from public.pdv_settings settings
  where settings.organization_id=p_organization_id;

  if v_account_id is null then
    return jsonb_build_object(
      'items','[]'::jsonb,
      'total_count',0,
      'page',v_page,
      'page_size',v_page_size,
      'total_pages',1
    );
  end if;

  select count(*)
    into v_total
  from public.financial_cash_sessions session
  where session.organization_id=p_organization_id
    and session.financial_account_id=v_account_id;

  select coalesce(jsonb_agg(row_data order by opened_at desc),'[]'::jsonb)
    into v_items
  from (
    select
      jsonb_build_object(
        'id',session.id,
        'status',session.status,
        'account_id',session.financial_account_id,
        'account_name',account.name,
        'opened_at',session.opened_at,
        'opened_by_name',opener.full_name,
        'closed_at',session.closed_at,
        'closed_by_name',closer.full_name,
        'opening_expected_amount',session.opening_expected_amount,
        'opening_counted_amount',session.opening_counted_amount,
        'opening_difference',session.opening_difference,
        'expected_amount',
          case
            when session.status='closed' then session.closing_expected_amount
            else round(
              session.opening_counted_amount
              + coalesce((
                select sum(
                  case when movement.direction='credit' then movement.amount else -movement.amount end
                )
                from public.financial_movements movement
                where movement.organization_id=session.organization_id
                  and movement.cash_session_id=session.id
                  and movement.movement_type<>'cash_adjustment'
              ),0),
              2
            )
          end,
        'closing_counted_amount',session.closing_counted_amount,
        'closing_difference',session.closing_difference,
        'sales_count',(
          select count(*)
          from public.pdv_sales sale
          where sale.organization_id=session.organization_id
            and sale.cash_session_id=session.id
            and sale.status='completed'
        ),
        'sales_total',coalesce((
          select sum(sale.total_amount)
          from public.pdv_sales sale
          where sale.organization_id=session.organization_id
            and sale.cash_session_id=session.id
            and sale.status='completed'
        ),0),
        'cancelled_sales_count',(
          select count(*)
          from public.pdv_sales sale
          where sale.organization_id=session.organization_id
            and sale.cash_session_id=session.id
            and sale.status='cancelled'
        )
      ) as row_data,
      session.opened_at
    from public.financial_cash_sessions session
    join public.financial_accounts account
      on account.organization_id=session.organization_id
     and account.id=session.financial_account_id
    left join public.profiles opener on opener.id=session.opened_by
    left join public.profiles closer on closer.id=session.closed_by
    where session.organization_id=p_organization_id
      and session.financial_account_id=v_account_id
    order by session.opened_at desc
    offset (v_page-1)*v_page_size
    limit v_page_size
  ) page_rows;

  return jsonb_build_object(
    'items',v_items,
    'total_count',v_total,
    'page',v_page,
    'page_size',v_page_size,
    'total_pages',greatest(1,ceil(v_total::numeric/v_page_size)::integer)
  );
end;
$$;

revoke all on function public.get_pdv_cash_sessions_page_v1(uuid,integer,integer) from public,anon;
grant execute on function public.get_pdv_cash_sessions_page_v1(uuid,integer,integer) to authenticated;

create or replace function public.get_pdv_cash_session_report_v1(
  p_organization_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_settings public.pdv_settings%rowtype;
  v_session public.financial_cash_sessions%rowtype;
  v_account public.financial_accounts%rowtype;
  v_opened_by_name text;
  v_closed_by_name text;
  v_net_movements numeric(14,2) := 0;
  v_expected numeric(14,2) := 0;
  v_receipts numeric(14,2) := 0;
  v_supplies numeric(14,2) := 0;
  v_withdrawals numeric(14,2) := 0;
  v_reversals numeric(14,2) := 0;
  v_fees numeric(14,2) := 0;
  v_other_credits numeric(14,2) := 0;
  v_other_debits numeric(14,2) := 0;
  v_sales_count bigint := 0;
  v_sales_total numeric(14,2) := 0;
  v_cash_sales_total numeric(14,2) := 0;
  v_cancelled_count bigint := 0;
  v_cancelled_total numeric(14,2) := 0;
  v_payment_breakdown jsonb := '[]'::jsonb;
  v_movements jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.cash.reports'
  ) then
    raise exception 'Sem permissão para visualizar o relatório de caixa do PDV.' using errcode='42501';
  end if;

  select settings.*
    into v_settings
  from public.pdv_settings settings
  where settings.organization_id=p_organization_id;

  if not found or v_settings.default_cash_account_id is null then
    raise exception 'O PDV ainda não possui um caixa padrão configurado.' using errcode='22023';
  end if;

  select session.*
    into v_session
  from public.financial_cash_sessions session
  where session.organization_id=p_organization_id
    and session.id=p_session_id
    and session.financial_account_id=v_settings.default_cash_account_id;

  if not found then
    raise exception 'Sessão de caixa do PDV não encontrada.' using errcode='P0002';
  end if;

  select account.*
    into v_account
  from public.financial_accounts account
  where account.organization_id=p_organization_id
    and account.id=v_session.financial_account_id;

  select profile.full_name into v_opened_by_name
  from public.profiles profile
  where profile.id=v_session.opened_by;

  select profile.full_name into v_closed_by_name
  from public.profiles profile
  where profile.id=v_session.closed_by;

  select
    coalesce(sum(
      case
        when movement.movement_type='cash_adjustment' then 0
        when movement.direction='credit' then movement.amount
        else -movement.amount
      end
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='credit' and movement.movement_type='receipt'
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='credit' and movement.movement_type='supply'
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='debit' and movement.movement_type='withdraw'
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='debit' and movement.movement_type='reversal'
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='debit' and movement.movement_type='fee'
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='credit'
        and movement.movement_type not in ('receipt','supply','cash_adjustment')
    ),0),
    coalesce(sum(movement.amount) filter (
      where movement.direction='debit'
        and movement.movement_type not in ('withdraw','reversal','fee','cash_adjustment')
    ),0)
  into
    v_net_movements,
    v_receipts,
    v_supplies,
    v_withdrawals,
    v_reversals,
    v_fees,
    v_other_credits,
    v_other_debits
  from public.financial_movements movement
  where movement.organization_id=p_organization_id
    and movement.cash_session_id=p_session_id;

  v_expected := case
    when v_session.status='closed' and v_session.closing_expected_amount is not null
      then v_session.closing_expected_amount
    else round(v_session.opening_counted_amount+v_net_movements,2)
  end;

  select count(*),coalesce(sum(sale.total_amount),0)
  into v_sales_count,v_sales_total
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id
    and sale.cash_session_id=p_session_id
    and sale.status='completed';

  select count(*),coalesce(sum(sale.total_amount),0)
  into v_cancelled_count,v_cancelled_total
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id
    and sale.cash_session_id=p_session_id
    and sale.status='cancelled';

  select coalesce(sum(payment.amount),0)
    into v_cash_sales_total
  from public.pdv_sale_payments payment
  join public.pdv_sales sale
    on sale.organization_id=payment.organization_id
   and sale.id=payment.sale_id
  where payment.organization_id=p_organization_id
    and sale.cash_session_id=p_session_id
    and sale.status='completed'
    and payment.method_type_snapshot='cash'
    and payment.settlement_status_snapshot<>'reversed';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'payment_method_id',breakdown.payment_method_id,
      'payment_method_name',breakdown.payment_method_name,
      'method_type',breakdown.method_type,
      'sales_count',breakdown.sales_count,
      'amount',breakdown.amount,
      'fee_amount',breakdown.fee_amount
    )
    order by breakdown.amount desc,breakdown.payment_method_name
  ),'[]'::jsonb)
  into v_payment_breakdown
  from (
    select
      payment.payment_method_id,
      payment.payment_method_name_snapshot as payment_method_name,
      payment.method_type_snapshot as method_type,
      count(distinct sale.id) as sales_count,
      round(sum(payment.amount),2) as amount,
      round(sum(payment.fee_amount),2) as fee_amount
    from public.pdv_sale_payments payment
    join public.pdv_sales sale
      on sale.organization_id=payment.organization_id
     and sale.id=payment.sale_id
    where payment.organization_id=p_organization_id
      and sale.cash_session_id=p_session_id
      and sale.status='completed'
      and payment.settlement_status_snapshot<>'reversed'
    group by payment.payment_method_id,payment.payment_method_name_snapshot,payment.method_type_snapshot
  ) breakdown;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',movement.id,
      'direction',movement.direction,
      'movement_type',movement.movement_type,
      'amount',movement.amount,
      'occurred_at',movement.occurred_at,
      'description',movement.description_snapshot,
      'created_by_name',profile.full_name
    )
    order by movement.occurred_at desc,movement.created_at desc
  ),'[]'::jsonb)
  into v_movements
  from (
    select movement.*
    from public.financial_movements movement
    where movement.organization_id=p_organization_id
      and movement.cash_session_id=p_session_id
    order by movement.occurred_at desc,movement.created_at desc
    limit 200
  ) movement
  left join public.profiles profile on profile.id=movement.created_by;

  return jsonb_build_object(
    'session',jsonb_build_object(
      'id',v_session.id,
      'status',v_session.status,
      'account_id',v_session.financial_account_id,
      'account_name',v_account.name,
      'opened_at',v_session.opened_at,
      'opened_by_name',v_opened_by_name,
      'opening_expected_amount',v_session.opening_expected_amount,
      'opening_counted_amount',v_session.opening_counted_amount,
      'opening_difference',v_session.opening_difference,
      'opening_note',v_session.opening_note,
      'expected_amount',v_expected,
      'closing_expected_amount',v_session.closing_expected_amount,
      'closing_counted_amount',v_session.closing_counted_amount,
      'closing_difference',v_session.closing_difference,
      'closing_reason',v_session.closing_reason,
      'closed_at',v_session.closed_at,
      'closed_by_name',v_closed_by_name
    ),
    'sales',jsonb_build_object(
      'completed_count',v_sales_count,
      'completed_total',v_sales_total,
      'cash_total',v_cash_sales_total,
      'cancelled_count',v_cancelled_count,
      'cancelled_total',v_cancelled_total
    ),
    'cash_movements',jsonb_build_object(
      'receipts',v_receipts,
      'supplies',v_supplies,
      'withdrawals',v_withdrawals,
      'reversals',v_reversals,
      'fees',v_fees,
      'other_credits',v_other_credits,
      'other_debits',v_other_debits,
      'net',v_net_movements
    ),
    'payment_breakdown',v_payment_breakdown,
    'movements',v_movements
  );
end;
$$;

revoke all on function public.get_pdv_cash_session_report_v1(uuid,uuid) from public,anon;
grant execute on function public.get_pdv_cash_session_report_v1(uuid,uuid) to authenticated;

commit;
