-- Compute fresh authorization scopes once per statement, rather than per inbox row.
-- Keep these helpers private: they are policy implementation details, not RPCs.
create function private.union_whatsapp_read_accounts()
returns table (organization_id uuid, channel_id uuid, account_phone text)
language sql stable security definer
set search_path = ''
as $$
  select c.organization_id, c.id, c.phone
  from public.whatsapp_channel_connections c
  where (select auth.uid()) is not null
    and c.state = 'connected'
    and c.webhook_ready
    and private.has_effective_organization_permission(c.organization_id, 'whatsapp.inbox.view');
$$;

create function private.union_whatsapp_read_organizations(p_capability text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select b.organization_id
  from public.union_whatsapp_operator_bindings b
  where b.user_id = (select auth.uid())
    and b.is_active
    and p_capability in ('view_all', 'view_assigned', 'view_queues')
    and private.union_whatsapp_allowed(b.organization_id, p_capability);
$$;

revoke all on function private.union_whatsapp_read_accounts() from public, anon;
revoke all on function private.union_whatsapp_read_organizations(text) from public, anon;
grant execute on function private.union_whatsapp_read_accounts() to authenticated;
grant execute on function private.union_whatsapp_read_organizations(text) to authenticated;

alter policy union_whatsapp_conversations_read
on public.union_whatsapp_conversations
using (
  (organization_id, channel_id, account_phone) in (
    select scope.organization_id, scope.channel_id, scope.account_phone
    from private.union_whatsapp_read_accounts() scope
  )
  and (
    organization_id in (select private.union_whatsapp_read_organizations('view_all'))
    or (
      assigned_to = (select auth.uid())
      and organization_id in (select private.union_whatsapp_read_organizations('view_assigned'))
    )
    or (
      status = 'waiting' and assigned_to is null
      and organization_id in (select private.union_whatsapp_read_organizations('view_queues'))
      and (forwarded_at is null or forwarded_by is distinct from (select auth.uid()))
      and (
        department_id is null or exists (
          select 1 from public.union_whatsapp_department_members member
          where member.organization_id = union_whatsapp_conversations.organization_id
            and member.department_id = union_whatsapp_conversations.department_id
            and member.user_id = (select auth.uid())
        )
      )
    )
    or exists (
      select 1 from public.union_whatsapp_conversation_participants participant
      where participant.organization_id = union_whatsapp_conversations.organization_id
        and participant.conversation_id = union_whatsapp_conversations.id
        and participant.user_id = (select auth.uid())
        and participant.status = 'active'
    )
  )
);

alter policy union_whatsapp_messages_read
on public.union_whatsapp_messages
using (
  (organization_id, channel_id, account_phone) in (
    select scope.organization_id, scope.channel_id, scope.account_phone
    from private.union_whatsapp_read_accounts() scope
  )
  and exists (
    select 1 from public.union_whatsapp_conversations thread
    where thread.id = union_whatsapp_messages.conversation_id
      and thread.organization_id = union_whatsapp_messages.organization_id
      and thread.channel_id = union_whatsapp_messages.channel_id
  )
);
