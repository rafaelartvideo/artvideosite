-- Paginação e ordenação global das contas a receber/pagar.
-- Preserva o acesso por empresa e as verificações originais de permissão.
CREATE OR REPLACE FUNCTION public.search_financial_entry_page_ids_v3(p_organization_id uuid, p_entry_type text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_search text DEFAULT ''::text, p_approval_status text DEFAULT 'all'::text, p_name text DEFAULT ''::text, p_document text DEFAULT ''::text, p_os text DEFAULT ''::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_operational_status text DEFAULT 'all'::text, p_sort text DEFAULT 'newest'::text)
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
  order by
    case when p_sort = 'oldest' then ranked.issue_date end asc nulls last,
    case when p_sort = 'oldest' then ranked.created_at end asc nulls last,
    case when p_sort <> 'oldest' then ranked.issue_date end desc nulls last,
    case when p_sort <> 'oldest' then ranked.created_at end desc nulls last,
    ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

REVOKE ALL ON FUNCTION public.search_financial_entry_page_ids_v3(uuid,text,integer,integer,text,text,text,text,text,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_financial_entry_page_ids_v3(uuid,text,integer,integer,text,text,text,text,text,date,date,text,text) TO authenticated;
