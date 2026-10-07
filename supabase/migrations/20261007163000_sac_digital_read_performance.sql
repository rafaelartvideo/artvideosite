begin;
-- Preserve exactly the existing organization permission predicate, evaluated
-- once per organization per statement, instead of once for every joined row.
create or replace function private.sac_digital_readable_organizations()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(o.id), array[]::uuid[])
  from public.organizations o
  where private.has_effective_organization_permission(o.id,'sac_digital.messages.view');
$$;
revoke all on function private.sac_digital_readable_organizations() from public,anon;
grant execute on function private.sac_digital_readable_organizations() to authenticated;
alter policy sac_digital_contacts_select on public.sac_digital_contacts
using (organization_id = any ((select private.sac_digital_readable_organizations())::uuid[]));
alter policy sac_digital_protocols_select on public.sac_digital_protocols
using (organization_id = any ((select private.sac_digital_readable_organizations())::uuid[]));
alter policy sac_digital_messages_select on public.sac_digital_messages
using (organization_id = any ((select private.sac_digital_readable_organizations())::uuid[]));
alter policy sac_digital_outbound_starts_select on public.sac_digital_outbound_starts
using (organization_id = any ((select private.sac_digital_readable_organizations())::uuid[]));
-- Support organization-scoped unread scans without walking unrelated history.
create index if not exists sac_digital_messages_org_incoming_date_idx
on public.sac_digital_messages (organization_id, sent_at desc, protocol_id)
where direction='incoming';
commit;
