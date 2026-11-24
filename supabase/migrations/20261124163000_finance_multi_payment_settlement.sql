begin;
-- Atomic full settlement. The existing single-installment RPC owns authorization,
-- validation, financial movements, fee calculation and audit; no duplicated posting logic.
create or replace function public.register_financial_multi_settlement(
  p_organization_id uuid, p_entry_id uuid, p_parts jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_part jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_remaining numeric;
  v_entry_type text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if jsonb_typeof(p_parts) is distinct from 'array' then
    raise exception 'Informe as formas de pagamento da quitação.' using errcode='22023';
  end if;
  if jsonb_array_length(p_parts) not between 1 and 200 then
    raise exception 'Quantidade inválida de pagamentos.' using errcode='22023';
  end if;
  select entry_type into v_entry_type from public.financial_entries
    where organization_id=p_organization_id and id=p_entry_id;
  if v_entry_type is distinct from 'receivable' then
    raise exception 'Conta a receber não encontrada ou sem acesso.' using errcode='42501';
  end if;
  -- The first call locks the entry until this entire transaction finishes.
  -- Every subsequent call uses the same authorization and installment validation.
  for v_part in select value from jsonb_array_elements(p_parts) loop
    v_result := public.register_financial_settlement(
      p_organization_id,p_entry_id,(v_part->>'installment_id')::uuid,
      (v_part->>'principal_amount')::numeric,
      coalesce((v_part->>'interest_amount')::numeric,0),
      coalesce((v_part->>'penalty_amount')::numeric,0),
      coalesce((v_part->>'other_additions')::numeric,0),
      coalesce((v_part->>'discount_amount')::numeric,0),
      (v_part->>'payment_method_id')::uuid,
      (v_part->>'financial_account_id')::uuid,
      (v_part->>'occurred_at')::timestamptz
    );
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  select coalesce(sum(greatest(original_amount-settled_amount,0)),0) into v_remaining
    from public.financial_installments
    where organization_id=p_organization_id and financial_entry_id=p_entry_id;
  if v_remaining<>0 then
    raise exception 'O saldo mudou ou não foi totalmente distribuído. Confira todas as parcelas.' using errcode='22023';
  end if;
  return jsonb_build_object('status','posted','remaining',v_remaining,'settlements',v_results);
end;
$$;
revoke all on function public.register_financial_multi_settlement(uuid,uuid,jsonb) from public,anon;
grant execute on function public.register_financial_multi_settlement(uuid,uuid,jsonb) to authenticated;
commit;
