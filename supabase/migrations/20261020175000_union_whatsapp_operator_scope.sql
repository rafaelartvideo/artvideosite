-- Operators see unassigned waiting queue and their own assigned threads.
-- Managers with whatsapp.inbox.manage can see all company conversations.
-- Keep this policy for future assume/route/finish operations.
drop policy if exists union_whatsapp_conversations_read on public.union_whatsapp_conversations;
create policy union_whatsapp_conversations_read on public.union_whatsapp_conversations
for select to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view')
  and (
    private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.manage')
    or (status = 'waiting' and assigned_to is null)
    or assigned_to = (select auth.uid())
  )
);

drop policy if exists union_whatsapp_messages_read on public.union_whatsapp_messages;
create policy union_whatsapp_messages_read on public.union_whatsapp_messages
for select to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view')
  and exists (
    select 1 from public.union_whatsapp_conversations thread
    where thread.id = conversation_id
      and thread.organization_id = union_whatsapp_messages.organization_id
      and thread.channel_id = union_whatsapp_messages.channel_id
  )
);
