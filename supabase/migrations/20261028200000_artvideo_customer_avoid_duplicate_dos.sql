-- Unconfirmed duplicate CPF submissions must not lock legitimate verified users.
begin;
create or replace function private.artvideo_verified_portal_customer_v1()
returns uuid language sql stable security definer set search_path=''
as $$
  select a.entity_id
  from public.artvideo_customer_accounts a
  join public.customers c on c.id=a.entity_id and c.organization_id=a.organization_id
  join public.entities e on e.id=c.id and e.organization_id=c.organization_id
  where a.user_id=(select auth.uid())
    and a.organization_id=public.artvideo_organization_id()
    and a.entity_id is not null
    and a.link_status in ('matched','created','approved')
    and a.whatsapp_verified_at is not null
    and a.whatsapp_verified_number is not null
    and a.whatsapp_verified_number=case
      when regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') like '55%'
      then regexp_replace(coalesce(a.phone,''),'[^0-9]','','g')
      else '55'||regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') end
    and length(regexp_replace(coalesce(a.cpf,''),'[^0-9]','','g'))=11
    and regexp_replace(coalesce(c.document,''),'[^0-9]','','g')=a.cpf
    and public.artvideo_first_name_key_v1(a.full_name)=public.artvideo_first_name_key_v1(c.full_name)
    and e.is_active and c.customer_type='PF'
    and exists(select 1 from public.entity_roles er
      where er.entity_id=e.id and er.role='customer' and er.is_active)
    and not exists(select 1 from public.artvideo_customer_accounts duplicate
      where duplicate.organization_id=a.organization_id
        and duplicate.user_id<>a.user_id
        and duplicate.entity_id=a.entity_id
        and duplicate.link_status in ('matched','created','approved'))
  limit 1
$$;
revoke all on function private.artvideo_verified_portal_customer_v1() from public,anon;
grant execute on function private.artvideo_verified_portal_customer_v1() to authenticated;
commit;
