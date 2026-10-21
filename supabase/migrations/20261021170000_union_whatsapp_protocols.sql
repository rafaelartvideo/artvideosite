begin;

-- A conversa é permanente; cada ciclo de atendimento passa a ser um protocolo.
create table public.union_whatsapp_protocol_counters (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 last_number bigint not null default 0 check (last_number >= 0)
);
alter table public.union_whatsapp_protocol_counters enable row level security;
revoke all on public.union_whatsapp_protocol_counters from public,anon,authenticated;

create table public.union_whatsapp_protocols (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null references public.union_whatsapp_conversations(id) on delete cascade,
 channel_id uuid not null references public.whatsapp_channel_connections(id) on delete cascade,
 account_phone text not null,
 protocol_number bigint not null check(protocol_number>0),
 status text not null check(status in ('waiting','in_att','finished','abandoned')),
 assigned_to uuid references auth.users(id) on delete set null,
 department_id uuid references public.union_whatsapp_departments(id) on delete set null,
 opened_at timestamptz not null default now(),
 assigned_at timestamptz,
 closed_at timestamptz,
 opened_by uuid references auth.users(id) on delete set null,
 closed_by uuid references auth.users(id) on delete set null,
 first_reply_at timestamptz,
 last_message_at timestamptz,
 message_count integer not null default 0 check(message_count>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint union_whatsapp_protocols_number_unique unique(organization_id,protocol_number),
 constraint union_whatsapp_protocols_id_thread_unique unique(id,conversation_id),
 constraint union_whatsapp_protocol_closed_matches_status check (
    (status in ('finished','abandoned'))=(closed_at is not null)
 )
);
create unique index union_whatsapp_protocol_one_active on public.union_whatsapp_protocols(conversation_id) where closed_at is null;
create index union_whatsapp_protocol_thread_idx on public.union_whatsapp_protocols(conversation_id,opened_at desc);
create index union_whatsapp_protocol_reporting_idx on public.union_whatsapp_protocols(organization_id,opened_at desc);
create index union_whatsapp_protocol_operator_idx on public.union_whatsapp_protocols(organization_id,assigned_to,opened_at desc);
alter table public.union_whatsapp_protocols enable row level security;
revoke all on public.union_whatsapp_protocols from public,anon,authenticated;
grant select on public.union_whatsapp_protocols to authenticated;
create policy union_whatsapp_protocols_read
on public.union_whatsapp_protocols for select to authenticated
using (exists (
 select 1 from public.union_whatsapp_conversations c
 where c.id=conversation_id and c.organization_id=organization_id
   and c.channel_id=channel_id and c.account_phone=account_phone
));

alter table public.union_whatsapp_conversations
 add column last_protocol_number bigint;
alter table public.union_whatsapp_messages
 add column protocol_id uuid;
alter table public.union_whatsapp_handoffs
 add column protocol_id uuid;

-- Backfill conservador: uma sessão legada por conversa, sem dividir períodos
-- históricos que o sistema antigo não registrava.
with legacy as (
 select c.*,row_number() over(
   partition by c.organization_id order by c.created_at,c.id
 )::bigint as seq
 from public.union_whatsapp_conversations c
)
insert into public.union_whatsapp_protocols(
 organization_id,conversation_id,channel_id,account_phone,protocol_number,
 status,assigned_to,department_id,opened_at,assigned_at,closed_at,
 first_reply_at,last_message_at,message_count,created_at,updated_at)
select c.organization_id,c.id,c.channel_id,c.account_phone,c.seq,
 c.status,c.assigned_to,c.department_id,c.created_at,
 case when c.status='in_att' then c.updated_at else null end,
 case when c.status in ('finished','abandoned') then greatest(c.updated_at,c.created_at) else null end,
 (select min(m.sent_at) from public.union_whatsapp_messages m where m.conversation_id=c.id and m.direction='outgoing'),
 (select max(m.sent_at) from public.union_whatsapp_messages m where m.conversation_id=c.id),
 (select count(*) from public.union_whatsapp_messages m where m.conversation_id=c.id),
 c.created_at,c.updated_at
from legacy c;

insert into public.union_whatsapp_protocol_counters(organization_id,last_number)
select organization_id,max(protocol_number) from public.union_whatsapp_protocols group by organization_id;

update public.union_whatsapp_conversations c
set last_protocol_number=p.protocol_number
from public.union_whatsapp_protocols p where p.conversation_id=c.id;

update public.union_whatsapp_messages m
set protocol_id=p.id
from public.union_whatsapp_protocols p
where p.conversation_id=m.conversation_id;
update public.union_whatsapp_handoffs h
set protocol_id=p.id
from public.union_whatsapp_protocols p
where p.conversation_id=h.conversation_id;

alter table public.union_whatsapp_messages
 add constraint union_whatsapp_messages_protocol_fk
 foreign key (protocol_id,conversation_id)
 references public.union_whatsapp_protocols(id,conversation_id);
alter table public.union_whatsapp_handoffs
 add constraint union_whatsapp_handoffs_protocol_fk
 foreign key (protocol_id,conversation_id)
 references public.union_whatsapp_protocols(id,conversation_id);

-- Contador por empresa à prova de concorrência.
create or replace function private.union_whatsapp_next_protocol_number(p_organization uuid)
returns bigint language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare n bigint;
begin
 insert into public.union_whatsapp_protocol_counters(organization_id,last_number)
 values(p_organization,1)
 on conflict(organization_id)
 do update set last_number=public.union_whatsapp_protocol_counters.last_number+1
 returning last_number into n;
 return n;
end;
$$;
revoke all on function private.union_whatsapp_next_protocol_number(uuid) from public,anon,authenticated;

-- Garante que mudanças de estado abram/atualizem/fechem o protocolo.
-- Coluna last_protocol_number é atualizada separadamente sem reentrar no gatilho.
create or replace function private.union_whatsapp_sync_protocol()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare active_protocol public.union_whatsapp_protocols%rowtype;
declare created_number bigint;
begin
 select * into active_protocol from public.union_whatsapp_protocols
 where conversation_id=new.id and closed_at is null for update;
 if new.status in ('finished','abandoned') then
   if found then
     update public.union_whatsapp_protocols
     set status=new.status,assigned_to=new.assigned_to,department_id=new.department_id,
       closed_at=now(),updated_at=now()
     where id=active_protocol.id;
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
   set last_protocol_number=created_number where id=new.id;
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
create trigger union_whatsapp_protocol_conversation_insert
after insert on public.union_whatsapp_conversations
for each row execute function private.union_whatsapp_sync_protocol();
create trigger union_whatsapp_protocol_conversation_state
after update of status,assigned_to,department_id on public.union_whatsapp_conversations
for each row when (
 old.status is distinct from new.status or
 old.assigned_to is distinct from new.assigned_to or
 old.department_id is distinct from new.department_id
)
execute function private.union_whatsapp_sync_protocol();

-- Vínculo automático das mensagens ao protocolo vigente, sem duplicar dados.
create or replace function private.union_whatsapp_assign_message_protocol()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
begin
 select id into new.protocol_id from public.union_whatsapp_protocols
 where conversation_id=new.conversation_id and closed_at is null limit 1;
 if new.protocol_id is null then
   select id into new.protocol_id from public.union_whatsapp_protocols
   where conversation_id=new.conversation_id
   order by opened_at desc,created_at desc limit 1;
 end if;
 if new.protocol_id is null then
   raise exception 'whatsapp_protocol_required';
 end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_assign_message_protocol() from public,anon,authenticated;
create trigger union_whatsapp_message_protocol_before
before insert on public.union_whatsapp_messages
for each row execute function private.union_whatsapp_assign_message_protocol();

-- Executa após INSERT verdadeiro, portanto callbacks duplicados não contam
-- duas vezes mesmo quando o webhook utiliza ON CONFLICT DO NOTHING.
create or replace function private.union_whatsapp_protocol_message_stats()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
begin
 update public.union_whatsapp_protocols
 set message_count=message_count+1,
   last_message_at=greatest(coalesce(last_message_at,new.sent_at),new.sent_at),
   first_reply_at=case when new.direction='outgoing'
     then coalesce(first_reply_at,new.sent_at) else first_reply_at end,
   updated_at=now()
 where id=new.protocol_id;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_protocol_message_stats() from public,anon,authenticated;
create trigger union_whatsapp_message_protocol_after
after insert on public.union_whatsapp_messages
for each row execute function private.union_whatsapp_protocol_message_stats();

create or replace function private.union_whatsapp_assign_handoff_protocol()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
begin
 select id into new.protocol_id from public.union_whatsapp_protocols
 where conversation_id=new.conversation_id and closed_at is null limit 1;
 if new.protocol_id is null then
   select id into new.protocol_id from public.union_whatsapp_protocols
   where conversation_id=new.conversation_id order by opened_at desc,created_at desc limit 1;
 end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_assign_handoff_protocol() from public,anon,authenticated;
create trigger union_whatsapp_handoff_protocol_before
before insert on public.union_whatsapp_handoffs
for each row execute function private.union_whatsapp_assign_handoff_protocol();

create or replace function private.union_whatsapp_protocol_handoff_audit()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
begin
 if new.protocol_id is not null then
   update public.union_whatsapp_protocols set
     opened_by=case when new.action='start' then coalesce(opened_by,new.actor_id) else opened_by end,
     closed_by=case when new.action='finish' then new.actor_id else closed_by end
   where id=new.protocol_id;
 end if;
 return new;
end;
$$;
revoke all on function private.union_whatsapp_protocol_handoff_audit() from public,anon,authenticated;
create trigger union_whatsapp_handoff_protocol_after
after insert on public.union_whatsapp_handoffs
for each row execute function private.union_whatsapp_protocol_handoff_audit();

commit;