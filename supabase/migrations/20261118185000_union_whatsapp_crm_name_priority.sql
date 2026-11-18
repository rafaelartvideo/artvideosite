begin;
-- Bounded, tenant-scoped read: exact Brazilian phone match first, ninth-digit
-- fallback second; ambiguous matches never select an arbitrary CRM customer.
create or replace function public.union_whatsapp_crm_names_batch(
  p_organization uuid, p_phones text[]
) returns table(phone_e164 text, crm_name text)
language sql stable security invoker
set search_path to 'pg_catalog','public'
as $fn$
with requested as (
  select distinct raw_phone as phone_e164, substring(raw_phone from 3) as national
  from unnest((p_phones)[1:100]) as raw_phone
  where raw_phone ~ '^55[1-9][0-9]{9,10}$'
),
variants as (
  select phone_e164,national,0 as priority from requested
  union all
  select phone_e164,left(national,2)||substring(national from 4),1
  from requested where national ~ '^[1-9][0-9]9[6-9][0-9]{7}$'
  union all
  select phone_e164,left(national,2)||'9'||substring(national from 3),1
  from requested where national ~ '^[1-9][0-9][6-9][0-9]{7}$'
),
normalized_customers as (
  select c.id,
    coalesce(nullif(btrim(c.full_name),''),nullif(btrim(c.trade_name),''),
      nullif(btrim(c.legal_name),''),'Cliente') as customer_name,
    case when length(raw.wa) in (12,13) and left(raw.wa,2)='55'
      then substring(raw.wa from 3) else raw.wa end as wa,
    case when length(raw.phone) in (12,13) and left(raw.phone,2)='55'
      then substring(raw.phone from 3) else raw.phone end as phone
  from public.customers c
  cross join lateral (select
    regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g') as wa,
    regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') as phone
  ) raw
  where c.organization_id=p_organization
),
matches as (
  select v.phone_e164,c.id,c.customer_name,min(v.priority) as priority
  from variants v
  join normalized_customers c on c.wa=v.national or c.phone=v.national
  group by v.phone_e164,c.id,c.customer_name
),
best as (
  select m.*,min(m.priority) over (partition by m.phone_e164) as best_priority
  from matches m
)
select b.phone_e164,max(b.customer_name) as crm_name
from best b
where b.priority=b.best_priority
group by b.phone_e164
having count(distinct b.id)=1;
$fn$;
revoke all on function public.union_whatsapp_crm_names_batch(uuid,text[])
  from public,anon,authenticated;
grant execute on function public.union_whatsapp_crm_names_batch(uuid,text[])
  to service_role;
commit;
