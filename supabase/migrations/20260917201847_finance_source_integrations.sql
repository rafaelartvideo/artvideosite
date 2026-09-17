begin;

alter table public.financial_entries
  add column if not exists source_details jsonb not null default '{}'::jsonb;

create unique index if not exists financial_entries_integrated_origin_uidx
  on public.financial_entries(organization_id, origin_type, origin_reference)
  where origin_reference is not null
    and origin_type in ('service_order','inventory_purchase');

-- Ensure Finance-enabled organizations always have sensible integration categories
-- without overriding any category the organization already configured.
insert into public.financial_settings (organization_id)
select om.organization_id
from public.organization_modules om
where om.module_key='finance' and om.is_enabled=true
on conflict (organization_id) do nothing;

with finance_orgs as (
  select om.organization_id
  from public.organization_modules om
  where om.module_key='finance' and om.is_enabled=true
), missing_revenue as (
  select fo.organization_id
  from finance_orgs fo
  join public.financial_settings s on s.organization_id=fo.organization_id
  where s.default_receivable_category_id is null
), inserted as (
  insert into public.financial_categories(organization_id,name,nature,report_group,description,is_active)
  select mr.organization_id,'Serviços','revenue','Receitas operacionais','Categoria padrão para receitas de ordens de serviço.',true
  from missing_revenue mr
  where not exists (
    select 1 from public.financial_categories c
    where c.organization_id=mr.organization_id and c.nature='revenue' and lower(btrim(c.name))=lower('Serviços')
  )
  returning id,organization_id
)
update public.financial_settings s
set default_receivable_category_id=coalesce(
  s.default_receivable_category_id,
  (select c.id from public.financial_categories c where c.organization_id=s.organization_id and c.nature='revenue' and c.is_active=true order by case when lower(btrim(c.name))=lower('Serviços') then 0 else 1 end,c.created_at limit 1)
), updated_at=now()
where s.organization_id in (select organization_id from finance_orgs)
  and s.default_receivable_category_id is null;

with finance_orgs as (
  select om.organization_id
  from public.organization_modules om
  where om.module_key='finance' and om.is_enabled=true
), missing_expense as (
  select fo.organization_id
  from finance_orgs fo
  join public.financial_settings s on s.organization_id=fo.organization_id
  where s.default_payable_category_id is null
), inserted as (
  insert into public.financial_categories(organization_id,name,nature,report_group,description,is_active)
  select me.organization_id,'Compras de estoque','expense','Custos operacionais','Categoria padrão para compras de estoque.',true
  from missing_expense me
  where not exists (
    select 1 from public.financial_categories c
    where c.organization_id=me.organization_id and c.nature='expense' and lower(btrim(c.name))=lower('Compras de estoque')
  )
  returning id,organization_id
)
update public.financial_settings s
set default_payable_category_id=coalesce(
  s.default_payable_category_id,
  (select c.id from public.financial_categories c where c.organization_id=s.organization_id and c.nature='expense' and c.is_active=true order by case when lower(btrim(c.name))=lower('Compras de estoque') then 0 else 1 end,c.created_at limit 1)
), updated_at=now()
where s.organization_id in (select organization_id from finance_orgs)
  and s.default_payable_category_id is null;

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
declare
  v_entry_type text := lower(btrim(coalesce(p_entry_type,'')));
  v_origin_type text := lower(btrim(coalesce(p_origin_type,'')));
  v_origin_reference text := nullif(btrim(coalesce(p_origin_reference,'')),'');
  v_description text := btrim(coalesce(p_description,''));
  v_amount numeric(14,2) := round(coalesce(p_original_amount,0),2);
  v_status text := lower(btrim(coalesce(p_approval_status,'pending')));
  v_created_by uuid := coalesce(p_created_by,auth.uid());
  v_settings public.financial_settings%rowtype;
  v_category public.financial_categories%rowtype;
  v_cost_center public.financial_cost_centers%rowtype;
  v_category_id uuid;
  v_cost_center_id uuid;
  v_required smallint := 1;
  v_installment_count integer;
  v_installment_sum numeric(14,2);
  v_item jsonb;
  v_number integer;
  v_due date;
  v_installment_amount numeric(14,2);
  v_entry_id uuid;
begin
  if v_entry_type not in ('receivable','payable') then raise exception 'Tipo financeiro integrado inválido.' using errcode='22023'; end if;
  if v_origin_type not in ('service_order','inventory_purchase') then raise exception 'Origem financeira integrada inválida.' using errcode='22023'; end if;
  if v_origin_reference is null then raise exception 'A origem integrada precisa de uma referência única.' using errcode='22023'; end if;
  if v_description='' then raise exception 'Informe a descrição do lançamento integrado.' using errcode='22023'; end if;
  if v_amount<=0 then raise exception 'O valor do lançamento integrado deve ser maior que zero.' using errcode='22023'; end if;
  if v_status not in ('pending','approved') then raise exception 'Status de aprovação integrado inválido.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_installments,'[]'::jsonb))<>'array' then raise exception 'Parcelas integradas inválidas.' using errcode='22023'; end if;
  v_installment_count:=jsonb_array_length(coalesce(p_installments,'[]'::jsonb));
  if v_installment_count<1 or v_installment_count>60 then raise exception 'Informe entre 1 e 60 parcelas integradas.' using errcode='22023'; end if;

  if exists(select 1 from public.financial_entries e where e.organization_id=p_organization_id and e.origin_type=v_origin_type and e.origin_reference=v_origin_reference) then
    raise exception 'Já existe um lançamento financeiro para esta origem.' using errcode='23505';
  end if;

  if p_counterpart_entity_id is not null and not exists(
    select 1 from public.entities e where e.id=p_counterpart_entity_id and e.organization_id=p_organization_id
  ) then raise exception 'A contraparte integrada não pertence a esta empresa.' using errcode='23503'; end if;

  select * into v_settings from public.financial_settings s where s.organization_id=p_organization_id;
  if not found then
    insert into public.financial_settings(organization_id) values(p_organization_id) returning * into v_settings;
  end if;

  v_category_id:=case when v_entry_type='receivable' then v_settings.default_receivable_category_id else v_settings.default_payable_category_id end;
  if v_category_id is null then
    select c.id into v_category_id from public.financial_categories c
    where c.organization_id=p_organization_id and c.is_active=true
      and c.nature=case when v_entry_type='receivable' then 'revenue' else 'expense' end
    order by c.created_at limit 1;
  end if;
  select * into v_category from public.financial_categories c
  where c.id=v_category_id and c.organization_id=p_organization_id and c.is_active=true;
  if not found then raise exception 'Configure a categoria financeira padrão da empresa antes da integração.' using errcode='23503'; end if;
  if (v_entry_type='receivable' and v_category.nature<>'revenue') or (v_entry_type='payable' and v_category.nature<>'expense') then
    raise exception 'A categoria padrão não corresponde à natureza do lançamento.' using errcode='22023';
  end if;

  v_cost_center_id:=v_settings.default_cost_center_id;
  if v_cost_center_id is not null then
    select * into v_cost_center from public.financial_cost_centers cc
    where cc.id=v_cost_center_id and cc.organization_id=p_organization_id and cc.is_active=true;
    if not found then v_cost_center_id:=null; end if;
  end if;

  select round(coalesce(sum(round((x->>'amount')::numeric,2)),0),2)
    into v_installment_sum
  from jsonb_array_elements(p_installments) x;
  if v_installment_sum<>v_amount then raise exception 'A soma das parcelas integradas deve fechar o valor do lançamento.' using errcode='22023'; end if;
  if (select count(distinct (x->>'installment_number')::integer) from jsonb_array_elements(p_installments) x)<>v_installment_count then
    raise exception 'A numeração das parcelas integradas deve ser única.' using errcode='22023';
  end if;

  if v_entry_type='payable' then
    v_required:=case when v_settings.second_approval_threshold is not null and v_amount>v_settings.second_approval_threshold then 2 else 1 end;
  else
    v_required:=1;
  end if;

  insert into public.financial_entries(
    organization_id,entry_type,description,issue_date,competence_date,original_amount,
    approval_status,required_approvals,approved_at,counterpart_entity_id,counterpart_name_snapshot,
    counterpart_document_snapshot,origin_type,origin_reference,source_details,created_by,updated_by
  ) values (
    p_organization_id,v_entry_type,v_description,p_issue_date,p_competence_date,v_amount,
    v_status,v_required,case when v_status='approved' then now() else null end,p_counterpart_entity_id,
    nullif(btrim(coalesce(p_counterpart_name,'')),''),nullif(btrim(coalesce(p_counterpart_document,'')),''),
    v_origin_type,v_origin_reference,coalesce(p_source_details,'{}'::jsonb),v_created_by,v_created_by
  ) returning id into v_entry_id;

  for v_item in select value from jsonb_array_elements(p_installments) loop
    begin
      v_number:=(v_item->>'installment_number')::integer;
      v_due:=(v_item->>'due_date')::date;
      v_installment_amount:=round((v_item->>'amount')::numeric,2);
    exception when others then
      raise exception 'Há parcela integrada com dados inválidos.' using errcode='22023';
    end;
    if v_number<1 or v_number>v_installment_count or v_installment_amount<=0 then
      raise exception 'Há parcela integrada com número ou valor inválido.' using errcode='22023';
    end if;
    insert into public.financial_installments(organization_id,financial_entry_id,installment_number,total_installments,due_date,original_amount)
    values(p_organization_id,v_entry_id,v_number,v_installment_count,v_due,v_installment_amount);
  end loop;

  insert into public.financial_allocations(
    organization_id,financial_entry_id,category_id,category_name_snapshot,category_nature_snapshot,
    cost_center_id,cost_center_name_snapshot,allocation_mode,percentage,amount
  ) values (
    p_organization_id,v_entry_id,v_category.id,v_category.name,v_category.nature,
    v_cost_center_id,case when v_cost_center_id is null then null else v_cost_center.name end,
    'percentage',100,v_amount
  );

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_entry_id,'integrated_created',jsonb_build_object(
    'origin_type',v_origin_type,'origin_reference',v_origin_reference,'approval_status',v_status,
    'required_approvals',v_required,'source_details',coalesce(p_source_details,'{}'::jsonb)
  ),v_created_by);

  return v_entry_id;
end;
$$;

revoke all on function private.create_integrated_financial_entry(uuid,text,text,text,text,date,date,numeric,uuid,text,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;

commit;
