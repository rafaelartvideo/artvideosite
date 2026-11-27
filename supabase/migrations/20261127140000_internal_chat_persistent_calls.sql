begin;
insert into public.permissions(key,label,description,module_name,sort_order) values
('internal_chat.use','Utilizar chat interno','Enviar e receber mensagens privadas entre funcionários.','Chat interno',6100),
('internal_chat.call','Chamar funcionários','Enviar chamadas internas persistentes.','Chat interno',6110)
on conflict (key) do nothing;

-- Deliberately opt-in: administrators assign these permissions to their roles.
create function private.internal_chat_allowed(p_org uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null
 and p_key in ('internal_chat.use','internal_chat.call')
 and exists(select 1 from public.organization_members m
  where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.status='active')
 and private.has_effective_organization_permission(p_org,p_key);
$$;
revoke all on function private.internal_chat_allowed(uuid,text) from public,anon;
grant execute on function private.internal_chat_allowed(uuid,text) to authenticated;

create function private.internal_chat_recipient_active(p_org uuid,p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $
 select private.internal_chat_allowed(p_org,'internal_chat.use')
 and exists(select 1 from public.organization_members m
 where m.organization_id=p_org and m.user_id=p_user and m.status='active');
$;
revoke all on function private.internal_chat_recipient_active(uuid,uuid) from public,anon;
grant execute on function private.internal_chat_recipient_active(uuid,uuid) to authenticated;

create function private.internal_chat_directory(p_org uuid)
returns table(user_id uuid,full_name text)
language sql stable security definer set search_path = '' as $$
 select m.user_id,coalesce(nullif(p.full_name,''),'Funcionário')
 from public.organization_members m join public.profiles p on p.id=m.user_id
 where m.organization_id=p_org and m.status='active' and m.user_id<>(select auth.uid())
 and private.internal_chat_allowed(p_org,'internal_chat.use')
 order by 2,1;
$$;
revoke all on function private.internal_chat_directory(uuid) from public,anon;
grant execute on function private.internal_chat_directory(uuid) to authenticated;
create function public.internal_chat_directory_v1(p_org uuid)
returns table(user_id uuid,full_name text)
language sql stable security invoker set search_path = '' as $$
 select * from private.internal_chat_directory(p_org);
$$;
revoke all on function public.internal_chat_directory_v1(uuid) from public,anon;
grant execute on function public.internal_chat_directory_v1(uuid) to authenticated;

create table public.internal_chat_messages (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 sender_id uuid not null references public.profiles(id),
 recipient_id uuid not null references public.profiles(id),
 kind text not null default 'text' check(kind in ('text','call')),
 body text not null default '' check(char_length(body)<=4000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 response text check(response in ('coming','busy','cancelled')),
 responded_at timestamptz,
 check(sender_id<>recipient_id),
 check((kind='text' and length(btrim(body))>0 and response is null and responded_at is null)
 or (kind='call' and body='' and ((response is null and responded_at is null) or (response is not null and responded_at is not null))))
);
create index internal_chat_sender_idx on public.internal_chat_messages(organization_id,sender_id,recipient_id,created_at desc,id desc);
create index internal_chat_recipient_idx on public.internal_chat_messages(organization_id,recipient_id,sender_id,created_at desc,id desc);
create index internal_chat_unread_idx on public.internal_chat_messages(organization_id,recipient_id) where read_at is null;
create index internal_chat_pending_in_idx on public.internal_chat_messages(organization_id,recipient_id,created_at) where kind='call' and response is null;
create unique index internal_chat_one_pending_pair on public.internal_chat_messages(organization_id,sender_id,recipient_id) where kind='call' and response is null;

create index internal_chat_call_rate_idx on public.internal_chat_messages(organization_id,sender_id,created_at desc) where kind='call';
create function private.internal_chat_guard_insert() returns trigger
language plpgsql security invoker set search_path = '' as $
begin
 if new.kind='call' then
   if new.sender_id<>auth.uid() or not private.internal_chat_allowed(new.organization_id,'internal_chat.call') then
      raise exception 'Sem permissão para chamar' using errcode='42501';
   end if;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('internal-chat:'||new.organization_id::text||':'||new.sender_id::text,0));
   if (select count(*) from public.internal_chat_messages m where m.organization_id=new.organization_id
       and m.sender_id=new.sender_id and m.kind='call' and m.created_at>now()-interval '1 minute')>=5 then
     raise exception 'Muitas chamadas recentes. Aguarde antes de iniciar outra.' using errcode='P0001';
   end if;
 end if;
 return new;
end;
$;
revoke all on function private.internal_chat_guard_insert() from public,anon,authenticated;
create trigger internal_chat_guard_insert before insert on public.internal_chat_messages
for each row execute function private.internal_chat_guard_insert();

alter table public.internal_chat_messages enable row level security;
revoke all on public.internal_chat_messages from public,anon,authenticated;
grant select on public.internal_chat_messages to authenticated;
grant insert(organization_id,sender_id,recipient_id,kind,body) on public.internal_chat_messages to authenticated;
grant update(read_at,response) on public.internal_chat_messages to authenticated;
create policy internal_chat_select on public.internal_chat_messages for select to authenticated
using ((sender_id=(select auth.uid()) or recipient_id=(select auth.uid()))
 and private.internal_chat_allowed(organization_id,'internal_chat.use'));
create policy internal_chat_insert on public.internal_chat_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and private.internal_chat_allowed(organization_id,'internal_chat.use')
 and (kind='text' or private.internal_chat_allowed(organization_id,'internal_chat.call'))
 and private.internal_chat_recipient_active(organization_id,recipient_id));
create policy internal_chat_update on public.internal_chat_messages for update to authenticated
using ((sender_id=(select auth.uid()) or recipient_id=(select auth.uid()))
 and private.internal_chat_allowed(organization_id,'internal_chat.use'))
with check ((sender_id=(select auth.uid()) or recipient_id=(select auth.uid()))
 and private.internal_chat_allowed(organization_id,'internal_chat.use'));

create function private.internal_chat_guard_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.read_at is distinct from old.read_at then
   if old.recipient_id<>auth.uid() or old.read_at is not null or new.read_at is null then
     raise exception 'Leitura inválida' using errcode='42501';
   end if;
   new.read_at:=now();
 end if;
 if new.response is distinct from old.response then
   if old.kind<>'call' or old.response is not null or new.response is null
     or (new.response='cancelled' and old.sender_id<>auth.uid())
     or (new.response in ('coming','busy') and old.recipient_id<>auth.uid()) then
     raise exception 'Resposta inválida' using errcode='42501';
   end if;
   new.responded_at:=now();
   if new.response in ('coming','busy') then new.read_at:=coalesce(old.read_at,now()); end if;
 end if;
 return new;
end;
$$;
revoke all on function private.internal_chat_guard_update() from public,anon,authenticated;
create trigger internal_chat_guard before update on public.internal_chat_messages
for each row execute function private.internal_chat_guard_update();

-- Each user subscribes to their own private topic. No message body is broadcast.
create policy internal_chat_receive on realtime.messages for select to authenticated
using (extension='broadcast' and exists (
 select 1 from public.organization_members m
 where m.user_id=(select auth.uid()) and m.status='active'
 and realtime.topic()='internal-chat:'||m.organization_id::text||':'||m.user_id::text
 and private.internal_chat_allowed(m.organization_id,'internal_chat.use')
));
create function private.internal_chat_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='UPDATE' and new.read_at is not distinct from old.read_at and new.response is not distinct from old.response then return new; end if;
 perform realtime.send(jsonb_build_object('id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||new.sender_id::text,true);
 perform realtime.send(jsonb_build_object('id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||new.recipient_id::text,true);
 return new;
end;
$$;
revoke all on function private.internal_chat_notify() from public,anon,authenticated;
create trigger internal_chat_notify after insert or update on public.internal_chat_messages
for each row execute function private.internal_chat_notify();
commit;
