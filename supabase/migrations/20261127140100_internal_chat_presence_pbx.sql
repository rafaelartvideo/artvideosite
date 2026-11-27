begin;
-- Presence contains only self-reported availability, never message contents.
create policy internal_chat_presence_read on realtime.messages for select to authenticated
using (extension='presence' and exists (
 select 1 from public.organization_members m
 where m.user_id=(select auth.uid()) and m.status='active'
 and realtime.topic()='internal-chat-presence:'||m.organization_id::text
 and private.internal_chat_allowed(m.organization_id,'internal_chat.use')
));
create policy internal_chat_presence_write on realtime.messages for insert to authenticated
with check (extension='presence' and exists (
 select 1 from public.organization_members m
 where m.user_id=(select auth.uid()) and m.status='active'
 and realtime.topic()='internal-chat-presence:'||m.organization_id::text
 and private.internal_chat_allowed(m.organization_id,'internal_chat.use')
));
-- Resolve only the active employee's assigned, enabled internal extension.
create function private.internal_chat_extension(p_org uuid,p_peer uuid)
returns integer language sql stable security definer set search_path='' as $$
 select ext.number from public.pbx_extensions ext
 join public.employees e on e.id=ext.employee_id and e.organization_id=ext.organization_id
 join public.organization_members m on m.organization_id=e.organization_id and m.user_id=e.profile_id
 where ext.organization_id=p_org and e.profile_id=p_peer and e.is_active and m.status='active'
 and ext.desired_enabled and ext.is_managed and ext.provisioning_status='applied'
 and private.internal_chat_allowed(p_org,'internal_chat.use')
 and private.has_effective_organization_permission(p_org,'pbx.view')
 limit 1;
$$;
revoke all on function private.internal_chat_extension(uuid,uuid) from public,anon;
grant execute on function private.internal_chat_extension(uuid,uuid) to authenticated;
create function public.internal_chat_extension_v1(p_org uuid,p_peer uuid)
returns integer language sql stable security invoker set search_path='' as $$
 select private.internal_chat_extension(p_org,p_peer);
$$;
revoke all on function public.internal_chat_extension_v1(uuid,uuid) from public,anon;
grant execute on function public.internal_chat_extension_v1(uuid,uuid) to authenticated;
commit;
