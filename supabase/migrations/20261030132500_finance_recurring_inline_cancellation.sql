begin;

-- Uma assinatura cancelada não pode voltar a gerar cobranças.
alter table public.financial_recurring_rules
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text;

-- Mantém compatibilidade com chamadas antigas de ativação, mas proíbe reativar uma assinatura cancelada.
create or replace function public.set_financial_recurring_rule_active(
  p_organization_id uuid, p_rule_id uuid, p_active boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_user_id uuid := auth.uid();
  v_cancelled_at timestamptz;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.recurring.manage') then
    raise exception 'Sem permissão para gerenciar recorrências.' using errcode='42501';
  end if;
  select cancelled_at into v_cancelled_at
  from public.financial_recurring_rules
  where organization_id=p_organization_id and id=p_rule_id for update;
  if not found then raise exception 'Recorrência financeira não encontrada.' using errcode='P0002'; end if;
  if p_active and v_cancelled_at is not null then
    raise exception 'A recorrência foi cancelada e não pode ser reativada.' using errcode='22023';
  end if;
  update public.financial_recurring_rules
  set is_active=coalesce(p_active,false),updated_by=v_user_id
  where organization_id=p_organization_id and id=p_rule_id;
  return coalesce(p_active,false);
end;
$$;

-- Operação atômica: desativa a assinatura e cancela apenas as contas futuras sem baixa.
create or replace function public.cancel_financial_recurring_rule(
  p_organization_id uuid,
  p_rule_id uuid,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user_id uuid := auth.uid();
  v_rule public.financial_recurring_rules%rowtype;
  v_at timestamptz := now();
  v_cancelled integer := 0;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.recurring.manage') then
    raise exception 'Sem permissão para cancelar recorrências.' using errcode='42501';
  end if;
  select * into v_rule
  from public.financial_recurring_rules
  where organization_id=p_organization_id and id=p_rule_id
  for update;
  if not found then raise exception 'Recorrência financeira não encontrada.' using errcode='P0002'; end if;
  if v_rule.cancelled_at is not null then
    return jsonb_build_object('cancelled',true,'cancelled_future_entries',0);
  end if;
  update public.financial_recurring_rules
  set is_active=false, cancelled_at=v_at, cancelled_by=v_user_id,
      cancellation_reason=nullif(left(btrim(coalesce(p_reason,'')),500),''),
      updated_by=v_user_id
  where organization_id=p_organization_id and id=p_rule_id;

  -- Preserva histórico de todas as competências e identifica a assinatura cancelada na UI.
  update public.financial_entries e
  set source_details=coalesce(e.source_details,'{}'::jsonb) ||
    jsonb_build_object('recurring_cancelled_at',v_at)
  where e.organization_id=p_organization_id
    and e.origin_type='recurring'
    and e.source_details->>'recurring_rule_id'=p_rule_id::text;

  -- A data da ocorrência (ISO YYYY-MM-DD), não a da última parcela, define o futuro.
  -- Não altera lançamentos com qualquer baixa registrada nem parcelas parcialmente pagas.
  with cancelled as (
    update public.financial_entries e
    set approval_status='cancelled', cancelled_at=v_at, updated_by=v_user_id
    where e.organization_id=p_organization_id
      and e.entry_type=v_rule.entry_type
      and e.origin_type='recurring'
      and e.source_details->>'recurring_rule_id'=p_rule_id::text
      and coalesce(e.source_details->>'occurrence_date','') >= current_date::text
      and e.approval_status not in ('cancelled','reversed')
      and not exists (
        select 1 from public.financial_settlements s
        where s.organization_id=p_organization_id and s.financial_entry_id=e.id
      )
      and not exists (
        select 1 from public.financial_installments i
        where i.organization_id=p_organization_id and i.financial_entry_id=e.id
          and coalesce(i.settled_amount,0) > 0
      )
    returning e.id
  ), audit as (
    insert into public.financial_events(
      organization_id,financial_entry_id,event_type,event_data,created_by
    )
    select p_organization_id,c.id,'recurring_cancelled',
      jsonb_build_object('recurring_rule_id',p_rule_id,'reason',left(btrim(coalesce(p_reason,'')),500)),v_user_id
    from cancelled c
    returning id
  )
  select count(*) into v_cancelled from cancelled;

  return jsonb_build_object('cancelled',true,'cancelled_future_entries',v_cancelled);
end;
$$;

revoke all on function public.cancel_financial_recurring_rule(uuid,uuid,text) from public,anon;
grant execute on function public.cancel_financial_recurring_rule(uuid,uuid,text) to authenticated;

-- Ao filtrar "pendentes", não mostrar como dívida o título já cancelado.
CREATE OR REPLACE FUNCTION public.search_financial_entry_page_ids_v4(p_organization_id uuid, p_entry_type text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_search text DEFAULT ''::text, p_approval_status text DEFAULT 'all'::text, p_name text DEFAULT ''::text, p_document text DEFAULT ''::text, p_os text DEFAULT ''::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_operational_status text DEFAULT 'all'::text, p_sort text DEFAULT 'newest'::text, p_created_by uuid DEFAULT NULL::uuid)
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
      and (p_created_by is null or entry.created_by = p_created_by)
      and (nullif(trim(coalesce(p_name,'')),'') is null or lower(coalesce(entry.counterpart_name_snapshot,'')) like '%' || lower(trim(p_name)) || '%')
      and (nullif(trim(coalesce(p_document,'')),'') is null or regexp_replace(coalesce(entry.counterpart_document_snapshot,''),'[^0-9]','','g') like '%' || regexp_replace(p_document,'[^0-9]','','g') || '%')
      and (nullif(trim(coalesce(p_os,'')),'') is null or (entry.origin_type='service_order'
        and (coalesce(entry.source_details->>'os_number','') ilike '%'||trim(p_os)||'%' or coalesce(entry.origin_reference,'') ilike '%'||trim(p_os)||'%')))
      and (p_date_from is null or exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.due_date >= p_date_from))
      and (p_date_to is null or exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.due_date <= p_date_to))
      and (coalesce(p_operational_status,'all')='all' or entry.approval_status not in ('cancelled','reversed'))
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
  order by
    case when p_sort = 'oldest' then ranked.issue_date end asc nulls last,
    case when p_sort = 'oldest' then ranked.created_at end asc nulls last,
    case when p_sort <> 'oldest' then ranked.issue_date end desc nulls last,
    case when p_sort <> 'oldest' then ranked.created_at end desc nulls last,
    ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

commit;
