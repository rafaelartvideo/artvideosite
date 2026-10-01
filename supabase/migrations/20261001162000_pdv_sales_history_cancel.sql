begin;

insert into public.permissions (key,label,description,module_name,sort_order)
values (
  'pdv.sales.cancel',
  'Cancelar vendas',
  'Permite cancelar uma venda do PDV, devolver o estoque e estornar os lançamentos financeiros relacionados.',
  'PDV — Vendas',
  2522
)
on conflict (key) do update set
  label=excluded.label,
  description=excluded.description,
  module_name=excluded.module_name,
  sort_order=excluded.sort_order;

insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id,p_cancel.id
from public.role_permissions rp
join public.permissions p_manage
  on p_manage.id=rp.permission_id
 and p_manage.key='pdv.settings.manage'
cross join public.permissions p_cancel
where p_cancel.key='pdv.sales.cancel'
on conflict (role_id,permission_id) do nothing;

create or replace function public.get_pdv_sales_page_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default '',
  p_status text default null
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
  v_search text := btrim(coalesce(p_search,''));
  v_status text := nullif(lower(btrim(coalesce(p_status,''))),'');
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.view') then
    raise exception 'Sem permissão para acessar as vendas do PDV.' using errcode='42501';
  end if;
  if v_status is not null and v_status not in ('completed','cancelled') then
    raise exception 'Status de venda inválido.' using errcode='22023';
  end if;

  select count(*) into v_total
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id
    and (v_status is null or sale.status=v_status)
    and (
      v_search=''
      or sale.sale_number::text ilike '%'||v_search||'%'
      or coalesce(sale.customer_name_snapshot,'') ilike '%'||v_search||'%'
      or coalesce(sale.customer_document_snapshot,'') ilike '%'||v_search||'%'
    );

  select coalesce(jsonb_agg(row_data order by sold_at desc),'[]'::jsonb)
    into v_items
  from (
    select
      jsonb_build_object(
        'id',sale.id,
        'sale_number',sale.sale_number,
        'status',sale.status,
        'customer_name',sale.customer_name_snapshot,
        'customer_document',sale.customer_document_snapshot,
        'total_amount',sale.total_amount,
        'change_amount',sale.change_amount,
        'sold_at',sale.sold_at,
        'sold_by_name',seller.full_name,
        'cancelled_at',sale.cancelled_at,
        'cancelled_by_name',canceller.full_name,
        'cancellation_reason',sale.cancellation_reason,
        'payment_methods',coalesce((
          select jsonb_agg(distinct payment.payment_method_name_snapshot)
          from public.pdv_sale_payments payment
          where payment.organization_id=sale.organization_id
            and payment.sale_id=sale.id
        ),'[]'::jsonb)
      ) as row_data,
      sale.sold_at
    from public.pdv_sales sale
    left join public.profiles seller on seller.id=sale.sold_by
    left join public.profiles canceller on canceller.id=sale.cancelled_by
    where sale.organization_id=p_organization_id
      and (v_status is null or sale.status=v_status)
      and (
        v_search=''
        or sale.sale_number::text ilike '%'||v_search||'%'
        or coalesce(sale.customer_name_snapshot,'') ilike '%'||v_search||'%'
        or coalesce(sale.customer_document_snapshot,'') ilike '%'||v_search||'%'
      )
    order by sale.sold_at desc
    offset (v_page-1)*v_page_size
    limit v_page_size
  ) rows_page;

  return jsonb_build_object(
    'items',v_items,
    'total_count',v_total,
    'page',v_page,
    'page_size',v_page_size,
    'total_pages',greatest(1,ceil(v_total::numeric/v_page_size)::integer)
  );
end;
$$;

revoke all on function public.get_pdv_sales_page_v1(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.get_pdv_sales_page_v1(uuid,integer,integer,text,text) to authenticated;

create or replace function public.get_pdv_sale_detail_v1(
  p_organization_id uuid,
  p_sale_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_sale public.pdv_sales%rowtype;
  v_seller_name text;
  v_canceller_name text;
  v_items jsonb;
  v_payments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.view') then
    raise exception 'Sem permissão para acessar as vendas do PDV.' using errcode='42501';
  end if;

  select sale.* into v_sale
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id and sale.id=p_sale_id;
  if not found then
    raise exception 'Venda do PDV não encontrada.' using errcode='P0002';
  end if;

  select profile.full_name into v_seller_name from public.profiles profile where profile.id=v_sale.sold_by;
  select profile.full_name into v_canceller_name from public.profiles profile where profile.id=v_sale.cancelled_by;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',item.id,'product_id',item.product_id,'product_name',item.product_name_snapshot,
      'sku',item.sku_snapshot,'barcode',item.barcode_snapshot,'quantity',item.quantity,
      'unit',item.unit_snapshot,'unit_price',item.unit_price,'line_subtotal',item.line_subtotal
    ) order by item.created_at,item.id
  ),'[]'::jsonb)
  into v_items
  from public.pdv_sale_items item
  where item.organization_id=p_organization_id and item.sale_id=p_sale_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',payment.id,'payment_method_id',payment.payment_method_id,
      'payment_method_name',payment.payment_method_name_snapshot,
      'method_type',payment.method_type_snapshot,
      'financial_account_name',payment.financial_account_name_snapshot,
      'amount',payment.amount,'tendered_amount',payment.tendered_amount,
      'change_amount',payment.change_amount,'fee_amount',payment.fee_amount,
      'settlement_status',coalesce(settlement.settlement_status,payment.settlement_status_snapshot)
    ) order by payment.created_at,payment.id
  ),'[]'::jsonb)
  into v_payments
  from public.pdv_sale_payments payment
  left join public.financial_settlements settlement
    on settlement.organization_id=payment.organization_id and settlement.id=payment.settlement_id
  where payment.organization_id=p_organization_id and payment.sale_id=p_sale_id;

  return jsonb_build_object(
    'id',v_sale.id,'sale_number',v_sale.sale_number,'status',v_sale.status,
    'customer_id',v_sale.customer_id,'customer_name',v_sale.customer_name_snapshot,
    'customer_document',v_sale.customer_document_snapshot,'subtotal',v_sale.subtotal,
    'discount_amount',v_sale.discount_amount,'surcharge_amount',v_sale.surcharge_amount,
    'total_amount',v_sale.total_amount,'change_amount',v_sale.change_amount,
    'notes',v_sale.notes,'sold_at',v_sale.sold_at,'sold_by_name',v_seller_name,
    'cancelled_at',v_sale.cancelled_at,'cancelled_by_name',v_canceller_name,
    'cancellation_reason',v_sale.cancellation_reason,'items',v_items,'payments',v_payments
  );
end;
$$;

revoke all on function public.get_pdv_sale_detail_v1(uuid,uuid) from public,anon;
grant execute on function public.get_pdv_sale_detail_v1(uuid,uuid) to authenticated;

create or replace function public.cancel_pdv_sale_v1(
  p_organization_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_sale public.pdv_sales%rowtype;
  v_item public.pdv_sale_items%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_payment public.pdv_sale_payments%rowtype;
  v_settlement public.financial_settlements%rowtype;
  v_installment public.financial_installments%rowtype;
  v_movement public.financial_movements%rowtype;
  v_cash_session_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.sales.cancel') then
    raise exception 'Sem permissão para cancelar vendas do PDV.' using errcode='42501';
  end if;
  if v_reason is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode='22023';
  end if;

  select sale.* into v_sale
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id and sale.id=p_sale_id
  for update;
  if not found then
    raise exception 'Venda do PDV não encontrada.' using errcode='P0002';
  end if;
  if v_sale.status='cancelled' then
    raise exception 'Esta venda já foi cancelada.' using errcode='22023';
  end if;

  for v_item in
    select * from public.pdv_sale_items item
    where item.organization_id=p_organization_id and item.sale_id=p_sale_id
    order by item.inventory_item_id
  loop
    select stock.* into v_inventory
    from public.inventory_items stock
    where stock.organization_id=p_organization_id and stock.id=v_item.inventory_item_id
    for update;
    if not found then
      raise exception 'O item de estoque da venda não foi encontrado.' using errcode='P0002';
    end if;

    insert into public.inventory_movements (
      organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
      input_unit,input_quantity,conversion_factor_snapshot,unit_cost,total_cost,
      previous_quantity,resulting_quantity,average_cost_before,average_cost_after,notes,movement_origin
    ) values (
      p_organization_id,v_inventory.id,'IN',v_item.base_quantity,
      'Cancelamento venda PDV #'||v_sale.sale_number,v_user_id,
      v_item.unit_snapshot,v_item.quantity,v_item.conversion_factor_snapshot,
      v_item.average_cost_snapshot,v_item.total_cost_snapshot,
      v_inventory.quantity,v_inventory.quantity+v_item.base_quantity,
      v_inventory.average_cost,v_inventory.average_cost,
      'Devolução automática por cancelamento da venda PDV #'||v_sale.sale_number,'return'
    );

    update public.inventory_items
    set quantity=quantity+v_item.base_quantity,updated_at=v_now
    where organization_id=p_organization_id and id=v_inventory.id;
  end loop;

  for v_payment in
    select * from public.pdv_sale_payments payment
    where payment.organization_id=p_organization_id and payment.sale_id=p_sale_id
    order by payment.id
  loop
    if v_payment.settlement_id is null then continue; end if;

    select settlement.* into v_settlement
    from public.financial_settlements settlement
    where settlement.organization_id=p_organization_id and settlement.id=v_payment.settlement_id
    for update;
    if not found then
      raise exception 'Uma baixa financeira da venda não foi encontrada.' using errcode='P0002';
    end if;

    if v_settlement.settlement_status='reversed' then
      update public.pdv_sale_payments set settlement_status_snapshot='reversed'
      where organization_id=p_organization_id and id=v_payment.id;
      continue;
    end if;

    if v_payment.method_type_snapshot='cash' then
      v_cash_session_id := private.current_financial_cash_session(
        p_organization_id,v_payment.financial_account_id,true
      );
      if v_cash_session_id is null then
        raise exception 'Abra o caixa antes de cancelar uma venda recebida em dinheiro.' using errcode='22023';
      end if;
    else
      v_cash_session_id := null;
    end if;

    select installment.* into v_installment
    from public.financial_installments installment
    where installment.organization_id=p_organization_id and installment.id=v_settlement.financial_installment_id
    for update;
    if not found then
      raise exception 'A parcela financeira vinculada à venda não foi encontrada.' using errcode='P0002';
    end if;

    if v_settlement.settlement_status='posted' then
      for v_movement in
        select movement.* from public.financial_movements movement
        where movement.organization_id=p_organization_id
          and movement.source_type='settlement'
          and movement.source_id=v_settlement.id
          and not exists (
            select 1 from public.financial_movements reversal
            where reversal.organization_id=p_organization_id
              and reversal.reversal_of_movement_id=movement.id
          )
        order by movement.created_at,movement.id
      loop
        insert into public.financial_movements (
          organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
          source_type,source_id,reversal_of_movement_id,cash_session_id,description_snapshot,created_by
        ) values (
          p_organization_id,v_movement.financial_account_id,
          case when v_movement.direction='credit' then 'debit' else 'credit' end,
          'reversal',v_movement.amount,v_now,'settlement_reversal',v_settlement.id,
          v_movement.id,v_cash_session_id,
          'Cancelamento PDV #'||v_sale.sale_number||' — '||v_movement.description_snapshot,v_user_id
        );
      end loop;
    end if;

    update public.financial_installments
    set settled_amount=greatest(0,round(settled_amount-v_settlement.principal_amount,2)),settled_at=null
    where organization_id=p_organization_id and id=v_installment.id;

    update public.financial_settlements
    set settlement_status='reversed',reversed_at=v_now,reversed_by=v_user_id,reversal_reason=v_reason
    where organization_id=p_organization_id and id=v_settlement.id;

    update public.pdv_sale_payments set settlement_status_snapshot='reversed'
    where organization_id=p_organization_id and id=v_payment.id;

    insert into public.financial_events (
      organization_id,financial_entry_id,event_type,event_data,created_by
    ) values (
      p_organization_id,v_settlement.financial_entry_id,'settlement_reversed',
      jsonb_build_object('settlement_id',v_settlement.id,'reason',v_reason,'origin','pdv_sale_cancel','pdv_sale_id',v_sale.id),
      v_user_id
    );
  end loop;

  if v_sale.financial_entry_id is not null then
    update public.financial_entries
    set approval_status='reversed',reversed_at=v_now,updated_by=v_user_id,updated_at=v_now
    where organization_id=p_organization_id and id=v_sale.financial_entry_id;

    insert into public.financial_events (
      organization_id,financial_entry_id,event_type,event_data,created_by
    ) values (
      p_organization_id,v_sale.financial_entry_id,'pdv_sale_cancelled',
      jsonb_build_object('pdv_sale_id',v_sale.id,'sale_number',v_sale.sale_number,'reason',v_reason),
      v_user_id
    );
  end if;

  update public.pdv_sales
  set status='cancelled',cancelled_at=v_now,cancelled_by=v_user_id,cancellation_reason=v_reason
  where organization_id=p_organization_id and id=v_sale.id;

  return jsonb_build_object(
    'id',v_sale.id,'sale_number',v_sale.sale_number,'status','cancelled',
    'cancelled_at',v_now,'reason',v_reason
  );
end;
$$;

revoke all on function public.cancel_pdv_sale_v1(uuid,uuid,text) from public,anon;
grant execute on function public.cancel_pdv_sale_v1(uuid,uuid,text) to authenticated;

commit;
