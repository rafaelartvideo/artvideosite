-- Quitação integral com um único movimento de caixa e rateio por parcelas.
-- A tabela de rateios é interna e acessada apenas por funções com autorização explícita.
create table if not exists public.financial_settlement_allocations (
  organization_id uuid not null,
  financial_settlement_id uuid not null,
  financial_installment_id uuid not null,
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  created_at timestamptz not null default now(),
  primary key (financial_settlement_id, financial_installment_id),
  foreign key (organization_id, financial_settlement_id)
    references public.financial_settlements(organization_id,id) on delete restrict,
  foreign key (organization_id, financial_installment_id)
    references public.financial_installments(organization_id,id) on delete restrict
);
create index if not exists financial_settlement_allocations_org_installment_idx
  on public.financial_settlement_allocations(organization_id, financial_installment_id);
alter table public.financial_settlement_allocations enable row level security;
revoke all on table public.financial_settlement_allocations from public, anon, authenticated;

create or replace function public.register_financial_bulk_settlement(
  p_organization_id uuid,
  p_entry_id uuid,
  p_principal_amount numeric,
  p_interest_amount numeric default 0,
  p_penalty_amount numeric default 0,
  p_other_additions numeric default 0,
  p_discount_amount numeric default 0,
  p_payment_method_id uuid default null,
  p_financial_account_id uuid default null,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_entry public.financial_entries%rowtype;
  v_i public.financial_installments%rowtype;
  v_method public.financial_payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_principal numeric(14,2) := round(coalesce(p_principal_amount,0),2);
  v_interest numeric(14,2) := round(coalesce(p_interest_amount,0),2);
  v_penalty numeric(14,2) := round(coalesce(p_penalty_amount,0),2);
  v_additions numeric(14,2) := round(coalesce(p_other_additions,0),2);
  v_discount numeric(14,2) := round(coalesce(p_discount_amount,0),2);
  v_gross numeric(14,2);
  v_fee numeric(14,2) := 0;
  v_net numeric(14,2);
  v_total_open numeric(14,2) := 0;
  v_to_allocate numeric(14,2);
  v_part numeric(14,2);
  v_first_installment uuid;
  v_settlement_id uuid;
  v_allocations jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.settlements.create') then
    raise exception 'Sem permissão para registrar baixas financeiras.' using errcode='42501';
  end if;
  select * into v_entry from public.financial_entries
  where organization_id=p_organization_id and id=p_entry_id for update;
  if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
  if v_entry.entry_type <> 'receivable' or v_entry.approval_status <> 'approved' then
    raise exception 'Quitação integral disponível somente para contas a receber aprovadas.' using errcode='22023';
  end if;
  if v_principal<=0 then raise exception 'O valor principal deve ser maior que zero.' using errcode='22023'; end if;
  if v_interest<0 or v_penalty<0 or v_additions<0 or v_discount<0 then
    raise exception 'Ajustes da baixa não podem ser negativos.' using errcode='22023';
  end if;

  -- O bloqueio das parcelas impede concorrência na quitação.
  for v_i in
    select * from public.financial_installments
    where organization_id=p_organization_id and financial_entry_id=p_entry_id
    order by due_date,installment_number,id
    for update
  loop
    if v_i.original_amount > v_i.settled_amount then
      v_total_open := v_total_open + round(v_i.original_amount-v_i.settled_amount,2);
      if v_first_installment is null then v_first_installment := v_i.id; end if;
    end if;
  end loop;
  if v_first_installment is null or v_principal > v_total_open then
    raise exception 'O valor excede o saldo total em aberto.' using errcode='22023';
  end if;
  v_gross := round(v_principal+v_interest+v_penalty+v_additions-v_discount,2);
  if v_gross<=0 then raise exception 'A baixa deve resultar em valor maior que zero.' using errcode='22023'; end if;

  select * into v_method from public.financial_payment_methods
  where organization_id=p_organization_id and id=p_payment_method_id and is_active=true;
  if not found then raise exception 'Forma de pagamento inválida.' using errcode='23503'; end if;
  select * into v_account from public.financial_accounts
  where organization_id=p_organization_id and id=p_financial_account_id and is_active=true;
  if not found then raise exception 'Conta financeira inválida.' using errcode='23503'; end if;
  v_fee := round(v_gross*v_method.percentage_fee/100+v_method.fixed_fee,2);
  if v_fee>v_gross then raise exception 'A taxa excede o valor recebido.' using errcode='22023'; end if;
  v_net := round(v_gross-v_fee,2);

  -- Um único cabeçalho de baixa = um único recebimento bancário.
  insert into public.financial_settlements(
    organization_id,financial_entry_id,financial_installment_id,entry_type,
    payment_method_id,payment_method_name_snapshot,financial_account_id,financial_account_name_snapshot,
    principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,
    percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,occurred_at,expected_settlement_at,
    settlement_status,posted_at,created_by
  ) values(
    p_organization_id,p_entry_id,v_first_installment,'receivable',
    v_method.id,v_method.name,v_account.id,v_account.name,
    v_principal,v_interest,v_penalty,v_additions,v_discount,v_gross,
    v_method.percentage_fee,v_method.fixed_fee,v_fee,v_net,p_occurred_at,p_occurred_at,
    'posted',p_occurred_at,v_user_id
  ) returning id into v_settlement_id;

  v_to_allocate := v_principal;
  for v_i in
    select * from public.financial_installments
    where organization_id=p_organization_id and financial_entry_id=p_entry_id
      and original_amount > settled_amount
    order by due_date,installment_number,id
    for update
  loop
    exit when v_to_allocate <= 0;
    v_part := least(v_to_allocate,round(v_i.original_amount-v_i.settled_amount,2));
    insert into public.financial_settlement_allocations(
      organization_id,financial_settlement_id,financial_installment_id,principal_amount
    ) values (p_organization_id,v_settlement_id,v_i.id,v_part);
    update public.financial_installments
    set settled_amount=round(settled_amount+v_part,2),
        settled_at=case when round(settled_amount+v_part,2)>=original_amount then p_occurred_at else null end
    where id=v_i.id and organization_id=p_organization_id;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object('installment_id',v_i.id,'principal',v_part));
    v_to_allocate := round(v_to_allocate-v_part,2);
  end loop;
  if v_to_allocate<>0 then raise exception 'Falha no rateio das parcelas.' using errcode='22023'; end if;
  perform private.finance_post_settlement_movements(v_settlement_id,p_occurred_at,v_user_id);
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,p_entry_id,'settlement_registered',jsonb_build_object(
    'settlement_id',v_settlement_id,'batch',true,'allocations',v_allocations,
    'principal_amount',v_principal,'gross_amount',v_gross,'fee_amount',v_fee,'net_amount',v_net,'status','posted'
  ),v_user_id);
  return jsonb_build_object('id',v_settlement_id,'status','posted','remaining',round(v_total_open-v_principal,2),
    'gross',v_gross,'fee',v_fee,'net',v_net,'expected_settlement_at',p_occurred_at);
end;
$function$;
revoke all on function public.register_financial_bulk_settlement(uuid,uuid,numeric,numeric,numeric,numeric,numeric,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.register_financial_bulk_settlement(uuid,uuid,numeric,numeric,numeric,numeric,numeric,uuid,uuid,timestamptz) to authenticated;

-- O estorno tradicional mantém comportamento original; só usa o rateio quando ele existe.
CREATE OR REPLACE FUNCTION public.reverse_financial_settlement(p_organization_id uuid, p_settlement_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_s public.financial_settlements%rowtype;
  v_i public.financial_installments%rowtype;
  v_m public.financial_movements%rowtype;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.settlements.reverse') then raise exception 'Sem permissão para estornar baixas financeiras.' using errcode='42501'; end if;
  if v_reason is null then raise exception 'Informe o motivo do estorno.' using errcode='22023'; end if;
  select * into v_s from public.financial_settlements s where s.organization_id=p_organization_id and s.id=p_settlement_id for update;
  if not found then raise exception 'Baixa financeira não encontrada.' using errcode='P0002'; end if;
  if v_s.settlement_status='reversed' then raise exception 'Esta baixa já foi estornada.' using errcode='22023'; end if;
  select * into v_i from public.financial_installments i where i.organization_id=p_organization_id and i.id=v_s.financial_installment_id for update;
  if not found then raise exception 'Parcela vinculada à baixa não foi encontrada.' using errcode='P0002'; end if;

  if v_s.settlement_status='posted' then
    for v_m in select * from public.financial_movements m
      where m.organization_id=p_organization_id and m.source_type='settlement' and m.source_id=v_s.id
      order by m.created_at
    loop
      insert into public.financial_movements(
        organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,reversal_of_movement_id,description_snapshot,created_by
      ) values (
        p_organization_id,v_m.financial_account_id,case when v_m.direction='credit' then 'debit' else 'credit' end,
        'reversal',v_m.amount,now(),'settlement_reversal',v_s.id,v_m.id,'Estorno — '||v_m.description_snapshot,v_user_id
      );
    end loop;
  end if;

  if exists (
    select 1 from public.financial_settlement_allocations a
    where a.organization_id=p_organization_id and a.financial_settlement_id=v_s.id
  ) then
    -- A quitação em lote gerou UM movimento bancário e N alocações: estorne cada parcela.
    update public.financial_installments i
    set settled_amount=greatest(0,round(i.settled_amount-a.principal_amount,2)),
        settled_at=null
    from public.financial_settlement_allocations a
    where a.organization_id=p_organization_id
      and a.financial_settlement_id=v_s.id
      and a.financial_installment_id=i.id
      and i.organization_id=p_organization_id;
  else
    update public.financial_installments
    set settled_amount=greatest(0,round(settled_amount-v_s.principal_amount,2)),settled_at=null
    where id=v_i.id and organization_id=p_organization_id;
  end if;
  update public.financial_settlements
  set settlement_status='reversed',reversed_at=now(),reversed_by=v_user_id,reversal_reason=v_reason
  where id=v_s.id and organization_id=p_organization_id;
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_s.financial_entry_id,'settlement_reversed',jsonb_build_object('settlement_id',v_s.id,'reason',v_reason),v_user_id);
  return jsonb_build_object('id',v_s.id,'status','reversed');
end;
$function$;

-- Revisão pontual de uma parcela PREVISTA sem alterar contas já quitadas.
create or replace function public.adjust_financial_installment_forecast(
  p_organization_id uuid, p_installment_id uuid, p_new_amount numeric, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := auth.uid();
  v_i public.financial_installments%rowtype;
  v_e public.financial_entries%rowtype;
  v_old numeric(14,2);
  v_new numeric(14,2) := round(coalesce(p_new_amount,0),2);
  v_new_total numeric(14,2);
  v_diff numeric(14,2);
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_alloc public.financial_allocations%rowtype;
  v_alloc_total numeric(14,2) := 0;
  v_alloc_count int := 0;
  v_alloc_index int := 0;
  v_running numeric(14,2) := 0;
  v_part numeric(14,2);
begin
  if v_user is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.payables.edit') then
    raise exception 'Sem permissão para ajustar previsões.' using errcode='42501';
  end if;
  if v_reason is null then raise exception 'Informe o motivo do ajuste.' using errcode='22023'; end if;
  select * into v_i from public.financial_installments
  where organization_id=p_organization_id and id=p_installment_id;
  if not found then raise exception 'Parcela não encontrada.' using errcode='P0002'; end if;
  select * into v_e from public.financial_entries
  where organization_id=p_organization_id and id=v_i.financial_entry_id for update;
  if not found then raise exception 'Lançamento não encontrado.' using errcode='P0002'; end if;
  select * into v_i from public.financial_installments
  where organization_id=p_organization_id and id=p_installment_id for update;
  if v_e.entry_type<>'payable' or v_e.origin_type not in ('manual','recurring')
     or v_e.approval_status not in ('approved','pending') then
    raise exception 'Só é permitido ajustar contas a pagar manuais ou recorrentes em aberto.' using errcode='22023';
  end if;
  if v_i.settled_amount >= v_i.original_amount then
    raise exception 'Não é permitido modificar uma parcela já quitada.' using errcode='22023';
  end if;
  if v_new<=0 or v_new < v_i.settled_amount then
    raise exception 'O novo valor deve ser positivo e não pode ser menor que o valor pago.' using errcode='22023';
  end if;
  v_old := v_i.original_amount;
  v_diff := round(v_new-v_old,2);
  if v_diff=0 then
    return jsonb_build_object('entry_id',v_e.id,'installment_id',v_i.id,'old_amount',v_old,'new_amount',v_new,'unchanged',true);
  end if;
  v_new_total := round(v_e.original_amount+v_diff,2);
  if v_new_total<=0 then raise exception 'O lançamento precisa manter valor total positivo.' using errcode='22023'; end if;
  update public.financial_installments set original_amount=v_new
  where organization_id=p_organization_id and id=v_i.id;
  update public.financial_entries set original_amount=v_new_total,updated_at=now(),updated_by=v_user
  where organization_id=p_organization_id and id=v_e.id;

  -- Distribuição das categorias proporcional ao valor revisado, sem perder o rateio existente.
  select count(*),coalesce(sum(amount),0) into v_alloc_count,v_alloc_total
  from public.financial_allocations where organization_id=p_organization_id and financial_entry_id=v_e.id;
  if v_alloc_count>0 and v_alloc_total>0 then
    for v_alloc in
      select * from public.financial_allocations
      where organization_id=p_organization_id and financial_entry_id=v_e.id
      order by id for update
    loop
      v_alloc_index := v_alloc_index+1;
      v_part := case when v_alloc_index=v_alloc_count then v_new_total-v_running
        else round(v_new_total*v_alloc.amount/v_alloc_total,2) end;
      if v_part<=0 then raise exception 'Novo valor incompatível com rateio financeiro.' using errcode='22023'; end if;
      update public.financial_allocations set amount=v_part where id=v_alloc.id and organization_id=p_organization_id;
      v_running := v_running+v_part;
    end loop;
  end if;
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_e.id,'installment_amount_adjusted',jsonb_build_object(
    'installment_id',v_i.id,'installment_number',v_i.installment_number,
    'old_amount',v_old,'new_amount',v_new,'difference',v_diff,'reason',v_reason
  ),v_user);
  return jsonb_build_object('entry_id',v_e.id,'installment_id',v_i.id,'old_amount',v_old,'new_amount',v_new,'new_total',v_new_total);
end;
$function$;
revoke all on function public.adjust_financial_installment_forecast(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.adjust_financial_installment_forecast(uuid,uuid,numeric,text) to authenticated;
