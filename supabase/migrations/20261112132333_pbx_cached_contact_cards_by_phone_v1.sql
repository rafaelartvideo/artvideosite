-- Lookup exclusively from cached CRM / WhatsApp data, never from WuzAPI.
-- This RPC is service-role only; the Edge endpoint authenticates and authorizes pbx.view.
create index if not exists customers_phone_canonical_pbx_idx
  on public.customers (organization_id, public.customer_whatsapp_canonical_v1(phone))
  where phone is not null;

create index if not exists union_whatsapp_contact_phone_canonical_pbx_idx
  on public.union_whatsapp_contacts
  (organization_id, public.customer_whatsapp_canonical_v1(contact_phone))
  where contact_phone is not null;

create or replace function public.pbx_resolve_cached_contacts_v1(
  p_organization_id uuid, p_numbers text[]
) returns table (number text, display_name text, avatar_path text)
language sql stable security invoker set search_path = ''
as $$
  with input as (
    select distinct left(btrim(raw),32) as number,
      public.customer_whatsapp_canonical_v1(raw) as canonical
    from unnest(p_numbers) as raw
    where cardinality(p_numbers) between 1 and 12
      and length(raw) between 10 and 32
      and public.customer_whatsapp_canonical_v1(raw) is not null
  )
  select input.number,
    coalesce(nullif(btrim(customer.full_name),''),
             nullif(btrim(whatsapp.display_name),''),
             nullif(btrim(whatsapp.device_name),''),
             nullif(btrim(whatsapp.imported_name),''),
             nullif(btrim(whatsapp.profile_name),'')) as display_name,
    avatar.storage_path
  from input
  left join lateral (
    select c.full_name from public.customers c
    where c.organization_id = p_organization_id
      and (public.customer_whatsapp_canonical_v1(c.whatsapp) = input.canonical
        or public.customer_whatsapp_canonical_v1(c.phone) = input.canonical)
    order by c.updated_at desc nulls last limit 1
  ) customer on true
  left join lateral (
    select c.channel_id,c.account_phone,c.chat_jid,c.display_name,c.device_name,c.imported_name,c.profile_name
    from public.union_whatsapp_contacts c
    where c.organization_id = p_organization_id
      and public.customer_whatsapp_canonical_v1(c.contact_phone) = input.canonical
    order by c.updated_at desc limit 1
  ) whatsapp on true
  left join lateral (
    select a.storage_path from public.union_whatsapp_avatar_cache a
    where a.organization_id=p_organization_id and a.channel_id=whatsapp.channel_id
      and a.account_phone=whatsapp.account_phone and a.chat_jid=whatsapp.chat_jid
      and a.storage_path like p_organization_id::text || '/' || whatsapp.channel_id::text || '/avatars/%'
    limit 1
  ) avatar on true;
$$;

revoke all on function public.pbx_resolve_cached_contacts_v1(uuid,text[]) from public, anon, authenticated;
grant execute on function public.pbx_resolve_cached_contacts_v1(uuid,text[]) to service_role;
