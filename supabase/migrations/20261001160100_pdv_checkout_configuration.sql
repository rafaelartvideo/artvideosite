begin;

create or replace function public.configure_pdv_quick_setup(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cash_account_id uuid;
  v_receipts_account_id uuid;
  v_revenue_category_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.settings.manage'
  ) then
    raise exception 'Sem permissão para configurar o PDV.' using errcode='42501';
  end if;

  insert into public.organization_modules (
    organization_id,module_key,is_enabled,limits,settings,enabled_at
  )
  values (
    p_organization_id,'finance',true,'{}'::jsonb,'{}'::jsonb,now()
  )
  on conflict (organization_id,module_key) do update set
    is_enabled=true,
    enabled_at=coalesce(public.organization_modules.enabled_at,excluded.enabled_at),
    updated_at=now();

  insert into public.financial_settings (
    organization_id,cash_session_enabled
  )
  values (p_organization_id,true)
  on conflict (organization_id) do update set
    cash_session_enabled=true,
    updated_at=now();

  select account.id
    into v_cash_account_id
  from public.financial_accounts account
  where account.organization_id=p_organization_id
    and lower(btrim(account.name))=lower('Caixa PDV')
  limit 1;

  if v_cash_account_id is null then
    insert into public.financial_accounts (
      organization_id,name,account_type,description,allows_cash_session,is_active,created_by
    )
    values (
      p_organization_id,'Caixa PDV','cash','Caixa físico padrão do PDV.',true,true,v_user_id
    )
    returning id into v_cash_account_id;
  else
    update public.financial_accounts
       set account_type='cash',
           allows_cash_session=true,
           is_active=true,
           updated_at=now()
     where organization_id=p_organization_id
       and id=v_cash_account_id;
  end if;

  select account.id
    into v_receipts_account_id
  from public.financial_accounts account
  where account.organization_id=p_organization_id
    and lower(btrim(account.name))=lower('Recebimentos PDV')
  limit 1;

  if v_receipts_account_id is null then
    insert into public.financial_accounts (
      organization_id,name,account_type,description,allows_cash_session,is_active,created_by
    )
    values (
      p_organization_id,'Recebimentos PDV','other','Recebimentos eletrônicos do PDV.',false,true,v_user_id
    )
    returning id into v_receipts_account_id;
  else
    update public.financial_accounts
       set allows_cash_session=false,
           is_active=true,
           updated_at=now()
     where organization_id=p_organization_id
       and id=v_receipts_account_id;
  end if;

  insert into public.financial_payment_methods (
    organization_id,name,method_type,percentage_fee,fixed_fee,settlement_days,
    requires_financial_account,creates_future_settlement,default_financial_account_id,is_active,created_by
  )
  select
    p_organization_id,
    defaults.name,
    defaults.method_type,
    0,0,defaults.settlement_days,
    true,
    defaults.future_settlement,
    case when defaults.method_type='cash' then v_cash_account_id else v_receipts_account_id end,
    true,
    v_user_id
  from (
    values
      ('Dinheiro'::text,'cash'::text,0,false),
      ('PIX'::text,'pix'::text,0,false),
      ('Débito'::text,'debit_card'::text,0,false),
      ('Crédito'::text,'credit_card'::text,30,true)
  ) as defaults(name,method_type,settlement_days,future_settlement)
  where not exists (
    select 1
    from public.financial_payment_methods method
    where method.organization_id=p_organization_id
      and method.method_type=defaults.method_type
  )
  on conflict do nothing;

  update public.financial_payment_methods method
     set default_financial_account_id=v_cash_account_id,
         updated_at=now()
   where method.organization_id=p_organization_id
     and method.method_type='cash'
     and method.is_active=true
     and method.default_financial_account_id is null;

  update public.financial_payment_methods method
     set default_financial_account_id=v_receipts_account_id,
         updated_at=now()
   where method.organization_id=p_organization_id
     and method.method_type<>'cash'
     and method.is_active=true
     and method.default_financial_account_id is null;

  select settings.default_receivable_category_id
    into v_revenue_category_id
  from public.financial_settings settings
  where settings.organization_id=p_organization_id;

  if v_revenue_category_id is not null and not exists (
    select 1
    from public.financial_categories category
    where category.organization_id=p_organization_id
      and category.id=v_revenue_category_id
      and category.nature='revenue'
      and category.is_active=true
  ) then
    v_revenue_category_id := null;
  end if;

  if v_revenue_category_id is null then
    select category.id
      into v_revenue_category_id
    from public.financial_categories category
    where category.organization_id=p_organization_id
      and category.nature='revenue'
      and category.is_active=true
    order by category.created_at
    limit 1;
  end if;

  if v_revenue_category_id is null then
    update public.financial_categories category
       set is_active=true,
           updated_at=now()
     where category.organization_id=p_organization_id
       and category.nature='revenue'
       and lower(btrim(category.name))=lower('Vendas PDV')
     returning category.id into v_revenue_category_id;
  end if;

  if v_revenue_category_id is null then
    insert into public.financial_categories (
      organization_id,name,nature,report_group,description,is_active,created_by
    )
    values (
      p_organization_id,'Vendas PDV','revenue','Receita operacional',
      'Receitas originadas no ponto de venda.',true,v_user_id
    )
    returning id into v_revenue_category_id;
  end if;

  update public.financial_settings
     set default_receivable_category_id=coalesce(default_receivable_category_id,v_revenue_category_id),
         cash_session_enabled=true,
         updated_at=now()
   where organization_id=p_organization_id;

  insert into public.pdv_settings (
    organization_id,default_cash_account_id,require_open_cash,
    allow_sale_without_customer,allow_negative_stock,created_by,updated_by
  )
  values (
    p_organization_id,v_cash_account_id,true,true,false,v_user_id,v_user_id
  )
  on conflict (organization_id) do update set
    default_cash_account_id=coalesce(public.pdv_settings.default_cash_account_id,excluded.default_cash_account_id),
    updated_by=v_user_id,
    updated_at=now();

  return public.get_pdv_bootstrap_v1(p_organization_id);
end;
$$;

revoke all on function public.configure_pdv_quick_setup(uuid) from public,anon;
grant execute on function public.configure_pdv_quick_setup(uuid) to authenticated;

create or replace function public.get_pdv_bootstrap_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_settings public.pdv_settings%rowtype;
  v_default_account public.financial_accounts%rowtype;
  v_open_session public.financial_cash_sessions%rowtype;
  v_accounts jsonb := '[]'::jsonb;
  v_methods jsonb := '[]'::jsonb;
  v_cash_enabled boolean := false;
  v_product_count integer := 0;
  v_payment_count integer := 0;
  v_ready_payment_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.view'
  ) then
    raise exception 'Sem permissão para acessar o PDV.' using errcode='42501';
  end if;

  select settings.*
    into v_settings
  from public.pdv_settings settings
  where settings.organization_id=p_organization_id;

  select coalesce(settings.cash_session_enabled,false)
    into v_cash_enabled
  from public.financial_settings settings
  where settings.organization_id=p_organization_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',account.id,
        'name',account.name,
        'balance',private.finance_account_balance(p_organization_id,account.id),
        'allows_cash_session',account.allows_cash_session
      )
      order by account.name
    ),
    '[]'::jsonb
  )
    into v_accounts
  from public.financial_accounts account
  where account.organization_id=p_organization_id
    and account.account_type='cash'
    and account.is_active=true
    and account.allows_cash_session=true;

  if v_settings.default_cash_account_id is not null then
    select account.*
      into v_default_account
    from public.financial_accounts account
    where account.organization_id=p_organization_id
      and account.id=v_settings.default_cash_account_id
      and account.is_active=true
      and account.account_type='cash'
      and account.allows_cash_session=true;

    if found then
      select session.*
        into v_open_session
      from public.financial_cash_sessions session
      where session.organization_id=p_organization_id
        and session.financial_account_id=v_default_account.id
        and session.status='open'
      order by session.opened_at desc
      limit 1;
    end if;
  end if;

  select count(*)::integer
    into v_product_count
  from public.products product
  where product.organization_id=p_organization_id
    and product.is_active=true
    and product.price is not null;

  select count(*)::integer
    into v_payment_count
  from public.financial_payment_methods method
  where method.organization_id=p_organization_id
    and method.is_active=true;

  select count(*)::integer
    into v_ready_payment_count
  from public.financial_payment_methods method
  join public.financial_accounts account
    on account.organization_id=method.organization_id
   and account.id=case
     when method.method_type='cash'
       then coalesce(method.default_financial_account_id,v_settings.default_cash_account_id)
     else method.default_financial_account_id
   end
   and account.is_active=true
  where method.organization_id=p_organization_id
    and method.is_active=true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',method.id,
        'name',method.name,
        'method_type',method.method_type,
        'percentage_fee',method.percentage_fee,
        'fixed_fee',method.fixed_fee,
        'settlement_days',method.settlement_days,
        'creates_future_settlement',method.creates_future_settlement,
        'financial_account_id',account.id,
        'financial_account_name',account.name,
        'available_for_pdv',(account.id is not null)
      )
      order by method.name
    ),
    '[]'::jsonb
  )
    into v_methods
  from public.financial_payment_methods method
  left join public.financial_accounts account
    on account.organization_id=method.organization_id
   and account.id=case
     when method.method_type='cash'
       then coalesce(method.default_financial_account_id,v_settings.default_cash_account_id)
     else method.default_financial_account_id
   end
   and account.is_active=true
  where method.organization_id=p_organization_id
    and method.is_active=true;

  return jsonb_build_object(
    'configured',
      v_settings.organization_id is not null
      and v_settings.default_cash_account_id is not null
      and v_default_account.id is not null
      and v_cash_enabled
      and v_ready_payment_count>0,
    'cash_session_enabled',v_cash_enabled,
    'settings',
      case
        when v_settings.organization_id is null then null
        else jsonb_build_object(
          'organization_id',v_settings.organization_id,
          'default_cash_account_id',v_settings.default_cash_account_id,
          'require_open_cash',v_settings.require_open_cash,
          'allow_sale_without_customer',v_settings.allow_sale_without_customer,
          'allow_negative_stock',v_settings.allow_negative_stock
        )
      end,
    'cash_accounts',v_accounts,
    'cash_account',
      case
        when v_default_account.id is null then null
        else jsonb_build_object(
          'id',v_default_account.id,
          'name',v_default_account.name,
          'balance',private.finance_account_balance(p_organization_id,v_default_account.id)
        )
      end,
    'open_session',
      case
        when v_open_session.id is null then null
        else jsonb_build_object(
          'id',v_open_session.id,
          'status',v_open_session.status,
          'opening_expected_amount',v_open_session.opening_expected_amount,
          'opening_counted_amount',v_open_session.opening_counted_amount,
          'opening_difference',v_open_session.opening_difference,
          'opening_note',v_open_session.opening_note,
          'opened_at',v_open_session.opened_at,
          'opened_by',v_open_session.opened_by
        )
      end,
    'payment_methods',v_methods,
    'readiness',jsonb_build_object(
      'active_products',v_product_count,
      'active_payment_methods',v_payment_count,
      'ready_payment_methods',v_ready_payment_count
    )
  );
end;
$$;

revoke all on function public.get_pdv_bootstrap_v1(uuid) from public,anon;
grant execute on function public.get_pdv_bootstrap_v1(uuid) to authenticated;

create or replace function public.search_pdv_customers_v1(
  p_organization_id uuid,
  p_search text default '',
  p_limit integer default 20
)
returns table (
  id uuid,
  name text,
  document text,
  whatsapp text,
  phone text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_search text := btrim(coalesce(p_search,''));
  v_limit integer := least(50,greatest(1,coalesce(p_limit,20)));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.sales.create'
  ) then
    raise exception 'Sem permissão para realizar vendas no PDV.' using errcode='42501';
  end if;

  return query
  select
    customer.id,
    coalesce(
      nullif(btrim(customer.trade_name),''),
      nullif(btrim(customer.full_name),''),
      nullif(btrim(customer.legal_name),''),
      'Cliente'
    ) as name,
    coalesce(nullif(btrim(customer.cnpj),''),nullif(btrim(customer.document),'')) as document,
    customer.whatsapp,
    customer.phone
  from public.customers customer
  where customer.organization_id=p_organization_id
    and (
      v_search=''
      or coalesce(customer.trade_name,'') ilike '%'||v_search||'%'
      or coalesce(customer.full_name,'') ilike '%'||v_search||'%'
      or coalesce(customer.legal_name,'') ilike '%'||v_search||'%'
      or coalesce(customer.cnpj,'') ilike '%'||v_search||'%'
      or coalesce(customer.document,'') ilike '%'||v_search||'%'
      or coalesce(customer.whatsapp,'') ilike '%'||v_search||'%'
      or coalesce(customer.phone,'') ilike '%'||v_search||'%'
    )
  order by name
  limit v_limit;
end;
$$;

revoke all on function public.search_pdv_customers_v1(uuid,text,integer) from public,anon;
grant execute on function public.search_pdv_customers_v1(uuid,text,integer) to authenticated;

commit;
