-- Match Intl.Collator("pt-BR", { sensitivity: "base", numeric: true }).
-- Nondeterministic comparison deliberately treats case/accent variants as ties;
-- UUID provides a stable tie-break where the previous API order was unspecified.
create collation public.customers_pt_br_natural_base (
  provider = icu,
  locale = 'pt-BR-u-kn-true-ks-level1',
  deterministic = false
);

-- BEGIN NATIVE ICU GUARD
-- Apply this migration atomically. Fail before exposing the RPC if the server
-- cannot preserve numeric/base sorting and accent-sensitive literal filtering.
-- Constants only: this guard never reads customer or other production rows.
do $guard$
begin
  if not ('Empresa 2' collate public.customers_pt_br_natural_base < 'Empresa 10')
    or not ('Álvaro' collate public.customers_pt_br_natural_base = 'alvaro')
    or strpos(lower('João' collate pg_catalog."pt-BR-x-icu") collate "C", 'joao') <> 0
  then
    raise exception 'Customer pagination requires native Portuguese ICU numeric/base sorting and accent-sensitive filtering';
  end if;
end;
$guard$;
-- END NATIVE ICU GUARD

create or replace function public.list_exact_customers_page(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_name_search text default '',
  p_document_search text default '',
  p_states text[] default '{}',
  p_cities text[] default '{}',
  p_sort text default ''
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with settings as (
    select
      -- ECMAScript String.trim whitespace, including NBSP and BOM.
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' as whitespace,
      greatest(1, coalesce(p_page, 1))::bigint as page,
      least(100, greatest(1, coalesce(p_page_size, 20))) as size
  ), filters as (
    select settings.*,
      lower(btrim(coalesce(p_name_search, ''), whitespace) collate pg_catalog."pt-BR-x-icu") collate "C" as name_needle,
      regexp_replace(coalesce(p_document_search, '') collate "C", '[^0-9]', '', 'g') as document_needle
    from settings
  ), filtered as materialized (
    select customer.id,
      coalesce(nullif(customer.trade_name, ''), nullif(customer.full_name, ''), customer.legal_name, '') as sort_name
    from public.customers customer
    cross join filters
    where customer.organization_id = p_organization_id
      and (name_needle = '' or exists (
        select 1 from unnest(array[customer.full_name, customer.trade_name, customer.legal_name]) as names(value)
        where strpos(lower(btrim(coalesce(value, ''), whitespace) collate pg_catalog."pt-BR-x-icu") collate "C", name_needle) > 0
      ))
      and (document_needle = '' or exists (
        select 1 from unnest(array[customer.document, customer.cnpj]) as documents(value)
        where strpos(regexp_replace(coalesce(value, '') collate "C", '[^0-9]', '', 'g'), document_needle) > 0
      ))
      -- Separate EXISTS preserve matches across different customer addresses.
      and (coalesce(cardinality(p_states), 0) = 0 or exists (
        select 1 from public.customer_addresses address
        where address.customer_id = customer.id
          and address.organization_id = p_organization_id
          and upper(btrim(coalesce(address.state, ''), whitespace)) collate "C" = any(p_states)
      ))
      and (coalesce(cardinality(p_cities), 0) = 0 or exists (
        select 1 from public.customer_addresses address
        where address.customer_id = customer.id
          and address.organization_id = p_organization_id
          and (upper(btrim(coalesce(address.state, ''), whitespace)) || ':' || lower(btrim(coalesce(address.city, ''), whitespace) collate pg_catalog."pt-BR-x-icu")) collate "C" = any(p_cities)
      ))
  ), page as (
    select id, sort_name
    from filtered
    order by
      case when p_sort = 'desc' then sort_name end collate public.customers_pt_br_natural_base desc,
      case when p_sort is distinct from 'desc' then sort_name end collate public.customers_pt_br_natural_base asc,
      id asc
    limit (select size from filters)
    offset (select (page - 1) * size from filters)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'ids', coalesce((select jsonb_agg(id order by
      case when p_sort = 'desc' then sort_name end collate public.customers_pt_br_natural_base desc,
      case when p_sort is distinct from 'desc' then sort_name end collate public.customers_pt_br_natural_base asc,
      id asc) from page), '[]'::jsonb)
  );
$function$;

revoke all on function public.list_exact_customers_page(uuid, integer, integer, text, text, text[], text[], text) from public, anon;
grant execute on function public.list_exact_customers_page(uuid, integer, integer, text, text, text[], text[], text) to authenticated;
comment on function public.list_exact_customers_page(uuid, integer, integer, text, text, text[], text[], text) is
  'RLS-preserving exact customer filters, natural Portuguese ordering and bounded page IDs. Filter arrays are normalized by the customer repository.';
