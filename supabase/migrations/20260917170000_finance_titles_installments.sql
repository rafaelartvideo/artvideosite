begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_titles_installments', 0));

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_type text not null check (entry_type in ('receivable','payable')),
  description text not null check (btrim(description) <> ''),
  issue_date date not null,
  competence_date date not null,
  original_amount numeric(14,2) not null check (original_amount > 0),
  approval_status text not null default 'pending' check (approval_status in ('draft','pending','approved','rejected','cancelled','reversed')),
  required_approvals smallint not null default 1 check (required_approvals in (1,2)),
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  reversed_at timestamptz,
  counterpart_entity_id uuid,
  counterpart_name_snapshot text,
  counterpart_document_snapshot text,
  origin_type text not null default 'manual' check (origin_type in ('manual','service_order','inventory_purchase','recurring','other')),
  origin_reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (counterpart_entity_id, organization_id) references public.entities(id, organization_id) on delete restrict
);

create index financial_entries_org_type_status_idx on public.financial_entries (organization_id, entry_type, approval_status, issue_date desc);
create index financial_entries_org_competence_idx on public.financial_entries (organization_id, competence_date desc);
create index financial_entries_counterpart_idx on public.financial_entries (organization_id, counterpart_entity_id);

create table public.financial_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  installment_number integer not null check (installment_number between 1 and 60),
  total_installments integer not null check (total_installments between 1 and 60),
  due_date date not null,
  original_amount numeric(14,2) not null check (original_amount > 0),
  settled_amount numeric(14,2) not null default 0 check (settled_amount >= 0 and settled_amount <= original_amount),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (financial_entry_id, installment_number),
  foreign key (organization_id, financial_entry_id) references public.financial_entries(organization_id, id) on delete restrict
);
create index financial_installments_org_due_idx on public.financial_installments (organization_id, due_date, financial_entry_id);

create table public.financial_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  category_id uuid not null,
  category_name_snapshot text not null,
  category_nature_snapshot text not null check (category_nature_snapshot in ('revenue','expense')),
  cost_center_id uuid,
  cost_center_name_snapshot text,
  allocation_mode text not null check (allocation_mode in ('amount','percentage')),
  percentage numeric(9,4) check (percentage is null or percentage between 0 and 100),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, financial_entry_id) references public.financial_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, category_id) references public.financial_categories(organization_id, id) on delete restrict,
  foreign key (organization_id, cost_center_id) references public.financial_cost_centers(organization_id, id) on delete restrict
);
create index financial_allocations_entry_idx on public.financial_allocations (organization_id, financial_entry_id);
create index financial_allocations_category_idx on public.financial_allocations (organization_id, category_id, cost_center_id);

create table public.financial_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  financial_entry_id uuid not null,
  event_type text not null check (btrim(event_type) <> ''),
  event_data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, financial_entry_id) references public.financial_entries(organization_id, id) on delete restrict
);
create index financial_events_entry_created_idx on public.financial_events (organization_id, financial_entry_id, created_at desc);

create trigger financial_entries_touch_updated_at before update on public.financial_entries for each row execute function private.finance_touch_updated_at();
create trigger financial_entries_prevent_organization_change before update of organization_id on public.financial_entries for each row execute function private.prevent_organization_id_change();

create or replace function private.can_view_financial_entry(p_organization_id uuid, p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.financial_entries e
    where e.organization_id = p_organization_id and e.id = p_entry_id
      and ((e.entry_type = 'receivable' and private.can_access_finance(e.organization_id, 'finance.receivables.view'))
        or (e.entry_type = 'payable' and private.can_access_finance(e.organization_id, 'finance.payables.view')))
  );
$$;
revoke all on function private.can_view_financial_entry(uuid, uuid) from public;
grant execute on function private.can_view_financial_entry(uuid, uuid) to authenticated;

alter table public.financial_entries enable row level security;
alter table public.financial_installments enable row level security;
alter table public.financial_allocations enable row level security;
alter table public.financial_events enable row level security;

revoke all on table public.financial_entries from anon, authenticated;
revoke all on table public.financial_installments from anon, authenticated;
revoke all on table public.financial_allocations from anon, authenticated;
revoke all on table public.financial_events from anon, authenticated;
grant select on table public.financial_entries to authenticated;
grant select on table public.financial_installments to authenticated;
grant select on table public.financial_allocations to authenticated;
grant select on table public.financial_events to authenticated;

create policy financial_entries_select on public.financial_entries for select to authenticated using (
  (entry_type = 'receivable' and private.can_access_finance(organization_id, 'finance.receivables.view'))
  or (entry_type = 'payable' and private.can_access_finance(organization_id, 'finance.payables.view'))
);
create policy financial_installments_select on public.financial_installments for select to authenticated using (private.can_view_financial_entry(organization_id, financial_entry_id));
create policy financial_allocations_select on public.financial_allocations for select to authenticated using (private.can_view_financial_entry(organization_id, financial_entry_id));
create policy financial_events_select on public.financial_events for select to authenticated using (private.can_view_financial_entry(organization_id, financial_entry_id));

create or replace function public.save_financial_entry(p_organization_id uuid, p_payload jsonb, p_entry_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid := p_entry_id;
  v_entry_type text := lower(btrim(coalesce(p_payload->>'entry_type', '')));
  v_description text := btrim(coalesce(p_payload->>'description', ''));
  v_issue_date date; v_competence_date date; v_original_amount numeric(14,2);
  v_counterpart_id uuid; v_counterpart_name text := nullif(btrim(coalesce(p_payload->>'counterpart_name', '')), '');
  v_counterpart_document text := nullif(btrim(coalesce(p_payload->>'counterpart_document', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_required_approvals smallint := 1; v_threshold numeric(14,2); v_permission_key text;
  v_is_new boolean := p_entry_id is null; v_current public.financial_entries%rowtype;
  v_installments jsonb := coalesce(p_payload->'installments', '[]'::jsonb);
  v_allocations jsonb := coalesce(p_payload->'allocations', '[]'::jsonb);
  v_installment_count integer; v_installment_sum numeric(14,2); v_allocation_sum numeric(14,2);
  v_item jsonb; v_category public.financial_categories%rowtype; v_cost_center public.financial_cost_centers%rowtype;
  v_category_id uuid; v_cost_center_id uuid; v_mode text; v_amount numeric(14,2); v_percentage numeric(9,4);
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if v_entry_type not in ('receivable','payable') then raise exception 'Tipo de lançamento financeiro inválido.' using errcode='22023'; end if;
  v_permission_key := case when v_entry_type='receivable' then case when v_is_new then 'finance.receivables.create' else 'finance.receivables.edit' end else case when v_is_new then 'finance.payables.create' else 'finance.payables.edit' end end;
  if not private.can_access_finance(p_organization_id, v_permission_key) then raise exception 'Sem permissão para salvar este lançamento financeiro.' using errcode='42501'; end if;
  if v_description='' then raise exception 'Informe a descrição do lançamento.' using errcode='22023'; end if;
  begin
    v_issue_date := (p_payload->>'issue_date')::date; v_competence_date := (p_payload->>'competence_date')::date; v_original_amount := round((p_payload->>'original_amount')::numeric,2);
  exception when others then raise exception 'Datas ou valor do lançamento são inválidos.' using errcode='22023'; end;
  if v_original_amount <= 0 then raise exception 'O valor do lançamento deve ser maior que zero.' using errcode='22023'; end if;

  if nullif(p_payload->>'counterpart_entity_id','') is not null then
    v_counterpart_id := (p_payload->>'counterpart_entity_id')::uuid;
    select coalesce(nullif(btrim(e.trade_name),''),nullif(btrim(e.name),''),nullif(btrim(e.legal_name),'')), nullif(btrim(e.document),'')
      into v_counterpart_name,v_counterpart_document from public.entities e
      where e.id=v_counterpart_id and e.organization_id=p_organization_id and e.is_active=true;
    if not found then raise exception 'Cadastro da contraparte não encontrado nesta empresa.' using errcode='23503'; end if;
  end if;

  if jsonb_typeof(v_installments)<>'array' then raise exception 'Parcelas inválidas.' using errcode='22023'; end if;
  v_installment_count := jsonb_array_length(v_installments);
  if v_installment_count<1 or v_installment_count>60 then raise exception 'Informe entre 1 e 60 parcelas.' using errcode='22023'; end if;
  select round(coalesce(sum(round((x->>'amount')::numeric,2)),0),2) into v_installment_sum from jsonb_array_elements(v_installments) x;
  if v_installment_sum<>v_original_amount then raise exception 'A soma das parcelas deve ser igual ao valor do lançamento.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_installments) x where coalesce((x->>'installment_number')::integer,0)<1 or coalesce((x->>'installment_number')::integer,0)>v_installment_count or nullif(x->>'due_date','') is null or round(coalesce((x->>'amount')::numeric,0),2)<=0) then raise exception 'Há parcela com número, vencimento ou valor inválido.' using errcode='22023'; end if;
  if (select count(distinct (x->>'installment_number')::integer) from jsonb_array_elements(v_installments) x)<>v_installment_count then raise exception 'A numeração das parcelas deve ser única e sequencial.' using errcode='22023'; end if;

  if jsonb_typeof(v_allocations)<>'array' or jsonb_array_length(v_allocations)<1 then raise exception 'Informe ao menos um rateio financeiro.' using errcode='22023'; end if;
  select round(coalesce(sum(round((x->>'amount')::numeric,2)),0),2) into v_allocation_sum from jsonb_array_elements(v_allocations) x;
  if v_allocation_sum<>v_original_amount then raise exception 'O rateio deve fechar exatamente o valor do lançamento.' using errcode='22023'; end if;

  if v_entry_type='payable' then
    select s.second_approval_threshold into v_threshold from public.financial_settings s where s.organization_id=p_organization_id;
    v_required_approvals := case when v_threshold is not null and v_original_amount>v_threshold then 2 else 1 end;
  else v_required_approvals := 1; end if;

  if not v_is_new then
    select * into v_current from public.financial_entries e where e.id=v_entry_id and e.organization_id=p_organization_id for update;
    if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
    if v_current.entry_type<>v_entry_type then raise exception 'O tipo do lançamento não pode ser alterado.' using errcode='22023'; end if;
    if v_current.origin_type<>'manual' or v_current.approval_status not in ('draft','pending','rejected') then raise exception 'Este lançamento não pode mais ser editado.' using errcode='22023'; end if;
  end if;

  for v_item in select value from jsonb_array_elements(v_allocations) loop
    v_category_id := nullif(v_item->>'category_id','')::uuid; v_cost_center_id := nullif(v_item->>'cost_center_id','')::uuid;
    v_mode := lower(coalesce(v_item->>'mode','amount')); v_amount := round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_category_id is null or v_amount<=0 or v_mode not in ('amount','percentage') then raise exception 'Há rateio com dados inválidos.' using errcode='22023'; end if;
    select * into v_category from public.financial_categories c where c.id=v_category_id and c.organization_id=p_organization_id and c.is_active=true;
    if not found then raise exception 'Categoria financeira inválida ou inativa.' using errcode='23503'; end if;
    if (v_entry_type='receivable' and v_category.nature<>'revenue') or (v_entry_type='payable' and v_category.nature<>'expense') then raise exception 'A natureza da categoria não corresponde ao tipo do lançamento.' using errcode='22023'; end if;
    if v_cost_center_id is not null then select * into v_cost_center from public.financial_cost_centers cc where cc.id=v_cost_center_id and cc.organization_id=p_organization_id and cc.is_active=true; if not found then raise exception 'Centro de custo inválido ou inativo.' using errcode='23503'; end if; end if;
  end loop;

  if v_is_new then
    insert into public.financial_entries(organization_id,entry_type,description,issue_date,competence_date,original_amount,approval_status,required_approvals,counterpart_entity_id,counterpart_name_snapshot,counterpart_document_snapshot,origin_type,notes,created_by,updated_by)
    values(p_organization_id,v_entry_type,v_description,v_issue_date,v_competence_date,v_original_amount,'pending',v_required_approvals,v_counterpart_id,v_counterpart_name,v_counterpart_document,'manual',v_notes,v_user_id,v_user_id) returning id into v_entry_id;
  else
    update public.financial_entries set description=v_description,issue_date=v_issue_date,competence_date=v_competence_date,original_amount=v_original_amount,approval_status='pending',required_approvals=v_required_approvals,approved_at=null,rejected_at=null,counterpart_entity_id=v_counterpart_id,counterpart_name_snapshot=v_counterpart_name,counterpart_document_snapshot=v_counterpart_document,notes=v_notes,updated_by=v_user_id where id=v_entry_id and organization_id=p_organization_id;
    delete from public.financial_installments where organization_id=p_organization_id and financial_entry_id=v_entry_id;
    delete from public.financial_allocations where organization_id=p_organization_id and financial_entry_id=v_entry_id;
  end if;

  insert into public.financial_installments(organization_id,financial_entry_id,installment_number,total_installments,due_date,original_amount)
  select p_organization_id,v_entry_id,(x->>'installment_number')::integer,v_installment_count,(x->>'due_date')::date,round((x->>'amount')::numeric,2) from jsonb_array_elements(v_installments) x order by (x->>'installment_number')::integer;

  for v_item in select value from jsonb_array_elements(v_allocations) loop
    v_category_id := (v_item->>'category_id')::uuid; v_cost_center_id := nullif(v_item->>'cost_center_id','')::uuid; v_mode := lower(coalesce(v_item->>'mode','amount')); v_amount := round((v_item->>'amount')::numeric,2);
    v_percentage := case when v_mode='percentage' then round(coalesce((v_item->>'value')::numeric,0),4) else round(v_amount*100/v_original_amount,4) end;
    select * into v_category from public.financial_categories c where c.id=v_category_id and c.organization_id=p_organization_id;
    if v_cost_center_id is not null then select * into v_cost_center from public.financial_cost_centers cc where cc.id=v_cost_center_id and cc.organization_id=p_organization_id; else v_cost_center.name:=null; end if;
    insert into public.financial_allocations(organization_id,financial_entry_id,category_id,category_name_snapshot,category_nature_snapshot,cost_center_id,cost_center_name_snapshot,allocation_mode,percentage,amount)
    values(p_organization_id,v_entry_id,v_category_id,v_category.name,v_category.nature,v_cost_center_id,case when v_cost_center_id is null then null else v_cost_center.name end,v_mode,v_percentage,v_amount);
  end loop;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_entry_id,case when v_is_new then 'created' else 'updated' end,jsonb_build_object('entry_type',v_entry_type,'original_amount',v_original_amount,'approval_status','pending','required_approvals',v_required_approvals,'installments',v_installment_count),v_user_id);
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_entry_id,case when v_is_new then 'submitted' else 'resubmitted' end,jsonb_build_object('approval_status','pending','required_approvals',v_required_approvals),v_user_id);
  return v_entry_id;
end;
$$;

revoke all on function public.save_financial_entry(uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_financial_entry(uuid,jsonb,uuid) to authenticated;

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, finance_permission.id
from public.role_permissions existing
join public.permissions existing_permission on existing_permission.id=existing.permission_id and existing_permission.key='roles.permissions.manage'
cross join public.permissions finance_permission
where finance_permission.key in ('finance.receivables.view','finance.receivables.create','finance.receivables.edit','finance.payables.view','finance.payables.create','finance.payables.edit')
on conflict (role_id, permission_id) do nothing;

commit;
