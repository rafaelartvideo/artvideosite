begin;

alter table public.financial_accounts
  add column if not exists opening_balance_configured_at timestamptz,
  add column if not exists opening_balance_configured_by uuid references public.profiles(id) on delete set null;

create table public.financial_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  financial_installment_id uuid not null,
  entry_type text not null check (entry_type in ('receivable','payable')),
  payment_method_id uuid not null,
  payment_method_name_snapshot text not null check (btrim(payment_method_name_snapshot) <> ''),
  financial_account_id uuid not null,
  financial_account_name_snapshot text not null check (btrim(financial_account_name_snapshot) <> ''),
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  penalty_amount numeric(14,2) not null default 0 check (penalty_amount >= 0),
  other_additions numeric(14,2) not null default 0 check (other_additions >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  percentage_fee_snapshot numeric(7,4) not null default 0 check (percentage_fee_snapshot between 0 and 100),
  fixed_fee_snapshot numeric(14,2) not null default 0 check (fixed_fee_snapshot >= 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  occurred_at timestamptz not null,
  expected_settlement_at timestamptz not null,
  settlement_status text not null check (settlement_status in ('scheduled','posted','reversed')),
  posted_at timestamptz,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,financial_entry_id)
    references public.financial_entries(organization_id,id) on delete restrict,
  foreign key (organization_id,financial_installment_id)
    references public.financial_installments(organization_id,id) on delete restrict,
  foreign key (organization_id,payment_method_id)
    references public.financial_payment_methods(organization_id,id) on delete restrict,
  foreign key (organization_id,financial_account_id)
    references public.financial_accounts(organization_id,id) on delete restrict
);

create index financial_settlements_entry_created_idx
  on public.financial_settlements(organization_id,financial_entry_id,created_at desc);
create index financial_settlements_installment_status_idx
  on public.financial_settlements(organization_id,financial_installment_id,settlement_status);
create index financial_settlements_expected_idx
  on public.financial_settlements(organization_id,settlement_status,expected_settlement_at);

create table public.financial_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_at timestamptz not null,
  note text,
  transfer_status text not null default 'posted' check (transfer_status in ('posted','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,from_account_id)
    references public.financial_accounts(organization_id,id) on delete restrict,
  foreign key (organization_id,to_account_id)
    references public.financial_accounts(organization_id,id) on delete restrict,
  check (from_account_id <> to_account_id)
);

create index financial_transfers_org_created_idx
  on public.financial_transfers(organization_id,created_at desc);

create table public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_account_id uuid not null,
  direction text not null check (direction in ('credit','debit')),
  movement_type text not null check (movement_type in ('opening_balance','receipt','payment','fee','transfer_in','transfer_out','reversal')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_at timestamptz not null,
  source_type text not null check (source_type in ('opening_balance','settlement','transfer','settlement_reversal','transfer_reversal')),
  source_id uuid not null,
  reversal_of_movement_id uuid references public.financial_movements(id) on delete restrict,
  description_snapshot text not null check (btrim(description_snapshot) <> ''),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,financial_account_id)
    references public.financial_accounts(organization_id,id) on delete restrict
);

create index financial_movements_account_date_idx
  on public.financial_movements(organization_id,financial_account_id,occurred_at desc,created_at desc);
create index financial_movements_source_idx
  on public.financial_movements(organization_id,source_type,source_id);
create unique index financial_movements_reversal_once_uidx
  on public.financial_movements(reversal_of_movement_id)
  where reversal_of_movement_id is not null;
create unique index financial_movements_opening_balance_uidx
  on public.financial_movements(organization_id,financial_account_id)
  where movement_type='opening_balance';

alter table public.financial_settlements enable row level security;
alter table public.financial_transfers enable row level security;
alter table public.financial_movements enable row level security;

revoke all on table public.financial_settlements from anon, authenticated;
revoke all on table public.financial_transfers from anon, authenticated;
revoke all on table public.financial_movements from anon, authenticated;
grant select on table public.financial_settlements to authenticated;
grant select on table public.financial_transfers to authenticated;
grant select on table public.financial_movements to authenticated;

create policy financial_settlements_select on public.financial_settlements
for select to authenticated
using (private.can_view_financial_entry(organization_id,financial_entry_id));

create policy financial_transfers_select on public.financial_transfers
for select to authenticated
using (
  private.can_access_finance(organization_id,'finance.accounts.view')
  or private.can_access_finance(organization_id,'finance.accounts.manage')
  or private.can_access_finance(organization_id,'finance.transfers.create')
);

create policy financial_movements_select on public.financial_movements
for select to authenticated
using (
  private.can_access_finance(organization_id,'finance.accounts.view')
  or private.can_access_finance(organization_id,'finance.accounts.manage')
  or private.can_access_finance(organization_id,'finance.reports.cash_flow')
);

create or replace function private.finance_post_settlement_movements(
  p_settlement_id uuid,
  p_posted_at timestamptz,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_s public.financial_settlements%rowtype;
begin
  select * into v_s from public.financial_settlements where id=p_settlement_id for update;
  if not found then raise exception 'Baixa financeira não encontrada.' using errcode='P0002'; end if;
  if exists(select 1 from public.financial_movements m where m.organization_id=v_s.organization_id and m.source_type='settlement' and m.source_id=v_s.id) then
    raise exception 'Os movimentos desta baixa já foram registrados.' using errcode='23505';
  end if;

  if v_s.entry_type='receivable' then
    insert into public.financial_movements(
      organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,description_snapshot,created_by
    ) values (
      v_s.organization_id,v_s.financial_account_id,'credit','receipt',v_s.gross_amount,p_posted_at,'settlement',v_s.id,
      'Recebimento — '||v_s.payment_method_name_snapshot,p_user_id
    );
    if v_s.fee_amount>0 then
      insert into public.financial_movements(
        organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,description_snapshot,created_by
      ) values (
        v_s.organization_id,v_s.financial_account_id,'debit','fee',v_s.fee_amount,p_posted_at,'settlement',v_s.id,
        'Taxa financeira — '||v_s.payment_method_name_snapshot,p_user_id
      );
    end if;
  else
    insert into public.financial_movements(
      organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,description_snapshot,created_by
    ) values (
      v_s.organization_id,v_s.financial_account_id,'debit','payment',v_s.gross_amount,p_posted_at,'settlement',v_s.id,
      'Pagamento — '||v_s.payment_method_name_snapshot,p_user_id
    );
  end if;
end;
$$;
revoke all on function private.finance_post_settlement_movements(uuid,timestamptz,uuid) from public;

create or replace function public.register_financial_settlement(
  p_organization_id uuid,
  p_entry_id uuid,
  p_installment_id uuid,
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
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.financial_entries%rowtype;
  v_installment public.financial_installments%rowtype;
  v_method public.financial_payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_principal numeric(14,2) := round(coalesce(p_principal_amount,0),2);
  v_interest numeric(14,2) := round(coalesce(p_interest_amount,0),2);
  v_penalty numeric(14,2) := round(coalesce(p_penalty_amount,0),2);
  v_additions numeric(14,2) := round(coalesce(p_other_additions,0),2);
  v_discount numeric(14,2) := round(coalesce(p_discount_amount,0),2);
  v_remaining numeric(14,2);
  v_gross numeric(14,2);
  v_fee numeric(14,2) := 0;
  v_net numeric(14,2);
  v_expected timestamptz;
  v_status text;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.settlements.create') then raise exception 'Sem permissão para registrar baixas financeiras.' using errcode='42501'; end if;

  select * into v_entry from public.financial_entries e where e.organization_id=p_organization_id and e.id=p_entry_id for update;
  if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
  if v_entry.approval_status<>'approved' then raise exception 'Somente lançamentos aprovados podem receber baixas.' using errcode='22023'; end if;

  select * into v_installment from public.financial_installments i where i.organization_id=p_organization_id and i.id=p_installment_id and i.financial_entry_id=p_entry_id for update;
  if not found then raise exception 'Parcela financeira não encontrada neste lançamento.' using errcode='P0002'; end if;

  if v_principal<=0 then raise exception 'Informe um valor principal maior que zero.' using errcode='22023'; end if;
  if v_interest<0 or v_penalty<0 or v_additions<0 or v_discount<0 then raise exception 'Ajustes da baixa não podem ser negativos.' using errcode='22023'; end if;
  v_remaining := round(v_installment.original_amount-v_installment.settled_amount,2);
  if v_principal>v_remaining then raise exception 'O valor principal excede o saldo em aberto da parcela.' using errcode='22023'; end if;
  v_gross := round(v_principal+v_interest+v_penalty+v_additions-v_discount,2);
  if v_gross<=0 then raise exception 'O valor final da baixa deve ser maior que zero.' using errcode='22023'; end if;

  select * into v_method from public.financial_payment_methods m where m.organization_id=p_organization_id and m.id=p_payment_method_id and m.is_active=true;
  if not found then raise exception 'Forma de pagamento inválida ou inativa.' using errcode='23503'; end if;
  select * into v_account from public.financial_accounts a where a.organization_id=p_organization_id and a.id=p_financial_account_id and a.is_active=true;
  if not found then raise exception 'Conta financeira inválida ou inativa.' using errcode='23503'; end if;

  if v_entry.entry_type='receivable' then
    v_fee := round(v_gross*v_method.percentage_fee/100+v_method.fixed_fee,2);
    if v_fee>v_gross then raise exception 'A taxa da forma de pagamento excede o valor da baixa.' using errcode='22023'; end if;
  end if;
  v_net := round(v_gross-v_fee,2);
  v_expected := p_occurred_at + make_interval(days => greatest(0,v_method.settlement_days));
  v_status := case when v_entry.entry_type='receivable' and v_method.creates_future_settlement then 'scheduled' else 'posted' end;

  insert into public.financial_settlements(
    organization_id,financial_entry_id,financial_installment_id,entry_type,
    payment_method_id,payment_method_name_snapshot,financial_account_id,financial_account_name_snapshot,
    principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,
    percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,occurred_at,expected_settlement_at,
    settlement_status,posted_at,created_by
  ) values (
    p_organization_id,p_entry_id,p_installment_id,v_entry.entry_type,
    v_method.id,v_method.name,v_account.id,v_account.name,
    v_principal,v_interest,v_penalty,v_additions,v_discount,v_gross,
    case when v_entry.entry_type='receivable' then v_method.percentage_fee else 0 end,
    case when v_entry.entry_type='receivable' then v_method.fixed_fee else 0 end,
    v_fee,v_net,p_occurred_at,v_expected,
    v_status,case when v_status='posted' then p_occurred_at else null end,v_user_id
  ) returning id into v_id;

  update public.financial_installments
  set settled_amount=round(settled_amount+v_principal,2),
      settled_at=case when round(settled_amount+v_principal,2)>=original_amount then p_occurred_at else null end
  where id=p_installment_id and organization_id=p_organization_id;

  if v_status='posted' then perform private.finance_post_settlement_movements(v_id,p_occurred_at,v_user_id); end if;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,p_entry_id,'settlement_registered',jsonb_build_object(
    'settlement_id',v_id,'installment_id',p_installment_id,'principal_amount',v_principal,
    'gross_amount',v_gross,'fee_amount',v_fee,'net_amount',v_net,'status',v_status
  ),v_user_id);

  return jsonb_build_object('id',v_id,'status',v_status,'remaining',round(v_remaining-v_principal,2),'gross',v_gross,'fee',v_fee,'net',v_net,'expected_settlement_at',v_expected);
end;
$$;

create or replace function public.confirm_financial_settlement(p_organization_id uuid,p_settlement_id uuid,p_posted_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user_id uuid := auth.uid(); v_s public.financial_settlements%rowtype;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.settlements.create') then raise exception 'Sem permissão para confirmar liquidações.' using errcode='42501'; end if;
  select * into v_s from public.financial_settlements s where s.organization_id=p_organization_id and s.id=p_settlement_id for update;
  if not found then raise exception 'Baixa financeira não encontrada.' using errcode='P0002'; end if;
  if v_s.settlement_status<>'scheduled' then raise exception 'Somente liquidações agendadas podem ser confirmadas.' using errcode='22023'; end if;
  perform private.finance_post_settlement_movements(v_s.id,p_posted_at,v_user_id);
  update public.financial_settlements set settlement_status='posted',posted_at=p_posted_at where id=v_s.id and organization_id=p_organization_id;
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_s.financial_entry_id,'settlement_posted',jsonb_build_object('settlement_id',v_s.id,'posted_at',p_posted_at),v_user_id);
  return jsonb_build_object('id',v_s.id,'status','posted','posted_at',p_posted_at);
end;
$$;

create or replace function public.reverse_financial_settlement(p_organization_id uuid,p_settlement_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user_id uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_s public.financial_settlements%rowtype; v_i public.financial_installments%rowtype; v_m public.financial_movements%rowtype;
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
    for v_m in select * from public.financial_movements m where m.organization_id=p_organization_id and m.source_type='settlement' and m.source_id=v_s.id order by m.created_at loop
      insert into public.financial_movements(organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,reversal_of_movement_id,description_snapshot,created_by)
      values(p_organization_id,v_m.financial_account_id,case when v_m.direction='credit' then 'debit' else 'credit' end,'reversal',v_m.amount,now(),'settlement_reversal',v_s.id,v_m.id,'Estorno — '||v_m.description_snapshot,v_user_id);
    end loop;
  end if;
  update public.financial_installments set settled_amount=greatest(0,round(settled_amount-v_s.principal_amount,2)),settled_at=null where id=v_i.id and organization_id=p_organization_id;
  update public.financial_settlements set settlement_status='reversed',reversed_at=now(),reversed_by=v_user_id,reversal_reason=v_reason where id=v_s.id and organization_id=p_organization_id;
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_s.financial_entry_id,'settlement_reversed',jsonb_build_object('settlement_id',v_s.id,'reason',v_reason),v_user_id);
  return jsonb_build_object('id',v_s.id,'status','reversed');
end;
$$;

create or replace function public.transfer_financial_funds(p_organization_id uuid,p_from_account_id uuid,p_to_account_id uuid,p_amount numeric,p_occurred_at timestamptz default now(),p_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_user_id uuid := auth.uid(); v_amount numeric(14,2) := round(coalesce(p_amount,0),2);
  v_from public.financial_accounts%rowtype; v_to public.financial_accounts%rowtype; v_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.transfers.create') then raise exception 'Sem permissão para realizar transferências.' using errcode='42501'; end if;
  if p_from_account_id=p_to_account_id then raise exception 'As contas de origem e destino devem ser diferentes.' using errcode='22023'; end if;
  if v_amount<=0 then raise exception 'O valor da transferência deve ser maior que zero.' using errcode='22023'; end if;
  select * into v_from from public.financial_accounts a where a.organization_id=p_organization_id and a.id=p_from_account_id and a.is_active=true for update;
  if not found then raise exception 'Conta de origem inválida ou inativa.' using errcode='23503'; end if;
  select * into v_to from public.financial_accounts a where a.organization_id=p_organization_id and a.id=p_to_account_id and a.is_active=true for update;
  if not found then raise exception 'Conta de destino inválida ou inativa.' using errcode='23503'; end if;
  insert into public.financial_transfers(organization_id,from_account_id,to_account_id,amount,occurred_at,note,created_by)
  values(p_organization_id,v_from.id,v_to.id,v_amount,p_occurred_at,nullif(btrim(coalesce(p_note,'')),''),v_user_id) returning id into v_id;
  insert into public.financial_movements(organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,description_snapshot,created_by)
  values
    (p_organization_id,v_from.id,'debit','transfer_out',v_amount,p_occurred_at,'transfer',v_id,'Transferência para '||v_to.name,v_user_id),
    (p_organization_id,v_to.id,'credit','transfer_in',v_amount,p_occurred_at,'transfer',v_id,'Transferência de '||v_from.name,v_user_id);
  return v_id;
end;
$$;

create or replace function public.reverse_financial_transfer(p_organization_id uuid,p_transfer_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_user_id uuid := auth.uid(); v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_t public.financial_transfers%rowtype; v_m public.financial_movements%rowtype;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.transfers.create') then raise exception 'Sem permissão para estornar transferências.' using errcode='42501'; end if;
  if v_reason is null then raise exception 'Informe o motivo do estorno.' using errcode='22023'; end if;
  select * into v_t from public.financial_transfers t where t.organization_id=p_organization_id and t.id=p_transfer_id for update;
  if not found then raise exception 'Transferência financeira não encontrada.' using errcode='P0002'; end if;
  if v_t.transfer_status='reversed' then raise exception 'Esta transferência já foi estornada.' using errcode='22023'; end if;
  for v_m in select * from public.financial_movements m where m.organization_id=p_organization_id and m.source_type='transfer' and m.source_id=v_t.id order by m.created_at loop
    insert into public.financial_movements(organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,reversal_of_movement_id,description_snapshot,created_by)
    values(p_organization_id,v_m.financial_account_id,case when v_m.direction='credit' then 'debit' else 'credit' end,'reversal',v_m.amount,now(),'transfer_reversal',v_t.id,v_m.id,'Estorno — '||v_m.description_snapshot,v_user_id);
  end loop;
  update public.financial_transfers set transfer_status='reversed',reversed_at=now(),reversed_by=v_user_id,reversal_reason=v_reason where id=v_t.id and organization_id=p_organization_id;
  return v_t.id;
end;
$$;

create or replace function public.configure_financial_opening_balance(p_organization_id uuid,p_account_id uuid,p_amount numeric,p_note text default null)
returns numeric language plpgsql security definer set search_path=''
as $$
declare v_user_id uuid := auth.uid(); v_account public.financial_accounts%rowtype; v_amount numeric(14,2) := round(coalesce(p_amount,0),2);
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.accounts.manage') then raise exception 'Sem permissão para definir saldo inicial.' using errcode='42501'; end if;
  select * into v_account from public.financial_accounts a where a.organization_id=p_organization_id and a.id=p_account_id for update;
  if not found then raise exception 'Conta financeira não encontrada.' using errcode='P0002'; end if;
  if v_account.opening_balance_configured_at is not null then raise exception 'O saldo inicial desta conta já foi configurado.' using errcode='22023'; end if;
  if v_amount<>0 then
    insert into public.financial_movements(organization_id,financial_account_id,direction,movement_type,amount,occurred_at,source_type,source_id,description_snapshot,created_by)
    values(p_organization_id,v_account.id,case when v_amount>0 then 'credit' else 'debit' end,'opening_balance',abs(v_amount),now(),'opening_balance',v_account.id,coalesce(nullif(btrim(coalesce(p_note,'')),''),'Saldo inicial'),v_user_id);
  end if;
  update public.financial_accounts set opening_balance_configured_at=now(),opening_balance_configured_by=v_user_id where id=v_account.id and organization_id=p_organization_id;
  return v_amount;
end;
$$;

create or replace function public.get_financial_account_balances(p_organization_id uuid)
returns table(account_id uuid,balance numeric)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not (private.can_access_finance(p_organization_id,'finance.accounts.view') or private.can_access_finance(p_organization_id,'finance.accounts.manage')) then raise exception 'Sem permissão para visualizar saldos financeiros.' using errcode='42501'; end if;
  return query
  select a.id,coalesce(sum(case when m.direction='credit' then m.amount else -m.amount end),0)::numeric
  from public.financial_accounts a
  left join public.financial_movements m on m.organization_id=a.organization_id and m.financial_account_id=a.id
  where a.organization_id=p_organization_id
  group by a.id;
end;
$$;

revoke all on function public.register_financial_settlement(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,uuid,uuid,timestamptz) from public;
revoke all on function public.confirm_financial_settlement(uuid,uuid,timestamptz) from public;
revoke all on function public.reverse_financial_settlement(uuid,uuid,text) from public;
revoke all on function public.transfer_financial_funds(uuid,uuid,uuid,numeric,timestamptz,text) from public;
revoke all on function public.reverse_financial_transfer(uuid,uuid,text) from public;
revoke all on function public.configure_financial_opening_balance(uuid,uuid,numeric,text) from public;
revoke all on function public.get_financial_account_balances(uuid) from public;
grant execute on function public.register_financial_settlement(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,uuid,uuid,timestamptz) to authenticated;
grant execute on function public.confirm_financial_settlement(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.reverse_financial_settlement(uuid,uuid,text) to authenticated;
grant execute on function public.transfer_financial_funds(uuid,uuid,uuid,numeric,timestamptz,text) to authenticated;
grant execute on function public.reverse_financial_transfer(uuid,uuid,text) to authenticated;
grant execute on function public.configure_financial_opening_balance(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.get_financial_account_balances(uuid) to authenticated;

commit;
