begin;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('pdv.cash.open', 'Abrir caixa', 'Permite abrir o caixa utilizado pelo PDV.', 'PDV — Caixa', 2530),
  ('pdv.cash.close', 'Fechar caixa', 'Permite fechar o caixa utilizado pelo PDV.', 'PDV — Caixa', 2531),
  ('pdv.cash.supply', 'Registrar suprimento', 'Permite registrar suprimento no caixa do PDV.', 'PDV — Caixa', 2532),
  ('pdv.cash.withdraw', 'Registrar sangria', 'Permite registrar sangria no caixa do PDV.', 'PDV — Caixa', 2533)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, pdv_permission.id
from public.role_permissions existing
join public.permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.key = 'roles.permissions.manage'
cross join public.permissions pdv_permission
where pdv_permission.key in (
  'pdv.cash.open',
  'pdv.cash.close',
  'pdv.cash.supply',
  'pdv.cash.withdraw'
)
  and exists (
    select 1
    from public.roles role_row
    where role_row.id = existing.role_id
      and role_row.organization_id = public.artvideo_organization_id()
  )
on conflict (role_id, permission_id) do nothing;

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
  if not (
    private.can_access_finance(p_organization_id,'finance.cash.open')
    or private.has_tenant_module_permission(p_organization_id,'pdv','pdv.cash.open')
  ) then
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
  v_finance_permission text;
  v_pdv_permission text;
  v_movement_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if v_action not in ('supply','withdraw') then raise exception 'Tipo de ajuste de caixa inválido.' using errcode='22023'; end if;
  v_finance_permission := case when v_action='supply' then 'finance.cash.supply' else 'finance.cash.withdraw' end;
  v_pdv_permission := case when v_action='supply' then 'pdv.cash.supply' else 'pdv.cash.withdraw' end;
  if not (
    private.can_access_finance(p_organization_id,v_finance_permission)
    or private.has_tenant_module_permission(p_organization_id,'pdv',v_pdv_permission)
  ) then
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
  if not (
    private.can_access_finance(p_organization_id,'finance.cash.close')
    or private.has_tenant_module_permission(p_organization_id,'pdv','pdv.cash.close')
  ) then
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

commit;
