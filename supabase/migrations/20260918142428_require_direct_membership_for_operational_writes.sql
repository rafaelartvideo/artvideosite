begin;

create or replace function private.require_direct_membership_for_operational_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  v_organization_id := case
    when tg_op='DELETE' then old.organization_id
    else new.organization_id
  end;

  if v_organization_id is null
     or not private.is_organization_member(v_organization_id) then
    raise exception 'Esta operação só pode ser executada por um usuário ativo da própria empresa.'
      using errcode='42501';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.require_direct_membership_for_operational_write() from public;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'inventory_items',
    'inventory_movements',
    'entity_supplier_items',
    'employees',
    'employee_signatures'
  ]
  loop
    v_trigger := v_table || '_direct_member_write_guard';
    execute format('drop trigger if exists %I on public.%I',v_trigger,v_table);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
       for each row execute function private.require_direct_membership_for_operational_write()',
      v_trigger,v_table
    );
  end loop;
end;
$$;

create or replace function public.can_document_signature_action(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path='public','private','pg_temp'
as $$
begin
  if auth.uid() is null then return false; end if;
  if not private.is_organization_member(p_organization_id) then return false; end if;

  if p_permission_key not in (
    'documents.signatures.view',
    'documents.signatures.send',
    'documents.signatures.resend',
    'documents.signatures.cancel',
    'documents.signatures.audit'
  ) then
    return false;
  end if;

  return private.has_effective_organization_permission(
    p_organization_id,
    p_permission_key
  );
end;
$$;

create or replace function public.get_order_completion_finance_options(
  p_organization_id uuid
)
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
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.can_access_shared_organization_resource(
    p_organization_id,'orders','manage'
  ) then
    raise exception 'Você não possui acesso de gestão às OS desta empresa.'
      using errcode='42501';
  end if;

  if not private.has_effective_organization_permission(
    p_organization_id,'orders.complete'
  ) then
    raise exception 'Você não possui permissão para concluir OS nesta empresa.'
      using errcode='42501';
  end if;

  select exists(
    select 1
    from public.organization_modules om
    where om.organization_id=p_organization_id
      and om.module_key='finance'
      and om.is_enabled=true
  ) into v_enabled;

  if not v_enabled then
    return jsonb_build_object(
      'finance_enabled',false,
      'accounts','[]'::jsonb,
      'payment_methods','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'name',a.name,'account_type',a.account_type
  ) order by a.name),'[]'::jsonb)
  into v_accounts
  from public.financial_accounts a
  where a.organization_id=p_organization_id
    and a.is_active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,
    'name',m.name,
    'method_type',m.method_type,
    'percentage_fee',m.percentage_fee,
    'fixed_fee',m.fixed_fee,
    'settlement_days',m.settlement_days,
    'creates_future_settlement',m.creates_future_settlement,
    'default_financial_account_id',m.default_financial_account_id
  ) order by m.name),'[]'::jsonb)
  into v_methods
  from public.financial_payment_methods m
  where m.organization_id=p_organization_id
    and m.is_active=true;

  return jsonb_build_object(
    'finance_enabled',true,
    'accounts',v_accounts,
    'payment_methods',v_methods
  );
end;
$$;

create or replace function public.list_document_signature_employee_candidates(
  p_organization_id uuid
)
returns table(entity_id uuid,employee_name text,signature_version integer)
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not private.is_organization_member(p_organization_id) then
    raise exception 'Você não possui acesso operacional a esta empresa.'
      using errcode='42501';
  end if;

  if not private.is_organization_module_enabled(
    p_organization_id,'documents'
  ) then
    raise exception 'O módulo de documentos não está habilitado para esta empresa.'
      using errcode='42501';
  end if;

  if not private.has_effective_organization_permission(
    p_organization_id,'documents.signatures.send'
  ) then
    raise exception 'Sem permissão para enviar documentos para assinatura.'
      using errcode='42501';
  end if;

  return query
  select
    e.id,
    coalesce(
      nullif(btrim(e.name),''),
      nullif(btrim(e.trade_name),''),
      nullif(btrim(e.legal_name),''),
      'Funcionário'
    )::text,
    es.version
  from public.entities e
  join public.entity_roles er
    on er.entity_id=e.id
   and er.role='employee'
   and er.is_active=true
  join public.employee_signatures es
    on es.organization_id=e.organization_id
   and es.entity_id=e.id
   and es.is_active=true
  where e.organization_id=p_organization_id
    and e.is_active=true
  order by 2,e.id;
end;
$$;

commit;
