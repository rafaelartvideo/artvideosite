-- Active number checks must NOT depend on the operator's settings.channels.view permission.
-- Use an authenticated, read-only private security definer predicate instead.
create or replace function private.union_whatsapp_active_account_visible(
  p_organization uuid,p_channel uuid,p_account text
) returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public','private'
as $account$
  select private.has_effective_organization_permission(p_organization,'whatsapp.inbox.view')
     and exists(
       select 1 from public.whatsapp_channel_connections c
       where c.id=p_channel and c.organization_id=p_organization
         and c.phone=p_account and c.state='connected' and c.webhook_ready
     );
$account$;

revoke all on function private.union_whatsapp_active_account_visible(uuid,uuid,text)
 from public,anon;
grant execute on function private.union_whatsapp_active_account_visible(uuid,uuid,text)
 to authenticated;

alter policy union_whatsapp_conversations_read on public.union_whatsapp_conversations
using ((private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view'::text) AND (private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.manage'::text) OR ((EXISTS ( SELECT 1
   FROM union_whatsapp_operator_bindings binding
  WHERE ((binding.organization_id = union_whatsapp_conversations.organization_id) AND (binding.user_id = ( SELECT auth.uid() AS uid)) AND (binding.is_active = true)))) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR ((status = 'waiting'::text) AND (assigned_to IS NULL) AND ((department_id IS NULL) OR (EXISTS ( SELECT 1
   FROM union_whatsapp_department_members dept
  WHERE ((dept.organization_id = union_whatsapp_conversations.organization_id) AND (dept.department_id = union_whatsapp_conversations.department_id) AND (dept.user_id = ( SELECT auth.uid() AS uid)))))))))) AND private.union_whatsapp_active_account_visible(union_whatsapp_conversations.organization_id,union_whatsapp_conversations.channel_id,union_whatsapp_conversations.account_phone)));

alter policy union_whatsapp_messages_read on public.union_whatsapp_messages
using ((private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view'::text) AND (EXISTS ( SELECT 1
   FROM union_whatsapp_conversations thread
  WHERE ((thread.id = union_whatsapp_messages.conversation_id) AND (thread.organization_id = union_whatsapp_messages.organization_id) AND (thread.channel_id = union_whatsapp_messages.channel_id)))) AND private.union_whatsapp_active_account_visible(union_whatsapp_messages.organization_id,union_whatsapp_messages.channel_id,union_whatsapp_messages.account_phone)));
