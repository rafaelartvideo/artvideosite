begin;

alter function private.create_integrated_financial_entry(uuid,text,text,text,text,date,date,numeric,uuid,text,text,jsonb,jsonb,text,uuid)
  rename to create_integrated_financial_entry_enabled_impl;

create or replace function private.create_integrated_financial_entry(
  p_organization_id uuid,
  p_entry_type text,
  p_origin_type text,
  p_origin_reference text,
  p_description text,
  p_issue_date date,
  p_competence_date date,
  p_original_amount numeric,
  p_counterpart_entity_id uuid default null,
  p_counterpart_name text default null,
  p_counterpart_document text default null,
  p_source_details jsonb default '{}'::jsonb,
  p_installments jsonb default '[]'::jsonb,
  p_approval_status text default 'pending',
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.organization_modules om
    where om.organization_id=p_organization_id
      and om.module_key='finance'
      and om.is_enabled=true
  ) then
    return null;
  end if;

  return private.create_integrated_financial_entry_enabled_impl(
    p_organization_id,p_entry_type,p_origin_type,p_origin_reference,p_description,
    p_issue_date,p_competence_date,p_original_amount,p_counterpart_entity_id,
    p_counterpart_name,p_counterpart_document,p_source_details,p_installments,
    p_approval_status,p_created_by
  );
end;
$$;

revoke all on function private.create_integrated_financial_entry_enabled_impl(uuid,text,text,text,text,date,date,numeric,uuid,text,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function private.create_integrated_financial_entry(uuid,text,text,text,text,date,date,numeric,uuid,text,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;

create or replace function public.get_order_completion_finance_options(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_accounts jsonb;
  v_methods jsonb;
  v_enabled boolean;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.has_effective_organization_permission(p_organization_id,'orders.complete') then
    raise exception 'Você não possui permissão para concluir OS nesta empresa.' using errcode='42501';
  end if;

  select exists(
    select 1 from public.organization_modules om
    where om.organization_id=p_organization_id and om.module_key='finance' and om.is_enabled=true
  ) into v_enabled;

  if not v_enabled then
    return jsonb_build_object('finance_enabled',false,'accounts','[]'::jsonb,'payment_methods','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'name',a.name,'account_type',a.account_type
  ) order by a.name),'[]'::jsonb)
  into v_accounts
  from public.financial_accounts a
  where a.organization_id=p_organization_id and a.is_active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'name',m.name,'method_type',m.method_type,
    'percentage_fee',m.percentage_fee,'fixed_fee',m.fixed_fee,
    'settlement_days',m.settlement_days,'creates_future_settlement',m.creates_future_settlement,
    'default_financial_account_id',m.default_financial_account_id
  ) order by m.name),'[]'::jsonb)
  into v_methods
  from public.financial_payment_methods m
  where m.organization_id=p_organization_id and m.is_active=true;

  return jsonb_build_object('finance_enabled',true,'accounts',v_accounts,'payment_methods',v_methods);
end;
$$;

revoke all on function public.get_order_completion_finance_options(uuid) from public,anon;
grant execute on function public.get_order_completion_finance_options(uuid) to authenticated;

commit;
