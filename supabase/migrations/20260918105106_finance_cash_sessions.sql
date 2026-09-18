begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_cash_sessions', 0));

create table public.financial_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_account_id uuid not null,
  status text not null default 'open' check (status in ('open','closed')),
  opening_expected_amount numeric(14,2) not null default 0,
  opening_counted_amount numeric(14,2) not null check (opening_counted_amount >= 0),
  opening_difference numeric(14,2) not null default 0,
  opening_note text,
  opened_at timestamptz not null default now(),
  opened_by uuid references public.profiles(id) on delete set null default auth.uid(),
  closing_expected_amount numeric(14,2),
  closing_counted_amount numeric(14,2),
  closing_difference numeric(14,2),
  closing_reason text,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,financial_account_id)
    references public.financial_accounts(organization_id,id) on delete restrict
);

create unique index financial_cash_sessions_one_open_uidx
  on public.financial_cash_sessions(organization_id,financial_account_id)
  where status='open';

create index financial_cash_sessions_org_opened_idx
  on public.financial_cash_sessions(organization_id,opened_at desc);

alter table public.financial_cash_sessions enable row level security;
revoke all on table public.financial_cash_sessions from anon,authenticated;
grant select on table public.financial_cash_sessions to authenticated;

create policy financial_cash_sessions_select on public.financial_cash_sessions
for select to authenticated
using (
  private.can_access_finance(organization_id,'finance.accounts.view')
  or private.can_access_finance(organization_id,'finance.accounts.manage')
  or private.can_access_finance(organization_id,'finance.cash.open')
  or private.can_access_finance(organization_id,'finance.cash.close')
);

alter table public.financial_movements
  add column cash_session_id uuid;

alter table public.financial_movements
  add constraint financial_movements_cash_session_fkey
  foreign key (organization_id,cash_session_id)
  references public.financial_cash_sessions(organization_id,id)
  on delete restrict;

alter table public.financial_movements
  drop constraint financial_movements_movement_type_check;
alter table public.financial_movements
  add constraint financial_movements_movement_type_check
  check (movement_type in (
    'opening_balance','receipt','payment','fee','transfer_in','transfer_out',
    'reversal','supply','withdraw','cash_adjustment'
  ));

alter table public.financial_movements
  drop constraint financial_movements_source_type_check;
alter table public.financial_movements
  add constraint financial_movements_source_type_check
  check (source_type in (
    'opening_balance','settlement','transfer','settlement_reversal','transfer_reversal','cash_session'
  ));

create index financial_movements_cash_session_idx
  on public.financial_movements(organization_id,cash_session_id,occurred_at)
  where cash_session_id is not null;

create or replace function private.finance_account_balance(
  p_organization_id uuid,
  p_account_id uuid
)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(case when m.direction='credit' then m.amount else -m.amount end),0)::numeric(14,2)
  from public.financial_movements m
  where m.organization_id=p_organization_id
    and m.financial_account_id=p_account_id;
$$;
revoke all on function private.finance_account_balance(uuid,uuid) from public;

create or replace function private.current_financial_cash_session(
  p_organization_id uuid,
  p_account_id uuid,
  p_required boolean default true
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_enabled boolean := false;
  v_allows boolean := false;
  v_session_id uuid;
begin
  select coalesce(s.cash_session_enabled,false)
    into v_enabled
  from public.financial_settings s
  where s.organization_id=p_organization_id;

  if not coalesce(v_enabled,false) then
    return null;
  end if;

  select coalesce(a.allows_cash_session,false)
    into v_allows
  from public.financial_accounts a
  where a.organization_id=p_organization_id
    and a.id=p_account_id;

  if not coalesce(v_allows,false) then
    return null;
  end if;

  select s.id
    into v_session_id
  from public.financial_cash_sessions s
  where s.organization_id=p_organization_id
    and s.financial_account_id=p_account_id
    and s.status='open'
  order by s.opened_at desc
  limit 1;

  if v_session_id is null and p_required then
    raise exception 'O caixa desta conta precisa estar aberto para registrar esta movimentação.' using errcode='22023';
  end if;
  return v_session_id;
end;
$$;
revoke all on function private.current_financial_cash_session(uuid,uuid,boolean) from public;

create or replace function public.open_financial_cash_session(
  p_organization_id uuid,
  p_account_id uuid,
  p_counted_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.financial_accounts%rowtype;
  v_enabled boolean := false;
  v_counted numeric(14,2) := round(coalesce(p_counted_amount,0),2);
  v_expected numeric(14,2);
  v_difference numeric(14,2);
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_session_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.cash.open') then
    raise exception 'Sem permissão para abrir caixa.' using errcode='42501';
  end if;
  select coalesce(s.cash_session_enabled,false) into v_enabled
  from public.financial_settings s where s.organization_id=p_organization_id;
  if not coalesce(v_enabled,false) then
    raise exception 'O controle de caixa físico está desativado nesta empresa.' using errcode='22023';
  end if;
  if v_counted<0 then raise exception 'O saldo contado na abertura não pode ser negativo.' using errcode='22023'; end if;

  select * into v_account
  from public.financial_accounts a
  where a.organization_id=p_organization_id
    and a.id=p_account_id
    and a.is_active=true
  for update;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.' using errcode='P0002'; end if;
  if not v_account.allows_cash_session then
    raise exception 'Esta conta não permite sessão de caixa.' using errcode='22023';
  end if;
  if exists(
    select 1 from public.financial_cash_sessions s
    where s.organization_id=p_organization_id
      and s.financial_account_id=p_account_id
      and s.status='open'
  ) then
    raise exception 'Já existe um caixa aberto nesta conta.' using errcode='23505';
  end if;

  v_expected := private.finance_account_balance(p_organization_id,p_account_id);
  v_difference := round(v_counted-v_expected,2);
  if v_difference<>0 and v_note is null then
    raise exception 'Informe uma justificativa para a diferença encontrada na abertura do caixa.' using errcode='22023';
  end if;

  insert into public.financial_cash_sessions(
    organization_id,financial_account_id,
    opening_expected_amount,opening_counted_amount,opening_difference,opening_note,
    opened_at,opened_by
  ) values (
    p_organization_id,p_account_id,
    v_expected,v_counted,v_difference,v_note,
    now(),v_user_id
  ) returning id into v_session_id;

  if v_difference<>0 then
    insert into public.financial_movements(
      organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
      source_type,source_id,cash_session_id,description_snapshot,created_by
    ) values (
      p_organization_id,p_account_id,
      case when v_difference>0 then 'credit' else 'debit' end,
      'cash_adjustment',abs(v_difference),now(),
      'cash_session',v_session_id,v_session_id,
      'Ajuste de abertura de caixa — '||v_note,v_user_id
    );
  end if;

  return jsonb_build_object(
    'id',v_session_id,
    'status','open',
    'expected',v_expected,
    'counted',v_counted,
    'difference',v_difference
  );
end;
$$;

create or replace function public.record_financial_cash_adjustment(
  p_organization_id uuid,
  p_session_id uuid,
  p_action text,
  p_amount numeric,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.financial_cash_sessions%rowtype;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_amount numeric(14,2) := round(coalesce(p_amount,0),2);
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_permission text;
  v_movement_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if v_action not in ('supply','withdraw') then raise exception 'Tipo de ajuste de caixa inválido.' using errcode='22023'; end if;
  v_permission := case when v_action='supply' then 'finance.cash.supply' else 'finance.cash.withdraw' end;
  if not private.can_access_finance(p_organization_id,v_permission) then
    raise exception 'Sem permissão para registrar esta movimentação de caixa.' using errcode='42501';
  end if;
  if v_amount<=0 then raise exception 'O valor deve ser maior que zero.' using errcode='22023'; end if;
  if v_note is null then raise exception 'Informe o motivo da movimentação de caixa.' using errcode='22023'; end if;

  select * into v_session
  from public.financial_cash_sessions s
  where s.organization_id=p_organization_id
    and s.id=p_session_id
  for update;
  if not found then raise exception 'Sessão de caixa não encontrada.' using errcode='P0002'; end if;
  if v_session.status<>'open' then raise exception 'Esta sessão de caixa já está fechada.' using errcode='22023'; end if;

  insert into public.financial_movements(
    organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
    source_type,source_id,cash_session_id,description_snapshot,created_by
  ) values (
    p_organization_id,v_session.financial_account_id,
    case when v_action='supply' then 'credit' else 'debit' end,
    v_action,v_amount,now(),
    'cash_session',v_session.id,v_session.id,
    case when v_action='supply' then 'Suprimento de caixa — ' else 'Sangria de caixa — ' end||v_note,
    v_user_id
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create or replace function public.close_financial_cash_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_counted_amount numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.financial_cash_sessions%rowtype;
  v_counted numeric(14,2) := round(coalesce(p_counted_amount,0),2);
  v_expected numeric(14,2);
  v_difference numeric(14,2);
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.cash.close') then
    raise exception 'Sem permissão para fechar caixa.' using errcode='42501';
  end if;
  if v_counted<0 then raise exception 'O saldo contado no fechamento não pode ser negativo.' using errcode='22023'; end if;

  select * into v_session
  from public.financial_cash_sessions s
  where s.organization_id=p_organization_id and s.id=p_session_id
  for update;
  if not found then raise exception 'Sessão de caixa não encontrada.' using errcode='P0002'; end if;
  if v_session.status<>'open' then raise exception 'Esta sessão de caixa já está fechada.' using errcode='22023'; end if;

  v_expected := private.finance_account_balance(p_organization_id,v_session.financial_account_id);
  v_difference := round(v_counted-v_expected,2);
  if v_difference<>0 and v_reason is null then
    raise exception 'Informe uma justificativa para a diferença encontrada no fechamento.' using errcode='22023';
  end if;

  if v_difference<>0 then
    insert into public.financial_movements(
      organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
      source_type,source_id,cash_session_id,description_snapshot,created_by
    ) values (
      p_organization_id,v_session.financial_account_id,
      case when v_difference>0 then 'credit' else 'debit' end,
      'cash_adjustment',abs(v_difference),now(),
      'cash_session',v_session.id,v_session.id,
      'Ajuste de fechamento de caixa — '||v_reason,v_user_id
    );
  end if;

  update public.financial_cash_sessions
  set status='closed',
      closing_expected_amount=v_expected,
      closing_counted_amount=v_counted,
      closing_difference=v_difference,
      closing_reason=v_reason,
      closed_at=now(),
      closed_by=v_user_id
  where id=v_session.id and organization_id=p_organization_id;

  return jsonb_build_object(
    'id',v_session.id,
    'status','closed',
    'expected',v_expected,
    'counted',v_counted,
    'difference',v_difference
  );
end;
$$;

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
  v_cash_session_id uuid;
begin
  select * into v_s from public.financial_settlements where id=p_settlement_id for update;
  if not found then raise exception 'Baixa financeira não encontrada.' using errcode='P0002'; end if;
  if exists(select 1 from public.financial_movements m where m.organization_id=v_s.organization_id and m.source_type='settlement' and m.source_id=v_s.id) then
    raise exception 'Os movimentos desta baixa já foram registrados.' using errcode='23505';
  end if;

  v_cash_session_id := private.current_financial_cash_session(v_s.organization_id,v_s.financial_account_id,true);

  if v_s.entry_type='receivable' then
    insert into public.financial_movements(
      organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
      source_type,source_id,cash_session_id,description_snapshot,created_by
    ) values (
      v_s.organization_id,v_s.financial_account_id,'credit','receipt',v_s.gross_amount,p_posted_at,
      'settlement',v_s.id,v_cash_session_id,'Recebimento — '||v_s.payment_method_name_snapshot,p_user_id
    );
    if v_s.fee_amount>0 then
      insert into public.financial_movements(
        organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
        source_type,source_id,cash_session_id,description_snapshot,created_by
      ) values (
        v_s.organization_id,v_s.financial_account_id,'debit','fee',v_s.fee_amount,p_posted_at,
        'settlement',v_s.id,v_cash_session_id,'Taxa financeira — '||v_s.payment_method_name_snapshot,p_user_id
      );
    end if;
  else
    insert into public.financial_movements(
      organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
      source_type,source_id,cash_session_id,description_snapshot,created_by
    ) values (
      v_s.organization_id,v_s.financial_account_id,'debit','payment',v_s.gross_amount,p_posted_at,
      'settlement',v_s.id,v_cash_session_id,'Pagamento — '||v_s.payment_method_name_snapshot,p_user_id
    );
  end if;
end;
$$;
revoke all on function private.finance_post_settlement_movements(uuid,timestamptz,uuid) from public;

create or replace function public.transfer_financial_funds(
  p_organization_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_amount numeric(14,2) := round(coalesce(p_amount,0),2);
  v_from public.financial_accounts%rowtype;
  v_to public.financial_accounts%rowtype;
  v_id uuid;
  v_from_session uuid;
  v_to_session uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.transfers.create') then raise exception 'Sem permissão para realizar transferências.' using errcode='42501'; end if;
  if p_from_account_id=p_to_account_id then raise exception 'As contas de origem e destino devem ser diferentes.' using errcode='22023'; end if;
  if v_amount<=0 then raise exception 'O valor da transferência deve ser maior que zero.' using errcode='22023'; end if;
  select * into v_from from public.financial_accounts a where a.organization_id=p_organization_id and a.id=p_from_account_id and a.is_active=true for update;
  if not found then raise exception 'Conta de origem inválida ou inativa.' using errcode='23503'; end if;
  select * into v_to from public.financial_accounts a where a.organization_id=p_organization_id and a.id=p_to_account_id and a.is_active=true for update;
  if not found then raise exception 'Conta de destino inválida ou inativa.' using errcode='23503'; end if;

  v_from_session := private.current_financial_cash_session(p_organization_id,v_from.id,true);
  v_to_session := private.current_financial_cash_session(p_organization_id,v_to.id,true);

  insert into public.financial_transfers(organization_id,from_account_id,to_account_id,amount,occurred_at,note,created_by)
  values(p_organization_id,v_from.id,v_to.id,v_amount,p_occurred_at,nullif(btrim(coalesce(p_note,'')),''),v_user_id) returning id into v_id;
  insert into public.financial_movements(
    organization_id,financial_account_id,direction,movement_type,amount,occurred_at,
    source_type,source_id,cash_session_id,description_snapshot,created_by
  ) values
    (p_organization_id,v_from.id,'debit','transfer_out',v_amount,p_occurred_at,'transfer',v_id,v_from_session,'Transferência para '||v_to.name,v_user_id),
    (p_organization_id,v_to.id,'credit','transfer_in',v_amount,p_occurred_at,'transfer',v_id,v_to_session,'Transferência de '||v_from.name,v_user_id);
  return v_id;
end;
$$;

revoke all on function public.open_financial_cash_session(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.record_financial_cash_adjustment(uuid,uuid,text,numeric,text) from public,anon;
revoke all on function public.close_financial_cash_session(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.open_financial_cash_session(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.record_financial_cash_adjustment(uuid,uuid,text,numeric,text) to authenticated;
grant execute on function public.close_financial_cash_session(uuid,uuid,numeric,text) to authenticated;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p2.id
from public.role_permissions rp
join public.permissions p1 on p1.id=rp.permission_id
join public.permissions p2 on p2.key in (
  'finance.cash.open','finance.cash.close','finance.cash.supply','finance.cash.withdraw'
)
where p1.key in ('finance.accounts.manage','roles.permissions.manage')
on conflict (role_id,permission_id) do nothing;

commit;
