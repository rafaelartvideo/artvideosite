-- Financeiro direto e filtros reais no banco; mantém lançamentos e aprovações históricas.
CREATE OR REPLACE FUNCTION public.save_financial_entry(p_organization_id uuid, p_payload jsonb, p_entry_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid := p_entry_id;
  v_entry_type text := lower(btrim(coalesce(p_payload->>'entry_type', '')));
  v_description text := btrim(coalesce(p_payload->>'description', ''));
  v_issue_date date;
  v_competence_date date;
  v_original_amount numeric(14,2);
  v_counterpart_id uuid;
  v_counterpart_name text := nullif(btrim(coalesce(p_payload->>'counterpart_name', '')), '');
  v_counterpart_document text := nullif(btrim(coalesce(p_payload->>'counterpart_document', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_required_approvals smallint := 1;
  v_threshold numeric(14,2);
  v_permission_key text;
  v_is_new boolean := p_entry_id is null;
  v_current public.financial_entries%rowtype;
  v_approval_cycle integer := 1;
  v_installments jsonb := coalesce(p_payload->'installments', '[]'::jsonb);
  v_allocations jsonb := coalesce(p_payload->'allocations', '[]'::jsonb);
  v_payment_plan jsonb := coalesce(p_payload->'payment_plan','[]'::jsonb);
  v_installment_count integer;
  v_installment_sum numeric(14,2);
  v_allocation_sum numeric(14,2);
  v_item jsonb;
  v_category public.financial_categories%rowtype;
  v_cost_center public.financial_cost_centers%rowtype;
  v_category_id uuid;
  v_cost_center_id uuid;
  v_mode text;
  v_amount numeric(14,2);
  v_percentage numeric(9,4);
  v_expected_percentage_amount numeric(14,2);
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if v_entry_type not in ('receivable','payable') then raise exception 'Tipo de lançamento financeiro inválido.' using errcode='22023'; end if;
  v_permission_key := case when v_entry_type='receivable' then case when v_is_new then 'finance.receivables.create' else 'finance.receivables.edit' end else case when v_is_new then 'finance.payables.create' else 'finance.payables.edit' end end;
  if not private.can_access_finance(p_organization_id, v_permission_key) then raise exception 'Sem permissão para salvar este lançamento financeiro.' using errcode='42501'; end if;
  if v_description='' then raise exception 'Informe a descrição do lançamento.' using errcode='22023'; end if;
  begin
    v_issue_date := (p_payload->>'issue_date')::date;
    v_competence_date := (p_payload->>'competence_date')::date;
    v_original_amount := round((p_payload->>'original_amount')::numeric,2);
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

  -- Financeiro direto: sem etapa intermediária de aprovação.
  v_required_approvals := 1;

  -- Forma de pagamento combinada: apenas planejamento, não gera baixa.
  if jsonb_typeof(v_payment_plan) <> 'array' or jsonb_array_length(v_payment_plan) > 10 then
    raise exception 'Informe até 10 formas de pagamento.' using errcode='22023';
  end if;
  if jsonb_array_length(v_payment_plan)>0 then
    if exists (
      select 1 from jsonb_array_elements(v_payment_plan) x
      left join public.financial_payment_methods m
        on m.id=nullif(x->>'payment_method_id','')::uuid
       and m.organization_id=p_organization_id and m.is_active=true
      where m.id is null or round(coalesce((x->>'amount')::numeric,0),2)<=0
    ) then raise exception 'Plano de pagamentos possui forma ou valor inválido.' using errcode='22023'; end if;
    if (select round(sum((x->>'amount')::numeric),2) from jsonb_array_elements(v_payment_plan) x)<>v_original_amount then
      raise exception 'As formas de pagamento precisam totalizar o valor da conta.' using errcode='22023';
    end if;
  end if;

  if not v_is_new then
    select * into v_current from public.financial_entries e where e.id=v_entry_id and e.organization_id=p_organization_id for update;
    if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
    if v_current.entry_type<>v_entry_type then raise exception 'O tipo do lançamento não pode ser alterado.' using errcode='22023'; end if;
    if v_current.origin_type<>'manual'
       or v_current.approval_status not in ('draft','pending','rejected','approved')
       or exists(select 1 from public.financial_settlements s where s.financial_entry_id=v_entry_id and s.organization_id=p_organization_id)
       then raise exception 'Este lançamento não pode mais ser editado.' using errcode='22023'; end if;
    v_approval_cycle := v_current.approval_cycle + 1;
  end if;

  for v_item in select value from jsonb_array_elements(v_allocations) loop
    v_category_id := nullif(v_item->>'category_id','')::uuid;
    v_cost_center_id := nullif(v_item->>'cost_center_id','')::uuid;
    v_mode := lower(coalesce(v_item->>'mode','amount'));
    v_amount := round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_category_id is null or v_amount<=0 or v_mode not in ('amount','percentage') then raise exception 'Há rateio com dados inválidos.' using errcode='22023'; end if;
    if v_mode = 'percentage' then
      v_percentage := round(coalesce((v_item->>'value')::numeric, -1),4);
      if v_percentage < 0 or v_percentage > 100 then raise exception 'Percentual de rateio inválido.' using errcode='22023'; end if;
      v_expected_percentage_amount := round(v_original_amount * v_percentage / 100, 2);
      if v_expected_percentage_amount <> v_amount then raise exception 'O valor do rateio percentual não corresponde ao percentual informado.' using errcode='22023'; end if;
    end if;
    select * into v_category from public.financial_categories c where c.id=v_category_id and c.organization_id=p_organization_id and c.is_active=true;
    if not found then raise exception 'Categoria financeira inválida ou inativa.' using errcode='23503'; end if;
    if (v_entry_type='receivable' and v_category.nature<>'revenue') or (v_entry_type='payable' and v_category.nature<>'expense') then raise exception 'A natureza da categoria não corresponde ao tipo do lançamento.' using errcode='22023'; end if;
    if v_cost_center_id is not null then
      select * into v_cost_center from public.financial_cost_centers cc where cc.id=v_cost_center_id and cc.organization_id=p_organization_id and cc.is_active=true;
      if not found then raise exception 'Centro de custo inválido ou inativo.' using errcode='23503'; end if;
    end if;
  end loop;

  if v_is_new then
    insert into public.financial_entries(organization_id,entry_type,description,issue_date,competence_date,original_amount,approval_status,required_approvals,approval_cycle,counterpart_entity_id,counterpart_name_snapshot,counterpart_document_snapshot,origin_type,notes,source_details,created_by,updated_by,approved_at)
    values(p_organization_id,v_entry_type,v_description,v_issue_date,v_competence_date,v_original_amount,'approved',v_required_approvals,v_approval_cycle,v_counterpart_id,v_counterpart_name,v_counterpart_document,'manual',v_notes,jsonb_build_object('payment_plan',v_payment_plan),v_user_id,v_user_id,now()) returning id into v_entry_id;
  else
    update public.financial_entries set description=v_description,issue_date=v_issue_date,competence_date=v_competence_date,original_amount=v_original_amount,approval_status='approved',required_approvals=v_required_approvals,approval_cycle=v_approval_cycle,approved_at=now(),rejected_at=null,counterpart_entity_id=v_counterpart_id,counterpart_name_snapshot=v_counterpart_name,counterpart_document_snapshot=v_counterpart_document,notes=v_notes,source_details=jsonb_set(coalesce(source_details,'{}'::jsonb),'{payment_plan}',v_payment_plan),updated_by=v_user_id where id=v_entry_id and organization_id=p_organization_id;
    delete from public.financial_installments where organization_id=p_organization_id and financial_entry_id=v_entry_id;
    delete from public.financial_allocations where organization_id=p_organization_id and financial_entry_id=v_entry_id;
  end if;

  insert into public.financial_installments(organization_id,financial_entry_id,installment_number,total_installments,due_date,original_amount)
  select p_organization_id,v_entry_id,(x->>'installment_number')::integer,v_installment_count,(x->>'due_date')::date,round((x->>'amount')::numeric,2) from jsonb_array_elements(v_installments) x order by (x->>'installment_number')::integer;

  for v_item in select value from jsonb_array_elements(v_allocations) loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_cost_center_id := nullif(v_item->>'cost_center_id','')::uuid;
    v_mode := lower(coalesce(v_item->>'mode','amount'));
    v_amount := round((v_item->>'amount')::numeric,2);
    v_percentage := case when v_mode='percentage' then round(coalesce((v_item->>'value')::numeric,0),4) else round(v_amount*100/v_original_amount,4) end;
    select * into v_category from public.financial_categories c where c.id=v_category_id and c.organization_id=p_organization_id;
    if v_cost_center_id is not null then select * into v_cost_center from public.financial_cost_centers cc where cc.id=v_cost_center_id and cc.organization_id=p_organization_id; else v_cost_center.name:=null; end if;
    insert into public.financial_allocations(organization_id,financial_entry_id,category_id,category_name_snapshot,category_nature_snapshot,cost_center_id,cost_center_name_snapshot,allocation_mode,percentage,amount)
    values(p_organization_id,v_entry_id,v_category_id,v_category.name,v_category.nature,v_cost_center_id,case when v_cost_center_id is null then null else v_cost_center.name end,v_mode,v_percentage,v_amount);
  end loop;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_entry_id,case when v_is_new then 'created' else 'updated' end,jsonb_build_object('entry_type',v_entry_type,'original_amount',v_original_amount,'approval_status','approved','required_approvals',v_required_approvals,'approval_cycle',v_approval_cycle,'installments',v_installment_count),v_user_id);
  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,v_entry_id,'approved',jsonb_build_object('approval_status','pending','required_approvals',v_required_approvals,'approval_cycle',v_approval_cycle),v_user_id);
  return v_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_financial_entry_page_ids_v2(p_organization_id uuid, p_entry_type text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_search text DEFAULT ''::text, p_approval_status text DEFAULT 'all'::text, p_name text DEFAULT ''::text, p_document text DEFAULT ''::text, p_os text DEFAULT ''::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_operational_status text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      case
        when p_entry_type = 'receivable'
          then private.can_access_finance(p_organization_id, 'finance.receivables.view')
        when p_entry_type = 'payable'
          then private.can_access_finance(p_organization_id, 'finance.payables.view')
        else false
      end as can_view
  ),
  search_values as materialized (
    select lower(trim(coalesce(p_search, ''))) as needle
  ),
  filtered as (
    select
      entry.id,
      entry.issue_date,
      entry.created_at
    from public.financial_entries entry
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.can_view
      and entry.organization_id = p_organization_id
      and entry.entry_type = p_entry_type
      and (nullif(trim(coalesce(p_name,'')),'') is null or lower(coalesce(entry.counterpart_name_snapshot,'')) like '%' || lower(trim(p_name)) || '%')
      and (nullif(trim(coalesce(p_document,'')),'') is null or regexp_replace(coalesce(entry.counterpart_document_snapshot,''),'[^0-9]','','g') like '%' || regexp_replace(p_document,'[^0-9]','','g') || '%')
      and (nullif(trim(coalesce(p_os,'')),'') is null or (entry.origin_type='service_order'
        and (coalesce(entry.source_details->>'os_number','') ilike '%'||trim(p_os)||'%' or coalesce(entry.origin_reference,'') ilike '%'||trim(p_os)||'%')))
      and (p_date_from is null or exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.due_date >= p_date_from))
      and (p_date_to is null or exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.due_date <= p_date_to))
      and (coalesce(p_operational_status,'all')='all'
        or (p_operational_status='settled' and not exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.settled_amount<i.original_amount))
        or (p_operational_status='pending' and exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.settled_amount<i.original_amount))
      )
      and (
        coalesce(p_approval_status, 'all') = 'all'
        or entry.approval_status = p_approval_status
      )
      and (
        search.needle = ''
        or lower(coalesce(entry.description, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.counterpart_name_snapshot, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.counterpart_document_snapshot, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.origin_reference, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'os_number', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'inventory_item_name', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'inventory_item_sku', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'document_reference', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'purchase_reference', '')) like '%' || search.needle || '%'
        or lower(
          case
            when entry.origin_type = 'manual' then 'manual'
            when entry.origin_type = 'service_order'
              and nullif(trim(coalesce(entry.source_details->>'os_number', '')), '') is not null
              then 'os #' || (entry.source_details->>'os_number')
            when entry.origin_type = 'service_order' then 'ordem de serviço'
            when entry.origin_type = 'inventory_purchase' then 'compra de estoque'
            when entry.origin_type = 'recurring' then 'recorrência'
            else 'outra origem'
          end
        ) like '%' || search.needle || '%'
      )
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by ranked.issue_date desc, ranked.created_at desc, ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

REVOKE ALL ON FUNCTION public.search_financial_entry_page_ids_v2(uuid,text,integer,integer,text,text,text,text,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_financial_entry_page_ids_v2(uuid,text,integer,integer,text,text,text,text,text,date,date,text) TO authenticated;
-- Ao retirar a fila de aprovações, títulos pendentes antigos passam a ficar liberados para baixa.
UPDATE public.financial_entries SET approval_status='approved',required_approvals=1,approved_at=coalesce(approved_at,now())
WHERE approval_status IN ('pending','draft','rejected');
UPDATE public.financial_settings SET second_approval_threshold=NULL WHERE second_approval_threshold IS NOT NULL;
