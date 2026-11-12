-- Independent PABX phonebook: these contacts do not need WhatsApp and are not created as CRM customers.
create table if not exists public.pbx_contacts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 phone text not null,
 phone_key text generated always as (public.customer_whatsapp_canonical_v1(phone)) stored,
 display_name text not null,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint pbx_contacts_valid_phone check (phone_key is not null),
 constraint pbx_contacts_valid_name check (char_length(btrim(display_name)) between 2 and 160),
 constraint pbx_contacts_valid_notes check (notes is null or char_length(notes)<=500),
 unique (organization_id,phone_key)
);
create index if not exists pbx_contacts_recent_idx on public.pbx_contacts(organization_id,updated_at desc);
alter table public.pbx_contacts enable row level security;
create policy pbx_contacts_read on public.pbx_contacts for select to authenticated
 using (private.pbx_has_permission(organization_id,'pbx.view'));
create policy pbx_contacts_insert on public.pbx_contacts for insert to authenticated
 with check (private.pbx_has_permission(organization_id,'pbx.view'));
create policy pbx_contacts_update on public.pbx_contacts for update to authenticated
 using (private.pbx_has_permission(organization_id,'pbx.view'))
 with check (private.pbx_has_permission(organization_id,'pbx.view'));
grant select,insert,update on public.pbx_contacts to authenticated;

-- Service-only lookup with deterministic display priority CRM > PABX > WhatsApp.
create or replace function public.pbx_resolve_cached_contacts_v2(p_organization_id uuid,p_numbers text[])
returns table(number text,display_name text,source text,avatar_path text)
language sql stable security invoker set search_path=''
as $$
with input as (
 select distinct left(btrim(raw),32) as number,
  public.customer_whatsapp_canonical_v1(raw) as canonical
 from unnest(p_numbers) as raw
 where cardinality(p_numbers) between 1 and 12
  and char_length(raw) between 10 and 32
  and public.customer_whatsapp_canonical_v1(raw) is not null
)
select input.number,
  coalesce(nullif(btrim(customer.full_name),''),
           nullif(btrim(pbx.display_name),''),
           nullif(btrim(whatsapp.display_name),''),
           nullif(btrim(whatsapp.device_name),''),
           nullif(btrim(whatsapp.imported_name),''),
           nullif(btrim(whatsapp.profile_name),'')) as display_name,
  case when customer.id is not null then 'crm'
       when pbx.id is not null then 'pbx'
       when whatsapp.id is not null then 'whatsapp' else null end as source,
  avatar.storage_path
from input
left join lateral (
 select c.id,c.full_name from public.customers c
 where c.organization_id=p_organization_id
  and (public.customer_whatsapp_canonical_v1(c.whatsapp)=input.canonical
       or public.customer_whatsapp_canonical_v1(c.phone)=input.canonical)
 order by c.updated_at desc nulls last limit 1
) customer on true
left join lateral (
 select c.id,c.display_name from public.pbx_contacts c
 where c.organization_id=p_organization_id and c.phone_key=input.canonical
 limit 1
) pbx on true
left join lateral (
 select c.id,c.channel_id,c.account_phone,c.chat_jid,
  c.display_name,c.device_name,c.imported_name,c.profile_name
 from public.union_whatsapp_contacts c
 where c.organization_id=p_organization_id
  and public.customer_whatsapp_canonical_v1(c.contact_phone)=input.canonical
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
revoke all on function public.pbx_resolve_cached_contacts_v2(uuid,text[]) from public,anon,authenticated;
grant execute on function public.pbx_resolve_cached_contacts_v2(uuid,text[]) to service_role;
