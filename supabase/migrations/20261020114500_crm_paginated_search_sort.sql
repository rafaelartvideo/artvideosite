-- Ordenação global reutilizada pelas barras de busca do CRM.
-- As autorizações internas de cada consulta foram preservadas.

create or replace function public.get_pdv_sales_page_v2(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default '',
  p_status text default null,
  p_sort text default 'newest'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_page integer := greatest(1,coalesce(p_page,1));
  v_page_size integer := least(100,greatest(5,coalesce(p_page_size,20)));
  v_search text := btrim(coalesce(p_search,''));
  v_status text := nullif(lower(btrim(coalesce(p_status,''))),'');
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.view') then
    raise exception 'Sem permissão para acessar as vendas do PDV.' using errcode='42501';
  end if;
  if v_status is not null and v_status not in ('completed','cancelled') then
    raise exception 'Status de venda inválido.' using errcode='22023';
  end if;

  select count(*) into v_total
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id
    and (v_status is null or sale.status=v_status)
    and (
      v_search=''
      or sale.sale_number::text ilike '%'||v_search||'%'
      or coalesce(sale.customer_name_snapshot,'') ilike '%'||v_search||'%'
      or coalesce(sale.customer_document_snapshot,'') ilike '%'||v_search||'%'
    );

  select coalesce(jsonb_agg(row_data order by (case when p_sort='oldest' then sold_at end) asc nulls last, (case when p_sort <> 'oldest' then sold_at end) desc nulls last),'[]'::jsonb)
    into v_items
  from (
    select
      jsonb_build_object(
        'id',sale.id,
        'sale_number',sale.sale_number,
        'status',sale.status,
        'customer_name',sale.customer_name_snapshot,
        'customer_document',sale.customer_document_snapshot,
        'total_amount',sale.total_amount,
        'change_amount',sale.change_amount,
        'sold_at',sale.sold_at,
        'sold_by_name',seller.full_name,
        'cancelled_at',sale.cancelled_at,
        'cancelled_by_name',canceller.full_name,
        'cancellation_reason',sale.cancellation_reason,
        'payment_methods',coalesce((
          select jsonb_agg(distinct payment.payment_method_name_snapshot)
          from public.pdv_sale_payments payment
          where payment.organization_id=sale.organization_id
            and payment.sale_id=sale.id
        ),'[]'::jsonb)
      ) as row_data,
      sale.sold_at
    from public.pdv_sales sale
    left join public.profiles seller on seller.id=sale.sold_by
    left join public.profiles canceller on canceller.id=sale.cancelled_by
    where sale.organization_id=p_organization_id
      and (v_status is null or sale.status=v_status)
      and (
        v_search=''
        or sale.sale_number::text ilike '%'||v_search||'%'
        or coalesce(sale.customer_name_snapshot,'') ilike '%'||v_search||'%'
        or coalesce(sale.customer_document_snapshot,'') ilike '%'||v_search||'%'
      )
    order by (case when p_sort='oldest' then sale.sold_at end) asc nulls last, (case when p_sort <> 'oldest' then sale.sold_at end) desc nulls last, sale.id
    offset (v_page-1)*v_page_size
    limit v_page_size
  ) rows_page;

  return jsonb_build_object(
    'items',v_items,
    'total_count',v_total,
    'page',v_page,
    'page_size',v_page_size,
    'total_pages',greatest(1,ceil(v_total::numeric/v_page_size)::integer)
  );
end;
$$;
revoke all on function public.get_pdv_sales_page_v2(uuid,integer,integer,text,text,text) from public,anon;
grant execute on function public.get_pdv_sales_page_v2(uuid,integer,integer,text,text,text) to authenticated;

create or replace function public.list_sac_digital_contacts_search_v2(
  p_organization_id uuid, p_search text default '', p_page integer default 1, p_page_size integer default 10, p_sort text default 'newest'
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_search text := btrim(coalesce(p_search,''));
  v_like text;
  v_digits text;
  v_page integer := greatest(coalesce(p_page,1),1);
  v_size integer := least(greatest(coalesce(p_page_size,10),5),100);
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Empresa não informada.' using errcode='22023';
  end if;
  v_like := '%' || v_search || '%';
  v_digits := regexp_replace(v_search,'[^0-9]','','g');

  select count(*) into v_total
  from public.sac_digital_contacts c
  left join public.customers customer
    on customer.id=c.customer_id and customer.organization_id=c.organization_id
  where c.organization_id=p_organization_id
    and (v_search='' or c.name ilike v_like or c.phone ilike v_like or c.external_contact_id ilike v_like
      or customer.full_name ilike v_like or customer.trade_name ilike v_like or customer.document ilike v_like or customer.cnpj ilike v_like
      or (v_digits<>'' and (
        regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||v_digits||'%'
        or regexp_replace(coalesce(customer.document,''),'[^0-9]','','g') like '%'||v_digits||'%'
        or regexp_replace(coalesce(customer.cnpj,''),'[^0-9]','','g') like '%'||v_digits||'%')));

  select coalesce(jsonb_agg(to_jsonb(item) order by (case when p_sort='oldest' then item.updated_at end) asc nulls last,(case when p_sort<>'oldest' then item.updated_at end) desc nulls last,item.id desc),'[]'::jsonb)
    into v_items
  from (
    select c.id,c.external_contact_id,c.customer_id,c.name,c.phone,c.avatar_url,c.updated_at,
      customer.full_name as customer_name, customer.document as cpf,customer.cnpj
    from public.sac_digital_contacts c
    left join public.customers customer
      on customer.id=c.customer_id and customer.organization_id=c.organization_id
    where c.organization_id=p_organization_id
      and (v_search='' or c.name ilike v_like or c.phone ilike v_like or c.external_contact_id ilike v_like
        or customer.full_name ilike v_like or customer.trade_name ilike v_like or customer.document ilike v_like or customer.cnpj ilike v_like
        or (v_digits<>'' and (
          regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||v_digits||'%'
          or regexp_replace(coalesce(customer.document,''),'[^0-9]','','g') like '%'||v_digits||'%'
          or regexp_replace(coalesce(customer.cnpj,''),'[^0-9]','','g') like '%'||v_digits||'%')))
    order by (case when p_sort='oldest' then c.updated_at end) asc nulls last,(case when p_sort<>'oldest' then c.updated_at end) desc nulls last,c.id desc
    limit v_size offset (v_page-1)*v_size
  ) item;

  return jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'page_size',v_size);
end;
$$;
revoke all on function public.list_sac_digital_contacts_search_v2(uuid,text,integer,integer,text) from public,anon;
grant execute on function public.list_sac_digital_contacts_search_v2(uuid,text,integer,integer,text) to authenticated;

create or replace function public.search_organization_audit_log_page_v2(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_actor_user_id uuid default null,
  p_module_key text default '',
  p_operation text default '',
  p_context_id text default '',
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sort text default 'newest'
)
returns table(
  id bigint,
  organization_id uuid,
  actor_user_id uuid,
  actor_name_snapshot text,
  action text,
  operation text,
  entity_type text,
  entity_id text,
  table_name text,
  module_key text,
  context_type text,
  context_id text,
  source text,
  created_at timestamptz,
  changed_field_count integer,
  first_changed_field text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      (
        private.has_organization_permission(
          p_organization_id,
          'organizations.audit.view'
        )
        or private.can_manage_organization(
          p_organization_id,
          'organizations.audit.view'
        )
      ) as can_view
  ),
  filtered as (
    select
      audit_log.id,
      audit_log.organization_id,
      audit_log.actor_user_id,
      audit_log.actor_name_snapshot,
      audit_log.action,
      audit_log.operation,
      audit_log.entity_type,
      audit_log.entity_id,
      audit_log.table_name,
      audit_log.module_key,
      audit_log.context_type,
      audit_log.context_id,
      audit_log.source,
      audit_log.created_at,
      case
        when audit_log.operation = 'update'
          and jsonb_typeof(coalesce(audit_log.changed_fields, '{}'::jsonb)) = 'object'
        then (
          select count(*)::integer
          from jsonb_object_keys(coalesce(audit_log.changed_fields, '{}'::jsonb))
        )
        else 0
      end as changed_field_count,
      case
        when audit_log.operation = 'update'
          and jsonb_typeof(coalesce(audit_log.changed_fields, '{}'::jsonb)) = 'object'
        then (
          select key
          from jsonb_object_keys(coalesce(audit_log.changed_fields, '{}'::jsonb)) as key
          limit 1
        )
        else null
      end as first_changed_field
    from public.organization_audit_logs audit_log
    cross join access_context access
    where access.user_id is not null
      and access.can_view
      and audit_log.organization_id = p_organization_id
      and (p_actor_user_id is null or audit_log.actor_user_id = p_actor_user_id)
      and (coalesce(p_module_key, '') = '' or audit_log.module_key = p_module_key)
      and (coalesce(p_operation, '') = '' or audit_log.operation = p_operation)
      and (
        coalesce(trim(p_context_id), '') = ''
        or audit_log.context_id = trim(p_context_id)
        or audit_log.entity_id = trim(p_context_id)
      )
      and (p_date_from is null or audit_log.created_at >= p_date_from)
      and (p_date_to is null or audit_log.created_at <= p_date_to)
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select
    ranked.id,
    ranked.organization_id,
    ranked.actor_user_id,
    ranked.actor_name_snapshot,
    ranked.action,
    ranked.operation,
    ranked.entity_type,
    ranked.entity_id,
    ranked.table_name,
    ranked.module_key,
    ranked.context_type,
    ranked.context_id,
    ranked.source,
    ranked.created_at,
    ranked.changed_field_count,
    ranked.first_changed_field,
    ranked.total_count
  from ranked
  order by (case when p_sort='oldest' then ranked.created_at end) asc nulls last,
    (case when p_sort<>'oldest' then ranked.created_at end) desc nulls last,
    ranked.id desc
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;
revoke all on function public.search_organization_audit_log_page_v2(uuid,integer,integer,uuid,text,text,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.search_organization_audit_log_page_v2(uuid,integer,integer,uuid,text,text,text,timestamptz,timestamptz,text) to authenticated;
