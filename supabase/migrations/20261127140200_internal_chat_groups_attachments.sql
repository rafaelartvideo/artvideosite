begin;
insert into public.permissions(key,label,description,module_name,sort_order) values
('internal_chat.groups.create','Criar grupos','Criar grupos privados de funcionários.','Chat interno',6120),
('internal_chat.groups.manage','Gerenciar grupos','Gerenciar participantes de grupos dos quais faz parte.','Chat interno',6130),
('internal_chat.attachments.send','Enviar anexos','Enviar imagens e documentos no chat interno.','Chat interno',6140)
on conflict(key) do nothing;

create or replace function private.internal_chat_allowed(p_org uuid,p_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and p_key in ('internal_chat.use','internal_chat.call','internal_chat.groups.create','internal_chat.groups.manage','internal_chat.attachments.send')
 and exists(select 1 from public.organization_members m
 where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.status='active')
 and private.has_effective_organization_permission(p_org,p_key);
$$;

create table public.internal_chat_groups(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(char_length(btrim(name)) between 1 and 100),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,id)
);
create table public.internal_chat_group_members(
 organization_id uuid not null,
 group_id uuid not null,
 user_id uuid not null references public.profiles(id),
 last_read_at timestamptz not null default 'epoch',
 primary key(group_id,user_id),
 foreign key(organization_id,group_id) references public.internal_chat_groups(organization_id,id) on delete cascade
);
create index internal_chat_group_members_user_idx on public.internal_chat_group_members(organization_id,user_id,group_id);

create function private.internal_chat_group_member(p_org uuid,p_group uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.internal_chat_allowed(p_org,'internal_chat.use')
 and exists(select 1 from public.internal_chat_group_members m
 where m.organization_id=p_org and m.group_id=p_group and m.user_id=(select auth.uid()));
$$;
revoke all on function private.internal_chat_group_member(uuid,uuid) from public,anon;
grant execute on function private.internal_chat_group_member(uuid,uuid) to authenticated;
alter table public.internal_chat_groups enable row level security;
alter table public.internal_chat_group_members enable row level security;
revoke all on public.internal_chat_groups,public.internal_chat_group_members from public,anon,authenticated;
grant select on public.internal_chat_groups,public.internal_chat_group_members to authenticated;
create policy internal_chat_group_select on public.internal_chat_groups for select to authenticated
using(private.internal_chat_group_member(organization_id,id));
create policy internal_chat_group_members_select on public.internal_chat_group_members for select to authenticated
using(private.internal_chat_group_member(organization_id,group_id));

-- Membership mutations run in one transaction; owners cannot be removed.
create function private.internal_chat_group_save(p_org uuid,p_group uuid,p_name text,p_members uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_group uuid:=p_group; v_uid uuid:=(select auth.uid()); v_owner uuid; v_members uuid[]; v_peer uuid; v_previous uuid[]:='{}';
begin
 if not private.internal_chat_allowed(p_org,'internal_chat.use') then raise exception 'Sem acesso' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 1 and 100 or cardinality(coalesce(p_members,'{}'))>50 then
   raise exception 'Nome ou quantidade de participantes inválidos' using errcode='22023';
 end if;
 if v_group is null then
   if not private.internal_chat_allowed(p_org,'internal_chat.groups.create') then raise exception 'Sem permissão para criar grupos' using errcode='42501'; end if;
   v_owner:=v_uid;
 else
   if not private.internal_chat_group_member(p_org,v_group) then raise exception 'Sem acesso ao grupo' using errcode='42501'; end if;
   select g.created_by into v_owner from public.internal_chat_groups g where g.organization_id=p_org and g.id=v_group for update;
   if v_owner is distinct from v_uid and not private.internal_chat_allowed(p_org,'internal_chat.groups.manage') then raise exception 'Sem permissão para gerenciar grupos' using errcode='42501'; end if;
   select coalesce(array_agg(m.user_id),'{}') into v_previous from public.internal_chat_group_members m where m.group_id=v_group;
 end if;
 select array_agg(distinct item) into v_members from unnest(array_append(array_append(coalesce(p_members,'{}'),v_owner),v_uid)) item;
 if cardinality(v_members) not between 2 and 50 or exists (
   select 1 from unnest(v_members) item where item is null or not exists(
    select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=item and m.status='active'
   )
 ) then raise exception 'Selecione entre 2 e 50 funcionários ativos' using errcode='22023'; end if;
 if v_group is null then
   insert into public.internal_chat_groups(organization_id,name,created_by) values(p_org,btrim(p_name),v_uid) returning id into v_group;
 else
   update public.internal_chat_groups set name=btrim(p_name) where id=v_group and organization_id=p_org;
   delete from public.internal_chat_group_members where group_id=v_group and not(user_id=any(v_members));
 end if;
 insert into public.internal_chat_group_members(organization_id,group_id,user_id)
 select p_org,v_group,item from unnest(v_members) item on conflict(group_id,user_id) do nothing;
 for v_peer in select distinct item from unnest(v_previous||v_members) item loop
   perform realtime.send(jsonb_build_object('group_id',v_group),'changed','internal-chat:'||p_org::text||':'||v_peer::text,true);
 end loop;
 return v_group;
end;
$$;
revoke all on function private.internal_chat_group_save(uuid,uuid,text,uuid[]) from public,anon;
grant execute on function private.internal_chat_group_save(uuid,uuid,text,uuid[]) to authenticated;
create function public.internal_chat_group_save_v1(p_org uuid,p_group uuid,p_name text,p_members uuid[])
returns uuid language sql security invoker set search_path='' as $$
 select private.internal_chat_group_save(p_org,p_group,p_name,p_members);
$$;
revoke all on function public.internal_chat_group_save_v1(uuid,uuid,text,uuid[]) from public,anon;
grant execute on function public.internal_chat_group_save_v1(uuid,uuid,text,uuid[]) to authenticated;

alter table public.internal_chat_messages alter column recipient_id drop not null;
alter table public.internal_chat_messages add column group_id uuid;
alter table public.internal_chat_messages add column attachment_path text;
alter table public.internal_chat_messages add constraint internal_chat_group_fk foreign key(organization_id,group_id) references public.internal_chat_groups(organization_id,id);
alter table public.internal_chat_messages add constraint internal_chat_target_check check(
 (group_id is null and recipient_id is not null) or
 (group_id is not null and recipient_id is null and kind='text' and read_at is null)
);
alter table public.internal_chat_messages add constraint internal_chat_attachment_check check(
 attachment_path is null or (kind='text' and attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
 and split_part(attachment_path,'/',1)=organization_id::text and split_part(attachment_path,'/',2)=sender_id::text)
);
create index internal_chat_group_messages_idx on public.internal_chat_messages(organization_id,group_id,created_at desc,id desc) where group_id is not null;
create unique index internal_chat_attachment_unique on public.internal_chat_messages(attachment_path) where attachment_path is not null;
grant insert(group_id,attachment_path) on public.internal_chat_messages to authenticated;
drop policy internal_chat_select on public.internal_chat_messages;
create policy internal_chat_select on public.internal_chat_messages for select to authenticated using (
 private.internal_chat_allowed(organization_id,'internal_chat.use') and (
 (group_id is null and (sender_id=(select auth.uid()) or recipient_id=(select auth.uid())))
 or (group_id is not null and private.internal_chat_group_member(organization_id,group_id)))
);
drop policy internal_chat_insert on public.internal_chat_messages;
create policy internal_chat_insert on public.internal_chat_messages for insert to authenticated with check(
 sender_id=(select auth.uid()) and private.internal_chat_allowed(organization_id,'internal_chat.use')
 and (attachment_path is null or private.internal_chat_allowed(organization_id,'internal_chat.attachments.send'))
 and ((group_id is null and private.internal_chat_recipient_active(organization_id,recipient_id)
 and (kind='text' or private.internal_chat_allowed(organization_id,'internal_chat.call')))
 or (group_id is not null and kind='text' and private.internal_chat_group_member(organization_id,group_id)))
);
drop policy internal_chat_update on public.internal_chat_messages;
create policy internal_chat_update on public.internal_chat_messages for update to authenticated
using(group_id is null and (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()))
 and private.internal_chat_allowed(organization_id,'internal_chat.use'))
with check(group_id is null and (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()))
 and private.internal_chat_allowed(organization_id,'internal_chat.use'));

create or replace function private.internal_chat_notify() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_peer uuid;
begin
 if tg_op='UPDATE' and new.read_at is not distinct from old.read_at and new.response is not distinct from old.response then return new; end if;
 if new.group_id is not null then
   for v_peer in select m.user_id from public.internal_chat_group_members m
     join public.organization_members om on om.organization_id=m.organization_id and om.user_id=m.user_id and om.status='active'
     where m.organization_id=new.organization_id and m.group_id=new.group_id loop
     perform realtime.send(jsonb_build_object('group_id',new.group_id),'changed','internal-chat:'||new.organization_id::text||':'||v_peer::text,true);
   end loop;
 else
   perform realtime.send(jsonb_build_object('id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||new.sender_id::text,true);
   perform realtime.send(jsonb_build_object('id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||new.recipient_id::text,true);
 end if;
 return new;
end;
$$;

create function private.internal_chat_group_read(p_org uuid,p_group uuid,p_through timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.internal_chat_group_member(p_org,p_group) then raise exception 'Sem acesso' using errcode='42501'; end if;
 update public.internal_chat_group_members set last_read_at=greatest(last_read_at,least(p_through,now()))
 where organization_id=p_org and group_id=p_group and user_id=(select auth.uid());
end;
$$;
revoke all on function private.internal_chat_group_read(uuid,uuid,timestamptz) from public,anon;
grant execute on function private.internal_chat_group_read(uuid,uuid,timestamptz) to authenticated;
create function public.internal_chat_group_read_v1(p_org uuid,p_group uuid,p_through timestamptz)
returns void language sql security invoker set search_path='' as $$
 select private.internal_chat_group_read(p_org,p_group,p_through);
$$;
revoke all on function public.internal_chat_group_read_v1(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.internal_chat_group_read_v1(uuid,uuid,timestamptz) to authenticated;

-- Only active members see their own unread counts; indexed by group/time.
create function public.internal_chat_groups_v1(p_org uuid)
returns table(id uuid,name text,created_by uuid,unread bigint,last_read_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select g.id,g.name,g.created_by,
 (select count(*) from public.internal_chat_messages msg where msg.organization_id=p_org and msg.group_id=g.id and msg.created_at>m.last_read_at and msg.sender_id<>(select auth.uid())),
 m.last_read_at
 from public.internal_chat_groups g join public.internal_chat_group_members m on m.group_id=g.id and m.organization_id=g.organization_id
 where g.organization_id=p_org and m.user_id=(select auth.uid()) order by g.name,g.id;
$$;
revoke all on function public.internal_chat_groups_v1(uuid) from public,anon;
grant execute on function public.internal_chat_groups_v1(uuid) to authenticated;

-- Private storage, no public URLs. Object names contain no original file names.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('internal-chat-files','internal-chat-files',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do nothing;

create function private.internal_chat_owns_upload(p_path text,p_upload boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
 and split_part(p_path,'/',2)=(select auth.uid())::text
 and exists(select 1 from public.organization_members m where m.user_id=(select auth.uid()) and m.status='active'
 and m.organization_id::text=split_part(p_path,'/',1)
 and private.internal_chat_allowed(m.organization_id,'internal_chat.use')
 and (not p_upload or private.internal_chat_allowed(m.organization_id,'internal_chat.attachments.send')));
$$;
revoke all on function private.internal_chat_owns_upload(text,boolean) from public,anon;
grant execute on function private.internal_chat_owns_upload(text,boolean) to authenticated;

create policy internal_chat_files_insert on storage.objects for insert to authenticated
with check(bucket_id='internal-chat-files' and private.internal_chat_owns_upload(name,true));
create policy internal_chat_files_select on storage.objects for select to authenticated
using(bucket_id='internal-chat-files' and (private.internal_chat_owns_upload(name,false)
 or exists(select 1 from public.internal_chat_messages m where m.attachment_path=storage.objects.name)));
create policy internal_chat_files_delete on storage.objects for delete to authenticated
using(bucket_id='internal-chat-files' and private.internal_chat_owns_upload(name,false)
 and not exists(select 1 from public.internal_chat_messages m where m.attachment_path=storage.objects.name));
commit;
