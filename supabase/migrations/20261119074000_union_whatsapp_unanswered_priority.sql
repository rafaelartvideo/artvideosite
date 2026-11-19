-- Auto-priorizacao de conversas aguardando resposta, sem cron nem varredura de historico.
alter table public.union_whatsapp_queue_settings
  add column if not exists auto_prioritize_unanswered boolean not null default true,
  add column if not exists unanswered_priority_minutes integer not null default 15
    check (unanswered_priority_minutes between 1 and 1440);

alter table public.union_whatsapp_conversations
  add column if not exists awaiting_reply_since timestamptz,
  add column if not exists last_reply_event_at timestamptz;

-- Alimentado apenas por mensagens novas: nenhuma leitura de todo o historico no inbox.
create or replace function private.union_whatsapp_track_reply_clock()
returns trigger language plpgsql security invoker
set search_path='pg_catalog','public'
as $$
begin
  if new.direction = 'incoming' then
    update public.union_whatsapp_conversations c
       set awaiting_reply_since=new.sent_at
     where c.id=new.conversation_id
       and c.organization_id=new.organization_id
       and c.channel_id=new.channel_id
       and c.status in ('waiting','in_att')
       and new.sent_at > coalesce(c.last_reply_event_at,'-infinity'::timestamptz)
       and (c.awaiting_reply_since is null or new.sent_at < c.awaiting_reply_since);
  elsif new.direction = 'outgoing' then
    update public.union_whatsapp_conversations c
       set last_reply_event_at=greatest(coalesce(c.last_reply_event_at,new.sent_at),new.sent_at),
           awaiting_reply_since=case
             when c.awaiting_reply_since <= new.sent_at then null
             else c.awaiting_reply_since end
     where c.id=new.conversation_id
       and c.organization_id=new.organization_id
       and c.channel_id=new.channel_id
       and c.status in ('waiting','in_att')
       and (c.last_reply_event_at is null or new.sent_at>c.last_reply_event_at
          or (c.awaiting_reply_since is not null and c.awaiting_reply_since<=new.sent_at));
  end if;
  return new;
end;
$$;
revoke all on function private.union_whatsapp_track_reply_clock() from public,anon,authenticated;
drop trigger if exists union_whatsapp_track_reply_clock_insert on public.union_whatsapp_messages;
create trigger union_whatsapp_track_reply_clock_insert
after insert on public.union_whatsapp_messages
for each row execute function private.union_whatsapp_track_reply_clock();

create or replace function private.union_whatsapp_reply_clock_on_status()
returns trigger language plpgsql security invoker
set search_path='pg_catalog','public'
as $$
begin
  if new.status in ('finished','abandoned')
      or (old.status in ('finished','abandoned') and new.status in ('waiting','in_att')) then
    new.awaiting_reply_since=null;
    new.last_reply_event_at=null;
  end if;
  return new;
end;
$$;
revoke all on function private.union_whatsapp_reply_clock_on_status() from public,anon,authenticated;
drop trigger if exists union_whatsapp_reply_clock_status on public.union_whatsapp_conversations;
create trigger union_whatsapp_reply_clock_status
before update of status on public.union_whatsapp_conversations
for each row when (old.status is distinct from new.status)
execute function private.union_whatsapp_reply_clock_on_status();

-- Backfill limitado ao inbox atualmente ativo; busca indexada por conversa.
with recent as (
  select c.id, m.direction, m.sent_at
  from public.union_whatsapp_conversations c
  join lateral (
    select m.direction,m.sent_at from public.union_whatsapp_messages m
    where m.conversation_id=c.id
    order by m.sent_at desc,m.id desc limit 1
  ) m on true
  where c.status in ('waiting','in_att')
  order by c.last_message_at desc nulls last
  limit 5000
)
update public.union_whatsapp_conversations c
set awaiting_reply_since=case when recent.direction='incoming' then recent.sent_at else null end,
    last_reply_event_at=case when recent.direction='outgoing' then recent.sent_at else null end
from recent where c.id=recent.id;

create index if not exists union_whatsapp_reply_priority_idx
  on public.union_whatsapp_conversations
  (organization_id,channel_id,account_phone,status,awaiting_reply_since,id)
  where status='in_att' and forwarded_at is null and awaiting_reply_since is not null;

-- Pagina no banco APOS aplicar a prioridade global. SECURITY INVOKER preserva a RLS.
create or replace function public.union_whatsapp_prioritized_in_att(
  p_organization uuid,
  p_channel uuid,
  p_account_phone text,
  p_department text default 'all',
  p_operator uuid default null,
  p_search text default '',
  p_digits text default '',
  p_protocol bigint default null,
  p_page integer default 0,
  p_page_size integer default 50,
  p_priority_minutes integer default 15
)
returns jsonb language sql stable security invoker
set search_path='pg_catalog','public'
as $$
with filtered as materialized (
  select c.*,
    (c.assigned_to is distinct from (select auth.uid()) and exists (
      select 1 from public.union_whatsapp_conversation_participants membership
      where membership.conversation_id=c.id
        and membership.user_id=(select auth.uid()) and membership.status='active'
    )) as viewer_participating
  from public.union_whatsapp_conversations c
  where c.organization_id=p_organization and c.channel_id=p_channel
    and c.account_phone=p_account_phone and c.status='in_att'
    and c.forwarded_at is null
    and (
      p_department='all'
      or (p_department='none' and c.department_id is null)
      or (p_department not in ('all','none') and c.department_id::text=p_department)
    )
    and (p_operator is null or c.assigned_to=p_operator)
    and (
      coalesce(p_search,'')='' or
      c.contact_name ilike ('%' || replace(p_search,' ','%') || '%') or
      c.contact_phone ilike ('%' || replace(p_search,' ','%') || '%') or
      c.chat_jid ilike ('%' || replace(p_search,' ','%') || '%') or
      (length(p_digits)>=5 and c.contact_phone ilike ('%' || p_digits || '%')) or
      (p_protocol is not null and c.last_protocol_number=p_protocol)
    )
), ranked as (
  select f.*,
    case when f.awaiting_reply_since <=
      now()-make_interval(mins=>least(1440,greatest(1,p_priority_minutes))) then 0 else 1 end as priority_rank,
    case when f.awaiting_reply_since <=
      now()-make_interval(mins=>least(1440,greatest(1,p_priority_minutes))) then f.awaiting_reply_since end as priority_at
  from filtered f
  order by priority_rank, priority_at asc nulls last,
    last_message_at desc nulls last, id desc
  limit least(50,greatest(1,p_page_size))
  offset greatest(0,p_page)*least(50,greatest(1,p_page_size))
)
select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(r)-'priority_rank'-'priority_at'
    order by r.priority_rank, r.priority_at asc nulls last,
      r.last_message_at desc nulls last,r.id desc) from ranked r),'[]'::jsonb),
  'total',(select count(*) from filtered)
);
$$;
revoke all on function public.union_whatsapp_prioritized_in_att(uuid,uuid,text,text,uuid,text,text,bigint,integer,integer,integer)
  from public,anon,authenticated;
grant execute on function public.union_whatsapp_prioritized_in_att(uuid,uuid,text,text,uuid,text,text,bigint,integer,integer,integer)
  to authenticated;