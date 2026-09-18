begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_recurring_rules', 0));

create table public.financial_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_type text not null check (entry_type in ('receivable','payable')),
  description text not null check (btrim(description)<>''),
  original_amount numeric(14,2) not null check (original_amount>0),
  counterpart_entity_id uuid,
  counterpart_name_snapshot text,
  counterpart_document_snapshot text,
  frequency text not null check (frequency in ('weekly','monthly','yearly','custom')),
  interval_value integer not null default 1 check (interval_value between 1 and 120),
  custom_days integer check (custom_days is null or custom_days between 1 and 3650),
  start_date date not null,
  end_date date,
  next_occurrence_date date not null,
  installment_count integer not null default 1 check (installment_count between 1 and 60),
  first_due_offset_days integer not null default 0 check (first_due_offset_days between 0 and 3650),
  allocations jsonb not null default '[]'::jsonb,
  notes text,
  is_active boolean not null default true,
  last_generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (counterpart_entity_id,organization_id)
    references public.entities(id,organization_id) on delete restrict,
  check (end_date is null or end_date>=start_date),
  check (
    (frequency='custom' and custom_days is not null)
    or (frequency<>'custom' and custom_days is null)
  )
);

create index financial_recurring_rules_org_next_idx
  on public.financial_recurring_rules(organization_id,is_active,next_occurrence_date);

create trigger financial_recurring_rules_touch_updated_at
before update on public.financial_recurring_rules
for each row execute function private.finance_touch_updated_at();

create trigger financial_recurring_rules_prevent_organization_change
before update of organization_id on public.financial_recurring_rules
for each row execute function private.prevent_organization_id_change();

alter table public.financial_recurring_rules enable row level security;
revoke all on table public.financial_recurring_rules from anon,authenticated;
grant select on table public.financial_recurring_rules to authenticated;

create policy financial_recurring_rules_select on public.financial_recurring_rules
for select to authenticated
using (
  private.can_access_finance(organization_id,'finance.recurring.view')
  or private.can_access_finance(organization_id,'finance.recurring.manage')
);

create unique index financial_entries_recurring_origin_uidx
  on public.financial_entries(organization_id,origin_type,origin_reference)
  where origin_type='recurring' and origin_reference is not null;

create or replace function private.next_financial_recurring_date(
  p_current date,
  p_frequency text,
  p_interval_value integer,
  p_custom_days integer default null
)
returns date
language plpgsql
immutable
set search_path=''
as $$
declare
  v_step integer := greatest(1,coalesce(p_interval_value,1));
  v_first date;
  v_last_day integer;
  v_day integer;
begin
  if p_frequency='weekly' then
    return p_current + (v_step*7);
  elsif p_frequency='custom' then
    return p_current + greatest(1,coalesce(p_custom_days,1));
  elsif p_frequency='monthly' then
    v_first := (date_trunc('month',p_current)::date + make_interval(months=>v_step))::date;
    v_last_day := extract(day from ((v_first + interval '1 month') - interval '1 day'))::integer;
    v_day := least(extract(day from p_current)::integer,v_last_day);
    return make_date(extract(year from v_first)::integer,extract(month from v_first)::integer,v_day);
  elsif p_frequency='yearly' then
    v_first := make_date(extract(year from p_current)::integer+v_step,extract(month from p_current)::integer,1);
    v_last_day := extract(day from ((v_first + interval '1 month') - interval '1 day'))::integer;
    v_day := least(extract(day from p_current)::integer,v_last_day);
    return make_date(extract(year from v_first)::integer,extract(month from v_first)::integer,v_day);
  end if;
  raise exception 'Frequência de recorrência inválida.' using errcode='22023';
end;
$$;
revoke all on function private.next_financial_recurring_date(date,text,integer,integer) from public;

create or replace function public.save_financial_recurring_rule(
  p_organization_id uuid,
  p_payload jsonb,
  p_rule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := p_rule_id;
  v_type text := lower(btrim(coalesce(p_payload->>'entry_type','')));
  v_description text := btrim(coalesce(p_payload->>'description',''));
  v_amount numeric(14,2);
  v_frequency text := lower(btrim(coalesce(p_payload->>'frequency','monthly')));
  v_interval integer := coalesce(nullif(p_payload->>'interval_value','')::integer,1);
  v_custom_days integer := nullif(p_payload->>'custom_days','')::integer;
  v_start date;
  v_end date;
  v_next date;
  v_installments integer := coalesce(nullif(p_payload->>'installment_count','')::integer,1);
  v_due_offset integer := coalesce(nullif(p_payload->>'first_due_offset_days','')::integer,0);
  v_allocations jsonb := coalesce(p_payload->'allocations','[]'::jsonb);
  v_counterpart_id uuid := nullif(p_payload->>'counterpart_entity_id','')::uuid;
  v_counterpart_name text := nullif(btrim(coalesce(p_payload->>'counterpart_name','')),'');
  v_counterpart_document text := nullif(btrim(coalesce(p_payload->>'counterpart_document','')),'');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes','')),'');
  v_permission text;
  v_sum numeric(14,2);
  v_item jsonb;
  v_category public.financial_categories%rowtype;
  v_cc public.financial_cost_centers%rowtype;
  v_category_id uuid;
  v_cc_id uuid;
  v_current public.financial_recurring_rules%rowtype;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.recurring.manage') then
    raise exception 'Sem permissão para gerenciar recorrências.' using errcode='42501';
  end if;
  if v_type not in ('receivable','payable') then raise exception 'Tipo de recorrência inválido.' using errcode='22023'; end if;
  v_permission := case when v_type='receivable' then 'finance.receivables.create' else 'finance.payables.create' end;
  if not private.can_access_finance(p_organization_id,v_permission) then
    raise exception 'Sem permissão para gerar este tipo de lançamento recorrente.' using errcode='42501';
  end if;
  if v_description='' then raise exception 'Informe a descrição da recorrência.' using errcode='22023'; end if;
  begin
    v_amount:=round((p_payload->>'original_amount')::numeric,2);
    v_start:=(p_payload->>'start_date')::date;
    v_end:=nullif(p_payload->>'end_date','')::date;
    v_next:=coalesce(nullif(p_payload->>'next_occurrence_date','')::date,v_start);
  exception when others then
    raise exception 'Valor ou datas da recorrência são inválidos.' using errcode='22023';
  end;
  if v_amount<=0 then raise exception 'O valor da recorrência deve ser maior que zero.' using errcode='22023'; end if;
  if v_frequency not in ('weekly','monthly','yearly','custom') then raise exception 'Frequência de recorrência inválida.' using errcode='22023'; end if;
  if v_interval<1 or v_interval>120 then raise exception 'Intervalo da recorrência inválido.' using errcode='22023'; end if;
  if v_frequency='custom' and (v_custom_days is null or v_custom_days<1 or v_custom_days>3650) then raise exception 'Informe os dias da periodicidade personalizada.' using errcode='22023'; end if;
  if v_frequency<>'custom' then v_custom_days:=null; end if;
  if v_end is not null and v_end<v_start then raise exception 'A data final não pode ser anterior ao início.' using errcode='22023'; end if;
  if v_next<v_start or (v_end is not null and v_next>v_end) then raise exception 'A próxima ocorrência está fora da vigência.' using errcode='22023'; end if;
  if v_installments<1 or v_installments>60 then raise exception 'Informe entre 1 e 60 parcelas.' using errcode='22023'; end if;
  if v_due_offset<0 or v_due_offset>3650 then raise exception 'Prazo do primeiro vencimento inválido.' using errcode='22023'; end if;

  if v_counterpart_id is not null then
    select coalesce(nullif(btrim(e.trade_name),''),nullif(btrim(e.name),''),nullif(btrim(e.legal_name),'')),
           nullif(btrim(e.document),'')
      into v_counterpart_name,v_counterpart_document
    from public.entities e
    where e.id=v_counterpart_id and e.organization_id=p_organization_id and e.is_active=true;
    if not found then raise exception 'Contraparte da recorrência não encontrada nesta empresa.' using errcode='23503'; end if;
  end if;

  if jsonb_typeof(v_allocations)<>'array' or jsonb_array_length(v_allocations)<1 then
    raise exception 'Informe o rateio da recorrência.' using errcode='22023';
  end if;
  select round(coalesce(sum(round((x->>'amount')::numeric,2)),0),2)
    into v_sum from jsonb_array_elements(v_allocations) x;
  if v_sum<>v_amount then raise exception 'O rateio da recorrência deve fechar exatamente o valor.' using errcode='22023'; end if;

  for v_item in select value from jsonb_array_elements(v_allocations) loop
    v_category_id:=nullif(v_item->>'category_id','')::uuid;
    v_cc_id:=nullif(v_item->>'cost_center_id','')::uuid;
    if v_category_id is null or round(coalesce((v_item->>'amount')::numeric,0),2)<=0 then
      raise exception 'Há rateio recorrente inválido.' using errcode='22023';
    end if;
    select * into v_category from public.financial_categories c
    where c.id=v_category_id and c.organization_id=p_organization_id and c.is_active=true;
    if not found then raise exception 'Categoria da recorrência inválida ou inativa.' using errcode='23503'; end if;
    if (v_type='receivable' and v_category.nature<>'revenue') or (v_type='payable' and v_category.nature<>'expense') then
      raise exception 'A natureza da categoria não corresponde à recorrência.' using errcode='22023';
    end if;
    if v_cc_id is not null then
      select * into v_cc from public.financial_cost_centers cc
      where cc.id=v_cc_id and cc.organization_id=p_organization_id and cc.is_active=true;
      if not found then raise exception 'Centro de custo da recorrência inválido ou inativo.' using errcode='23503'; end if;
    end if;
  end loop;

  if v_id is null then
    insert into public.financial_recurring_rules(
      organization_id,entry_type,description,original_amount,
      counterpart_entity_id,counterpart_name_snapshot,counterpart_document_snapshot,
      frequency,interval_value,custom_days,start_date,end_date,next_occurrence_date,
      installment_count,first_due_offset_days,allocations,notes,is_active,created_by,updated_by
    ) values (
      p_organization_id,v_type,v_description,v_amount,
      v_counterpart_id,v_counterpart_name,v_counterpart_document,
      v_frequency,v_interval,v_custom_days,v_start,v_end,v_next,
      v_installments,v_due_offset,v_allocations,v_notes,true,v_user_id,v_user_id
    ) returning id into v_id;
  else
    select * into v_current from public.financial_recurring_rules r
    where r.organization_id=p_organization_id and r.id=v_id for update;
    if not found then raise exception 'Recorrência financeira não encontrada.' using errcode='P0002'; end if;
    update public.financial_recurring_rules
    set entry_type=v_type,description=v_description,original_amount=v_amount,
        counterpart_entity_id=v_counterpart_id,counterpart_name_snapshot=v_counterpart_name,
        counterpart_document_snapshot=v_counterpart_document,
        frequency=v_frequency,interval_value=v_interval,custom_days=v_custom_days,
        start_date=v_start,end_date=v_end,next_occurrence_date=v_next,
        installment_count=v_installments,first_due_offset_days=v_due_offset,
        allocations=v_allocations,notes=v_notes,is_active=true,updated_by=v_user_id
    where organization_id=p_organization_id and id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_financial_recurring_rule_active(
  p_organization_id uuid,
  p_rule_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.recurring.manage') then
    raise exception 'Sem permissão para gerenciar recorrências.' using errcode='42501';
  end if;
  update public.financial_recurring_rules
  set is_active=coalesce(p_active,false),updated_by=v_user_id
  where organization_id=p_organization_id and id=p_rule_id;
  if not found then raise exception 'Recorrência financeira não encontrada.' using errcode='P0002'; end if;
  return coalesce(p_active,false);
end;
$$;

create or replace function public.generate_financial_recurring_occurrences(
  p_organization_id uuid,
  p_rule_id uuid,
  p_until_date date default (current_date+90)
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_rule public.financial_recurring_rules%rowtype;
  v_occurrence date;
  v_until date:=coalesce(p_until_date,current_date+90);
  v_installments jsonb;
  v_payload jsonb;
  v_count integer:=0;
  v_entry_id uuid;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder integer;
  v_index integer;
  v_due date;
  v_part_cents bigint;
  v_reference text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.recurring.manage') then
    raise exception 'Sem permissão para gerar recorrências.' using errcode='42501';
  end if;

  select * into v_rule from public.financial_recurring_rules r
  where r.organization_id=p_organization_id and r.id=p_rule_id for update;
  if not found then raise exception 'Recorrência financeira não encontrada.' using errcode='P0002'; end if;
  if not v_rule.is_active then return jsonb_build_object('generated',0,'next_occurrence_date',v_rule.next_occurrence_date,'active',false); end if;

  if v_until<current_date-3650 or v_until>current_date+3650 then
    raise exception 'Horizonte de geração da recorrência inválido.' using errcode='22023';
  end if;

  v_occurrence:=v_rule.next_occurrence_date;
  while v_occurrence<=v_until
    and (v_rule.end_date is null or v_occurrence<=v_rule.end_date)
    and v_count<120
  loop
    v_reference:=v_rule.id::text||':'||v_occurrence::text;

    if not exists(
      select 1 from public.financial_entries e
      where e.organization_id=p_organization_id
        and e.origin_type='recurring'
        and e.origin_reference=v_reference
    ) then
      v_total_cents:=round(v_rule.original_amount*100)::bigint;
      v_base_cents:=v_total_cents/v_rule.installment_count;
      v_remainder:=(v_total_cents%v_rule.installment_count)::integer;
      v_installments:='[]'::jsonb;
      for v_index in 1..v_rule.installment_count loop
        v_part_cents:=v_base_cents+case when v_index<=v_remainder then 1 else 0 end;
        v_due:=(v_occurrence+v_rule.first_due_offset_days)+make_interval(months=>v_index-1);
        v_installments:=v_installments||jsonb_build_array(jsonb_build_object(
          'installment_number',v_index,
          'due_date',v_due,
          'amount',(v_part_cents::numeric/100)
        ));
      end loop;

      v_payload:=jsonb_build_object(
        'entry_type',v_rule.entry_type,
        'description',v_rule.description,
        'issue_date',v_occurrence,
        'competence_date',v_occurrence,
        'original_amount',v_rule.original_amount,
        'counterpart_entity_id',v_rule.counterpart_entity_id,
        'counterpart_name',v_rule.counterpart_name_snapshot,
        'counterpart_document',v_rule.counterpart_document_snapshot,
        'notes',v_rule.notes,
        'installments',v_installments,
        'allocations',v_rule.allocations
      );

      v_entry_id:=public.save_financial_entry(p_organization_id,v_payload,null);
      update public.financial_entries
      set origin_type='recurring',
          origin_reference=v_reference,
          source_details=jsonb_build_object(
            'recurring_rule_id',v_rule.id,
            'occurrence_date',v_occurrence,
            'frequency',v_rule.frequency
          )
      where organization_id=p_organization_id and id=v_entry_id;

      insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
      values(p_organization_id,v_entry_id,'recurring_generated',jsonb_build_object(
        'recurring_rule_id',v_rule.id,'occurrence_date',v_occurrence
      ),v_user_id);

      v_count:=v_count+1;
    end if;

    v_occurrence:=private.next_financial_recurring_date(
      v_occurrence,v_rule.frequency,v_rule.interval_value,v_rule.custom_days
    );
  end loop;

  update public.financial_recurring_rules
  set next_occurrence_date=v_occurrence,
      last_generated_at=now(),
      is_active=case when end_date is not null and v_occurrence>end_date then false else is_active end,
      updated_by=v_user_id
  where organization_id=p_organization_id and id=v_rule.id;

  return jsonb_build_object(
    'generated',v_count,
    'next_occurrence_date',v_occurrence,
    'active',case when v_rule.end_date is not null and v_occurrence>v_rule.end_date then false else v_rule.is_active end
  );
end;
$$;

revoke all on function public.save_financial_recurring_rule(uuid,jsonb,uuid) from public,anon;
revoke all on function public.set_financial_recurring_rule_active(uuid,uuid,boolean) from public,anon;
revoke all on function public.generate_financial_recurring_occurrences(uuid,uuid,date) from public,anon;
grant execute on function public.save_financial_recurring_rule(uuid,jsonb,uuid) to authenticated;
grant execute on function public.set_financial_recurring_rule_active(uuid,uuid,boolean) to authenticated;
grant execute on function public.generate_financial_recurring_occurrences(uuid,uuid,date) to authenticated;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p2.id
from public.role_permissions rp
join public.permissions p1 on p1.id=rp.permission_id
join public.permissions p2 on p2.key in ('finance.recurring.view','finance.recurring.manage')
where p1.key in ('finance.settings.manage','roles.permissions.manage')
on conflict (role_id,permission_id) do nothing;

commit;
