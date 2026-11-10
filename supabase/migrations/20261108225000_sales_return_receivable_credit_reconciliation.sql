begin;
alter table public.sales_order_returns
  add column if not exists receivable_credit_amount numeric(14,2) not null default 0
    check(receivable_credit_amount>=0),
  add column if not exists finance_reconciled_at timestamptz,
  add column if not exists finance_reconciled_by uuid references public.profiles(id) on delete set null;
create index if not exists sales_returns_finance_reconciler_idx
  on public.sales_order_returns(finance_reconciled_by)
  where finance_reconciled_by is not null;

-- Ajuste deliberado, atômico e auditável da cobrança remanescente.
-- Não registra baixa fictícia de dinheiro. Se houver excedente ao saldo em aberto,
-- cria uma conta a pagar de reembolso real, que será paga normalmente no Financeiro.
create or replace function public.reconcile_sales_return_credit_v1(
  p_organization_id uuid,p_return_id uuid,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
  v_actor uuid:=auth.uid();
  v_return public.sales_order_returns%rowtype;
  v_order public.sales_orders%rowtype;
  v_entry public.financial_entries%rowtype;
  v_inst public.financial_installments%rowtype;
  v_finance_settings public.financial_settings%rowtype;
  v_category public.financial_categories%rowtype;
  v_alloc public.financial_allocations%rowtype;
  v_paid numeric(14,2):=0;
  v_credit numeric(14,2);
  v_due numeric(14,2);
  v_reduction numeric(14,2);
  v_remainder numeric(14,2);
  v_reduction_left numeric(14,2);
  v_cut numeric(14,2);
  v_new_original numeric(14,2);
  v_refund_due numeric(14,2);
  v_refund_id uuid;
  v_reason text:=left(btrim(coalesce(p_reason,'')),500);
  v_alloc_count integer;
begin
  if v_actor is null or
     not private.has_tenant_module_permission(p_organization_id,'sales','sales.returns.approve') or
     not private.can_access_finance(p_organization_id,'finance.receivables.edit') then
    raise exception 'É necessária permissão para devoluções e edição de Contas a Receber.'
      using errcode='42501';
  end if;
  if length(v_reason)<10 then
    raise exception 'Informe um motivo para a conciliação (mínimo 10 caracteres).'
      using errcode='22023';
  end if;

  select * into v_return from public.sales_order_returns r
  where r.id=p_return_id and r.organization_id=p_organization_id;
  if not found then raise exception 'Devolução não encontrada.' using errcode='P0002'; end if;
  select * into v_order from public.sales_orders o
  where o.id=v_return.order_id and o.organization_id=p_organization_id for update;
  select * into v_return from public.sales_order_returns r
  where r.id=p_return_id and r.organization_id=p_organization_id for update;
  if v_return.status<>'awaiting_finance' or v_return.request_type<>'refund'
      or v_return.refund_payable_id is not null or v_return.finance_reconciled_at is not null
      or v_return.received_at is null then
    raise exception 'Esta devolução não está aguardando conciliação de reembolso.'
      using errcode='22023';
  end if;
  if v_order.status<>'confirmed' or v_order.financial_entry_id is null then
    raise exception 'Pedido original não permite conciliação.' using errcode='22023';
  end if;
  select * into v_entry from public.financial_entries e
  where e.organization_id=p_organization_id and e.id=v_order.financial_entry_id
    and e.origin_type='sales_order' and e.origin_reference=v_order.id::text
  for update;
  if not found or v_entry.entry_type<>'receivable' or v_entry.approval_status<>'approved' then
    raise exception 'Cobrança original não está aprovada ou não pertence ao pedido.'
      using errcode='22023';
  end if;

  -- Lock das parcelas antes de mensurar saldos. Recebimentos concorrentes usam
  -- o mesmo lock no lançamento financeiro, então não há crédito duplicado.
  perform 1 from public.financial_installments i
    where i.organization_id=p_organization_id and i.financial_entry_id=v_entry.id
    order by i.installment_number,i.id for update;
  select coalesce(sum(i.settled_amount),0) into v_paid
    from public.financial_installments i
    where i.organization_id=p_organization_id and i.financial_entry_id=v_entry.id;
  if v_paid<0 or v_paid>v_entry.original_amount then
    raise exception 'Cobrança inconsistente; revise as baixas no Financeiro.'
      using errcode='22023';
  end if;
  v_credit:=v_return.gross_credit_amount;
  v_due:=round(v_entry.original_amount-v_paid,2);
  v_reduction:=least(v_credit,v_due);
  v_refund_due:=round(v_credit-v_reduction,2);
  v_new_original:=round(v_entry.original_amount-v_reduction,2);

  if v_reduction>0 and v_new_original=0 and v_paid=0 then
    -- 100% da cobrança sem pagamentos foi creditada: manter o lançamento
    -- histórico como cancelado; jamais gerar uma parcela de R$ 0,00.
    update public.financial_entries set approval_status='cancelled',
      cancelled_at=now(),updated_by=v_actor,
      source_details=coalesce(source_details,'{}'::jsonb)||
       jsonb_build_object('sales_return_cancel_id',p_return_id,
        'sales_return_credit',v_reduction)
    where id=v_entry.id and organization_id=p_organization_id;
    insert into public.financial_events(
      organization_id,financial_entry_id,event_type,event_data,created_by
    ) values(p_organization_id,v_entry.id,'sales_return_receivable_cancelled',
      jsonb_build_object('return_id',p_return_id,'credit',v_reduction,'reason',v_reason),
      v_actor);
  elsif v_reduction>0 then
    -- Só as parcelas ainda em aberto podem ser reduzidas. Parcelas quitadas
    -- preservam as baixas, taxas e lançamentos já gerados.
    v_reduction_left:=v_reduction;
    for v_inst in select * from public.financial_installments i
      where i.organization_id=p_organization_id and i.financial_entry_id=v_entry.id
        and i.original_amount>i.settled_amount
      order by i.installment_number desc,i.id desc
      for update
    loop
      exit when v_reduction_left<=0;
      v_cut:=least(v_reduction_left,
        round(v_inst.original_amount-v_inst.settled_amount,2));
      if v_cut<=0 then continue; end if;
      if v_cut>=v_inst.original_amount and v_inst.settled_amount=0 then
        -- Só remover parcelas sem qualquer registro financeiro, cobrança ou
        -- referência, para não apagar o histórico de baixas e cobranças.
        if exists(select 1 from public.financial_settlements s
             where s.organization_id=p_organization_id
               and s.financial_installment_id=v_inst.id)
          or exists(select 1 from public.financial_settlement_allocations a
             where a.organization_id=p_organization_id
               and a.financial_installment_id=v_inst.id) then
          raise exception 'A parcela tem histórico financeiro. Concilie manualmente no Financeiro.'
            using errcode='22023';
        end if;
        delete from public.financial_installments
        where id=v_inst.id and organization_id=p_organization_id;
      else
        update public.financial_installments
          set original_amount=round(original_amount-v_cut,2)
        where id=v_inst.id and organization_id=p_organization_id;
      end if;
      v_reduction_left:=round(v_reduction_left-v_cut,2);
    end loop;
    if v_reduction_left>0 then
      raise exception 'Não foi possível distribuir o crédito entre as parcelas.'
        using errcode='22023';
    end if;
    select count(*) into v_alloc_count from public.financial_allocations a
    where a.organization_id=p_organization_id and a.financial_entry_id=v_entry.id;
    if v_alloc_count<>1 then
      raise exception 'Cobrança possui rateio complexo; concilie manualmente no Financeiro.'
        using errcode='22023';
    end if;
    update public.financial_allocations set amount=v_new_original,percentage=100
      where organization_id=p_organization_id and financial_entry_id=v_entry.id;
    update public.financial_entries
      set original_amount=v_new_original,updated_by=v_actor,
        source_details=coalesce(source_details,'{}'::jsonb)||
         jsonb_build_object('sales_original_amount',
           coalesce(nullif(source_details->>'sales_original_amount','')::numeric,
           v_order.total_amount),'last_sales_return_credit_id',p_return_id,
           'last_receivable_credit',v_reduction)
      where id=v_entry.id and organization_id=p_organization_id;
    insert into public.financial_events(
      organization_id,financial_entry_id,event_type,event_data,created_by
    ) values(p_organization_id,v_entry.id,'sales_return_credit_adjusted',
      jsonb_build_object('return_id',p_return_id,'old_amount',v_entry.original_amount,
        'new_amount',v_new_original,'credit',v_reduction,'reason',v_reason),v_actor);
  end if;

  if v_refund_due>0 then
    select * into v_finance_settings from public.financial_settings
      where organization_id=p_organization_id;
    if not found or v_finance_settings.default_payable_category_id is null then
      raise exception 'Configure a categoria padrão de Contas a Pagar antes de conciliar.'
        using errcode='22023';
    end if;
    select * into v_category from public.financial_categories c
    where c.organization_id=p_organization_id
      and c.id=v_finance_settings.default_payable_category_id and c.is_active;
    if not found then raise exception 'Categoria de reembolso indisponível.' using errcode='22023'; end if;
    insert into public.financial_entries(
      organization_id,entry_type,description,issue_date,competence_date,
      original_amount,approval_status,required_approvals,approval_cycle,approved_at,
      counterpart_name_snapshot,counterpart_document_snapshot,
      origin_type,origin_reference,source_details,notes,created_by,updated_by
    ) values(
      p_organization_id,'payable',
      'Reembolso da devolução #'||v_return.return_number||
        ' · pedido comercial #'||v_order.order_number,
      current_date,current_date,v_refund_due,'approved',1,1,now(),
      v_order.customer_name_snapshot,v_order.customer_document_snapshot,
      'other',p_return_id::text,
      jsonb_build_object('sales_return_id',p_return_id,'sales_order_id',v_order.id,
        'refund_liability',true,'receivable_credit',v_reduction),
      v_reason,v_actor,v_actor
    ) returning id into v_refund_id;
    insert into public.financial_installments(
      organization_id,financial_entry_id,installment_number,total_installments,
      due_date,original_amount,settled_amount
    ) values(p_organization_id,v_refund_id,1,1,current_date,v_refund_due,0);
    insert into public.financial_allocations(
      organization_id,financial_entry_id,category_id,category_name_snapshot,
      category_nature_snapshot,cost_center_id,allocation_mode,percentage,amount
    ) values(p_organization_id,v_refund_id,v_category.id,v_category.name,
      'expense',v_finance_settings.default_cost_center_id,'amount',100,v_refund_due);
    insert into public.financial_events(
      organization_id,financial_entry_id,event_type,event_data,created_by
    ) values(p_organization_id,v_refund_id,'created',
      jsonb_build_object('sales_return_id',p_return_id,'cash_refund_pending',true),v_actor);
  end if;

  update public.sales_order_returns set
    status='received',receivable_credit_amount=v_reduction,
    cash_refund_amount=v_refund_due,refund_payable_id=v_refund_id,
    finance_reconciled_at=now(),finance_reconciled_by=v_actor,updated_at=now(),
    resolution_notes=concat_ws(' | ',nullif(resolution_notes,''),v_reason)
  where id=p_return_id and organization_id=p_organization_id;

  insert into public.sales_order_events(
    organization_id,order_id,event_type,event_data,created_by
  ) values(p_organization_id,v_order.id,'return_reconciled',
    jsonb_build_object('return_id',p_return_id,'receivable_credit',v_reduction,
      'refund_payable_id',v_refund_id,'refund_due',v_refund_due,'reason',v_reason),
    v_actor);
  return jsonb_build_object('status','received','receivable_credit',v_reduction,
    'refund_payable_id',v_refund_id,'refund_due',v_refund_due);
end;$function$;

alter table public.sales_order_events drop constraint if exists sales_order_events_type_check;
alter table public.sales_order_events add constraint sales_order_events_type_check
 check(event_type in ('created','fulfillment_changed','cancelled','delivery_configured',
 'delivery_completed','return_requested','return_approved','return_rejected',
 'return_received','return_reconciled'));

revoke all on function public.reconcile_sales_return_credit_v1(uuid,uuid,text) from public,anon;
grant execute on function public.reconcile_sales_return_credit_v1(uuid,uuid,text) to authenticated;
commit;