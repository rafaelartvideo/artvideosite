-- Manual rollback only. Restores the exact pre-migration SELECT policies.
alter policy union_whatsapp_conversations_read on public.union_whatsapp_conversations using (((private.union_whatsapp_active_account_visible(organization_id, channel_id, account_phone) AND (private.union_whatsapp_allowed(organization_id, 'view_all'::text) OR ((assigned_to = ( SELECT auth.uid() AS uid)) AND private.union_whatsapp_allowed(organization_id, 'view_assigned'::text)) OR ((status = 'waiting'::text) AND (assigned_to IS NULL) AND private.union_whatsapp_allowed(organization_id, 'view_queues'::text) AND ((forwarded_at IS NULL) OR (forwarded_by IS DISTINCT FROM ( SELECT auth.uid() AS uid))) AND ((department_id IS NULL) OR (EXISTS ( SELECT 1
   FROM union_whatsapp_department_members member
  WHERE ((member.organization_id = union_whatsapp_conversations.organization_id) AND (member.department_id = union_whatsapp_conversations.department_id) AND (member.user_id = ( SELECT auth.uid() AS uid))))))))) OR (private.union_whatsapp_active_account_visible(organization_id, channel_id, account_phone) AND (EXISTS ( SELECT 1
   FROM union_whatsapp_conversation_participants participant
  WHERE ((participant.organization_id = union_whatsapp_conversations.organization_id) AND (participant.conversation_id = union_whatsapp_conversations.id) AND (participant.user_id = ( SELECT auth.uid() AS uid)) AND (participant.status = 'active'::text)))))));

alter policy union_whatsapp_messages_read on public.union_whatsapp_messages using ((private.has_effective_organization_permission(organization_id, 'whatsapp.inbox.view'::text) AND (EXISTS ( SELECT 1
   FROM union_whatsapp_conversations thread
  WHERE ((thread.id = union_whatsapp_messages.conversation_id) AND (thread.organization_id = union_whatsapp_messages.organization_id) AND (thread.channel_id = union_whatsapp_messages.channel_id)))) AND private.union_whatsapp_active_account_visible(organization_id, channel_id, account_phone)));
