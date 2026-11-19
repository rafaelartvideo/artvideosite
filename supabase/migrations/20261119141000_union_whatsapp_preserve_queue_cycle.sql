begin;

-- The first queue arrival belongs to the current attendance cycle.
-- Assuming an attendance must not erase it; returning it to the queue must
-- not make a long-waiting customer appear to have just arrived.
create or replace function private.union_whatsapp_queue_entered_at()
returns trigger language plpgsql security invoker
set search_path='pg_catalog','public'
as $$
begin
  if tg_op='INSERT' then
    new.queue_entered_at:=case when new.status='waiting' then now() else null end;
  elsif old.status is distinct from new.status then
    if new.status='in_att' then
      -- Preserve the initial waiting instant while an operator handles it.
      new.queue_entered_at:=old.queue_entered_at;
    elsif new.status='waiting' then
      -- Returning from an active attendance resumes the original clock.
      -- Reopening a finished cycle starts a new clock.
      new.queue_entered_at:=case
        when old.status='in_att' then coalesce(old.queue_entered_at,now())
        else now()
      end;
    else
      -- Completed/abandoned cycles no longer carry an active queue clock.
      new.queue_entered_at:=null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.union_whatsapp_queue_entered_at() from public,anon,authenticated;

-- Before this fix, assuming an attendance erased its queue timestamp.
-- Recover only currently open cycles with a confirmed 'assume' handoff
-- recorded AFTER the active protocol opened. Avoid inventing a queue
-- start for outbound or historical cycles with insufficient evidence.
with active_protocol as (
  select distinct on (p.conversation_id)
    p.conversation_id,p.opened_at
  from public.union_whatsapp_protocols p
  where p.closed_at is null
  order by p.conversation_id,p.opened_at desc
)
update public.union_whatsapp_conversations c
set queue_entered_at=p.opened_at
from active_protocol p
where c.id=p.conversation_id
  and c.status='in_att'
  and c.queue_entered_at is null
  and p.opened_at<=now()
  and exists (
    select 1
    from public.union_whatsapp_handoffs h
    where h.conversation_id=c.id
      and h.organization_id=c.organization_id
      and h.action='assume'
      and h.created_at>=p.opened_at
  );

commit;
