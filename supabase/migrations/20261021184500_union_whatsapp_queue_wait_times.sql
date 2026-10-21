begin;
-- Timestamp próprio da entrada na fila: ordenação FIFO, independentemente
-- de mensagens novas ou da última atualização da conversa.
alter table public.union_whatsapp_conversations
  add column if not exists queue_entered_at timestamptz;
update public.union_whatsapp_conversations c
set queue_entered_at=coalesce(
  (select p.opened_at from public.union_whatsapp_protocols p
   where p.conversation_id=c.id and p.closed_at is null
   order by p.opened_at desc limit 1),
  c.created_at
)
where c.status='waiting' and c.queue_entered_at is null;

create or replace function private.union_whatsapp_queue_entered_at()
returns trigger language plpgsql security invoker
set search_path='pg_catalog','public'
as $$
begin
  if tg_op='INSERT' then
    new.queue_entered_at:=case when new.status='waiting' then now() else null end;
  elsif old.status is distinct from new.status then
    new.queue_entered_at:=case when new.status='waiting' then now() else null end;
  end if;
  return new;
end;
$$;
revoke all on function private.union_whatsapp_queue_entered_at() from public,anon,authenticated;
drop trigger if exists union_whatsapp_queue_entered_at_insert on public.union_whatsapp_conversations;
create trigger union_whatsapp_queue_entered_at_insert
before insert on public.union_whatsapp_conversations
for each row execute function private.union_whatsapp_queue_entered_at();
drop trigger if exists union_whatsapp_queue_entered_at_state on public.union_whatsapp_conversations;
create trigger union_whatsapp_queue_entered_at_state
before update of status on public.union_whatsapp_conversations
for each row when (old.status is distinct from new.status)
execute function private.union_whatsapp_queue_entered_at();
create index if not exists union_whatsapp_queue_fifo_idx
on public.union_whatsapp_conversations (organization_id,channel_id,account_phone,queue_entered_at,id)
where status='waiting';
commit;