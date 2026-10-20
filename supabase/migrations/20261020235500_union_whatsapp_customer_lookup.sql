begin;
create or replace function public.union_whatsapp_find_customer_by_phone(
  p_organization uuid, p_phone text
)
returns table(customer_id uuid, customer_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select c.id, coalesce(nullif(btrim(c.full_name),''), 'Cliente')
  from public.customers c
  where c.organization_id=p_organization
    and length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) between 10 and 15
    and (
      right(regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g'),11) =
        right(regexp_replace(p_phone,'[^0-9]','','g'),11)
      or right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),11) =
        right(regexp_replace(p_phone,'[^0-9]','','g'),11)
    )
  order by c.id
  limit 2;
$$;
revoke all on function public.union_whatsapp_find_customer_by_phone(uuid,text) from public,anon,authenticated;
grant execute on function public.union_whatsapp_find_customer_by_phone(uuid,text) to service_role;
comment on function public.union_whatsapp_find_customer_by_phone(uuid,text) is
  'Private service-role lookup. Return at most two candidates to detect ambiguous matches without exposing the customer directory.';
commit;