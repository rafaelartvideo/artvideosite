-- Archived SAC history remains in the private index. A finished shell is
-- only a navigational anchor and must not allocate a new protocol number.
begin;
alter table public.union_whatsapp_conversations
 add column if not exists history_archive_only boolean not null default false;

create or replace function private.union_whatsapp_sync_protocol()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare active_protocol public.union_whatsapp_protocols%rowtype;
declare created_number bigint;
begin
 -- A read-only archive thread is not an operational attendance.
 if tg_op='INSERT' and new.history_archive_only and new.status='finished' then
   return new;
 end if;
 select * into active_protocol from public.union_whatsapp_protocols
 where conversation_id=new.id and closed_at is null for update;
 if new.status in ('finished','abandoned') then
   if found then
     update public.union_whatsapp_protocols
       set status=new.status,assigned_to=new.assigned_to,
         department_id=new.department_id,closed_at=now(),updated_at=now()
       where id=active_protocol.id;
   elsif tg_op='INSERT' then
     -- Protocolo histórico necessário para anexar o evento de saída,
     -- mas não há protocolo aberto/cliente aguardando.
     created_number:=private.union_whatsapp_next_protocol_number(new.organization_id);
     insert into public.union_whatsapp_protocols(
       organization_id,conversation_id,channel_id,account_phone,protocol_number,
       status,assigned_to,department_id,opened_at,closed_at
     ) values (
       new.organization_id,new.id,new.channel_id,new.account_phone,created_number,
       new.status,new.assigned_to,new.department_id,now(),now()
     );
     update public.union_whatsapp_conversations
       set last_protocol_number=created_number,history_archive_only=false where id=new.id;
   end if;
   return new;
 end if;
 if not found then
   created_number:=private.union_whatsapp_next_protocol_number(new.organization_id);
   insert into public.union_whatsapp_protocols(
     organization_id,conversation_id,channel_id,account_phone,protocol_number,
     status,assigned_to,department_id,opened_at,assigned_at
   ) values (
     new.organization_id,new.id,new.channel_id,new.account_phone,created_number,
     new.status,new.assigned_to,new.department_id,now(),
     case when new.status='in_att' then now() else null end
   );
   update public.union_whatsapp_conversations
      set last_protocol_number=created_number,history_archive_only=false where id=new.id;
 else
   update public.union_whatsapp_protocols set
     status=new.status,assigned_to=new.assigned_to,department_id=new.department_id,
     assigned_at=case when assigned_at is null and new.status='in_att'
       then now() else assigned_at end,updated_at=now()
   where id=active_protocol.id
     and (status,assigned_to,department_id) is distinct from
         (new.status,new.assigned_to,new.department_id);
 end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_sync_protocol() from public,anon,authenticated;

-- A real outgoing mobile event can arrive on a historical-only finished
-- conversation before a new active attendance exists. Allocate an operational
-- closed protocol only for that actual event; archive reads never reach here.
create or replace function private.union_whatsapp_assign_message_protocol()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare
 thread public.union_whatsapp_conversations%rowtype;
 created_number bigint;
begin
 select id into new.protocol_id from public.union_whatsapp_protocols
 where conversation_id=new.conversation_id and closed_at is null limit 1;
 if new.protocol_id is null then
   select id into new.protocol_id from public.union_whatsapp_protocols
   where conversation_id=new.conversation_id
   order by opened_at desc,created_at desc limit 1;
 end if;
 if new.protocol_id is null then
   select * into thread from public.union_whatsapp_conversations
   where id=new.conversation_id and organization_id=new.organization_id
     and channel_id=new.channel_id and account_phone=new.account_phone
   for update;
   if not found then raise exception 'whatsapp_protocol_required'; end if;
   -- Re-read after acquiring the lock, in case another real event opened it.
   select id into new.protocol_id from public.union_whatsapp_protocols
   where conversation_id=new.conversation_id
   order by (closed_at is null) desc,opened_at desc,created_at desc limit 1;
   if new.protocol_id is null and thread.history_archive_only
      and thread.status='finished' and new.direction='outgoing' then
     created_number:=private.union_whatsapp_next_protocol_number(thread.organization_id);
     insert into public.union_whatsapp_protocols(
       organization_id,conversation_id,channel_id,account_phone,protocol_number,
       status,assigned_to,department_id,opened_at,closed_at
     ) values (
       thread.organization_id,thread.id,thread.channel_id,thread.account_phone,created_number,
       'finished',thread.assigned_to,thread.department_id,new.sent_at,new.sent_at
     ) returning id into new.protocol_id;
     update public.union_whatsapp_conversations
       set last_protocol_number=created_number,history_archive_only=false where id=thread.id;
   end if;
 end if;
 if new.protocol_id is null then raise exception 'whatsapp_protocol_required'; end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_assign_message_protocol() from public,anon,authenticated;
commit;
