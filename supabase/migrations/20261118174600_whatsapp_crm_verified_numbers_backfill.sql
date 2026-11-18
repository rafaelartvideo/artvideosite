begin;

-- Recover successful, previously provider-confirmed numbers from the existing
-- organization-scoped WuzAPI cache. Never import inconclusive/not-registered
-- entries, ambiguous aliases or arbitrary contact data.
insert into public.union_whatsapp_crm_number_verifications (
  organization_id, phone_e164, provider_phone_e164, verified_at
)
select distinct on (c.organization_id,c.requested_phone)
  c.organization_id,
  c.requested_phone,
  coalesce(
    (select m->>'phone'
       from jsonb_array_elements(c.provider_result->'matches') m
      where m->>'query'=c.requested_phone
        and (m->>'phone') ~ '^55[1-9][0-9]{9,10}$'
      limit 1),
    (select m->>'phone'
       from jsonb_array_elements(c.provider_result->'matches') m
      where (m->>'phone') ~ '^55[1-9][0-9]{9,10}$'
      limit 1),
    c.requested_phone
  ),
  c.checked_at
from public.union_whatsapp_number_check_cache c
where c.provider_result->>'status'='verified'
  and c.requested_phone ~ '^55[1-9][0-9]{9,10}$'
  and jsonb_typeof(c.provider_result->'matches')='array'
  and exists (
    select 1 from jsonb_array_elements(c.provider_result->'matches') m
    where (m->>'phone') ~ '^55[1-9][0-9]{9,10}$'
      and ((m->>'jid') ~ '^([0-9]{5,20}@lid|55[1-9][0-9]{9,10}@s\.whatsapp\.net)$')
      and (c.provider_result->>'distinct_identities' is distinct from 'true'
        or m->>'query'=c.requested_phone)
  )
order by c.organization_id,c.requested_phone,c.checked_at desc
on conflict (organization_id,phone_e164) do nothing;

commit;
