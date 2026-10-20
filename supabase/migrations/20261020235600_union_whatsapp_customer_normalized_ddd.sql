create or replace function public.union_whatsapp_find_customer_by_phone(
  p_organization uuid, p_phone text
)
returns table(customer_id uuid, customer_name text)
language sql stable security definer
set search_path=pg_catalog,public
as $$
  with sought as (
    select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as digits
  ),
  cleaned as (
    select c.id, c.full_name,
      regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g') as wa,
      regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') as phone
    from public.customers c where c.organization_id=p_organization
  ),
  normalized as (
    select id,full_name,
      case when length(wa) in (12,13) and left(wa,2)='55'
        then substring(wa from 3) else wa end as wa,
      case when length(phone) in (12,13) and left(phone,2)='55'
        then substring(phone from 3) else phone end as phone
    from cleaned
  ),
  target as (
    select case when length(digits) in (12,13) and left(digits,2)='55'
      then substring(digits from 3) else digits end as phone
    from sought
  )
  select n.id,coalesce(nullif(btrim(n.full_name),''),'Cliente')
  from normalized n cross join target t
  where length(t.phone) in (10,11) and (n.wa=t.phone or n.phone=t.phone)
  order by n.id limit 2;
$$;