-- Keep Union WhatsApp / PBX CRM lookups compatible with Brazilian mobile
-- numbers registered with or without the ninth digit. Match exact numbers
-- first; an ambiguous alias must never link to an arbitrary customer.
create or replace function public.union_whatsapp_find_customer_by_phone(
  p_organization uuid, p_phone text
)
returns table(customer_id uuid, customer_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with sought as (
    select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as digits
  ),
  target as (
    select case when length(digits) in (12,13) and left(digits,2)='55'
      then substring(digits from 3) else digits end as phone
    from sought
  ),
  variants as (
    -- The original number always takes precedence over a ninth-digit alias.
    select phone, 0 as preference
    from target where phone ~ '^[1-9][0-9][0-9]{8,9}$'
    union all
    -- 11-digit Brazilian mobile: remove only the 9 immediately after DDD.
    select left(phone,2) || substring(phone from 4), 1
    from target where phone ~ '^[1-9][0-9]9[6-9][0-9]{7}$'
    union all
    -- Older 10-digit mobile: insert the ninth digit immediately after DDD.
    select left(phone,2) || '9' || substring(phone from 3), 1
    from target where phone ~ '^[1-9][0-9][6-9][0-9]{7}$'
  ),
  cleaned as (
    select c.id, c.full_name,
      regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g') as wa,
      regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') as phone
    from public.customers c
    where c.organization_id = p_organization
  ),
  normalized as (
    select id, full_name,
      case when length(wa) in (12,13) and left(wa,2)='55'
        then substring(wa from 3) else wa end as wa,
      case when length(phone) in (12,13) and left(phone,2)='55'
        then substring(phone from 3) else phone end as phone
    from cleaned
  ),
  matches as (
    select n.id, n.full_name, min(v.preference) as preference
    from normalized n
    join variants v on n.wa = v.phone or n.phone = v.phone
    group by n.id, n.full_name
  )
  select m.id, coalesce(nullif(btrim(m.full_name),''),'Cliente')
  from matches m
  where m.preference = (select min(preference) from matches)
  order by m.id
  limit 2;
$$;
revoke all on function public.union_whatsapp_find_customer_by_phone(uuid,text) from public,anon,authenticated;
grant execute on function public.union_whatsapp_find_customer_by_phone(uuid,text) to service_role;
comment on function public.union_whatsapp_find_customer_by_phone(uuid,text) is
  'Private tenant-scoped CRM lookup. Match exact numbers first, then Brazilian mobile aliases with/without the ninth digit; return two matches on ambiguity.';
