-- Cash-flow allocation filter verification.
-- Confirms category/cost-center filters apply only their proportional allocation.
begin;

do $$
declare
  v_org uuid;
  v_user uuid;
  v_account uuid := gen_random_uuid();
  v_method uuid := gen_random_uuid();
  v_cat_a uuid := gen_random_uuid();
  v_cat_b uuid := gen_random_uuid();
  v_cc_a uuid := gen_random_uuid();
  v_cc_b uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid();
  v_installment uuid := gen_random_uuid();
  v_settlement uuid := gen_random_uuid();
  v_a jsonb;
  v_b jsonb;
  v_cross jsonb;
begin
  select om.organization_id, om.user_id
    into v_org, v_user
  from public.organization_members om
  join public.role_permissions rp on rp.role_id = om.role_id
  join public.permissions p on p.id = rp.permission_id
  where om.status = 'active'
    and p.key = 'finance.reports.cash_flow'
  limit 1;

  if v_org is null then
    raise exception 'cash-flow test member not found';
  end if;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  insert into public.financial_accounts(id, organization_id, name, account_type, is_active)
  values(v_account, v_org, '__CF allocation account ' || left(v_account::text, 8), 'bank', true);

  insert into public.financial_payment_methods(
    id, organization_id, name, method_type, percentage_fee, fixed_fee,
    settlement_days, requires_financial_account, creates_future_settlement,
    default_financial_account_id, is_active
  ) values(
    v_method, v_org, '__CF allocation PIX ' || left(v_method::text, 8),
    'pix', 0, 0, 0, true, false, v_account, true
  );

  insert into public.financial_categories(id, organization_id, name, nature, report_group, is_active)
  values
    (v_cat_a, v_org, '__CF allocation A', 'revenue', 'Teste', true),
    (v_cat_b, v_org, '__CF allocation B', 'revenue', 'Teste', true);

  insert into public.financial_cost_centers(id, organization_id, name, is_active)
  values
    (v_cc_a, v_org, '__CF center A', true),
    (v_cc_b, v_org, '__CF center B', true);

  insert into public.financial_entries(
    id, organization_id, entry_type, description, issue_date, competence_date,
    original_amount, approval_status, required_approvals, approved_at, origin_type
  ) values(
    v_entry, v_org, 'receivable', '__CF allocation test',
    current_date, current_date, 1000, 'approved', 1, now(), 'manual'
  );

  insert into public.financial_installments(
    id, organization_id, financial_entry_id, installment_number,
    total_installments, due_date, original_amount, settled_amount
  ) values(
    v_installment, v_org, v_entry, 1, 1, current_date + 5, 1000, 400
  );

  insert into public.financial_allocations(
    organization_id, financial_entry_id, category_id, category_name_snapshot,
    category_nature_snapshot, cost_center_id, cost_center_name_snapshot,
    allocation_mode, percentage, amount
  ) values
    (v_org, v_entry, v_cat_a, '__CF allocation A', 'revenue', v_cc_a, '__CF center A', 'percentage', 60, 600),
    (v_org, v_entry, v_cat_b, '__CF allocation B', 'revenue', v_cc_b, '__CF center B', 'percentage', 40, 400);

  insert into public.financial_settlements(
    id, organization_id, financial_entry_id, financial_installment_id, entry_type,
    payment_method_id, payment_method_name_snapshot, financial_account_id,
    financial_account_name_snapshot, principal_amount, interest_amount,
    penalty_amount, other_additions, discount_amount, gross_amount,
    percentage_fee_snapshot, fixed_fee_snapshot, fee_amount, net_amount,
    occurred_at, expected_settlement_at, settlement_status, posted_at
  ) values(
    v_settlement, v_org, v_entry, v_installment, 'receivable',
    v_method, 'PIX', v_account, 'Conta teste',
    400, 0, 0, 0, 0, 400, 0, 0, 0, 400,
    now(), now(), 'posted', now()
  );

  insert into public.financial_movements(
    organization_id, financial_account_id, direction, movement_type, amount,
    occurred_at, source_type, source_id, description_snapshot
  ) values(
    v_org, v_account, 'credit', 'receipt', 400,
    now(), 'settlement', v_settlement, '__CF allocation receipt'
  );

  v_a := public.get_financial_cash_flow(
    v_org, current_date - 1, current_date + 10,
    null, v_cat_a, null, null, null
  );
  v_b := public.get_financial_cash_flow(
    v_org, current_date - 1, current_date + 10,
    null, v_cat_b, null, null, null
  );
  v_cross := public.get_financial_cash_flow(
    v_org, current_date - 1, current_date + 10,
    null, v_cat_a, v_cc_b, null, null
  );

  if (v_a#>>'{totals,forecast_in}')::numeric <> 360
     or (v_a#>>'{totals,realized_in}')::numeric <> 240 then
    raise exception '60 percent cash-flow allocation mismatch: %', v_a;
  end if;

  if (v_b#>>'{totals,forecast_in}')::numeric <> 240
     or (v_b#>>'{totals,realized_in}')::numeric <> 160 then
    raise exception '40 percent cash-flow allocation mismatch: %', v_b;
  end if;

  if (v_cross#>>'{totals,forecast_in}')::numeric <> 0
     or (v_cross#>>'{totals,realized_in}')::numeric <> 0 then
    raise exception 'category/cost-center intersection must not overcount: %', v_cross;
  end if;
end;
$$;

rollback;
