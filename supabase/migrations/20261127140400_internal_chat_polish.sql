begin;
insert into public.permissions(key,label,description,module_name,sort_order) values
('internal_chat.settings.manage','Configurar chat interno','Gerenciar regras do chat e limites de arquivos da própria empresa.','Chat interno',6160)
on conflict(key) do nothing;

create table public.internal_chat_settings(
 organization_id uuid primary key references public.organizations(id),
 enabled boolean not null default true,
 calls_enabled boolean not null default true,
 groups_enabled boolean not null default true,
 attachments_enabled boolean not null default true,
 audio_enabled boolean not null default true,
 pbx_enabled boolean not null default true,
 desktop_notifications boolean not null default false,
 max_file_bytes integer not null default 10485760 check(max_file_bytes between 1048576 and 10485760),
 quota_bytes bigint not null default 1073741824 check(quota_bytes between 10485760 and 10737418240)
);
alter table public.internal_chat_settings enable row level security;
revoke all on public.internal_chat_settings from public,anon,authenticated;
grant select on public.internal_chat_settings to authenticated;
create policy chat_settings_read on public.internal_chat_settings for select to authenticated
using(private.internal_chat_allowed(organization_id,'internal_chat.use'));
create function private.internal_chat_feature(p_org uuid,p_feature text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select s.enabled and case p_feature
 when 'call' then s.calls_enabled when 'group' then s.groups_enabled
 when 'attachment' then s.attachments_enabled when 'audio' then s.attachments_enabled and s.audio_enabled
 when 'pbx' then s.pbx_enabled when 'message' then true else false end
 from public.internal_chat_settings s where s.organization_id=p_org),p_feature in ('call','group','attachment','audio','pbx','message'));
$$;
revoke all on function private.internal_chat_feature(uuid,text) from public,anon;
grant execute on function private.internal_chat_feature(uuid,text) to authenticated;
create function private.internal_chat_settings_save(p_org uuid,p_value jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s public.internal_chat_settings;
begin
 if not private.internal_chat_allowed(p_org,'internal_chat.use') or not private.has_organization_permission(p_org,'internal_chat.settings.manage') then raise exception 'Sem permissão' using errcode='42501'; end if;
 s:=jsonb_populate_record(null::public.internal_chat_settings,p_value);
 insert into public.internal_chat_settings(organization_id,enabled,calls_enabled,groups_enabled,attachments_enabled,audio_enabled,pbx_enabled,desktop_notifications,max_file_bytes,quota_bytes)
 values(p_org,s.enabled,s.calls_enabled,s.groups_enabled,s.attachments_enabled,s.audio_enabled,s.pbx_enabled,s.desktop_notifications,s.max_file_bytes,s.quota_bytes)
 on conflict(organization_id) do update set enabled=excluded.enabled,calls_enabled=excluded.calls_enabled,groups_enabled=excluded.groups_enabled,attachments_enabled=excluded.attachments_enabled,audio_enabled=excluded.audio_enabled,pbx_enabled=excluded.pbx_enabled,desktop_notifications=excluded.desktop_notifications,max_file_bytes=excluded.max_file_bytes,quota_bytes=excluded.quota_bytes;
end;
$$;
revoke all on function private.internal_chat_settings_save(uuid,jsonb) from public,anon;
grant execute on function private.internal_chat_settings_save(uuid,jsonb) to authenticated;
create function public.internal_chat_settings_save_v1(p_org uuid,p_value jsonb)
returns void language sql security invoker set search_path='' as $$ select private.internal_chat_settings_save(p_org,p_value); $$;
revoke all on function public.internal_chat_settings_save_v1(uuid,jsonb) from public,anon;
grant execute on function public.internal_chat_settings_save_v1(uuid,jsonb) to authenticated;

alter table public.internal_chat_messages add column client_token uuid;
alter table public.internal_chat_messages add column reply_to uuid references public.internal_chat_messages(id);
alter table public.internal_chat_messages add column edited_at timestamptz;
alter table public.internal_chat_messages add column deleted_at timestamptz;
alter table public.internal_chat_messages add column attachment_bytes bigint not null default 0 check(attachment_bytes>=0);
alter table public.internal_chat_messages add column attachment_mime text;
create unique index internal_chat_client_token_idx on public.internal_chat_messages(organization_id,sender_id,client_token) where client_token is not null;
create index internal_chat_attachment_usage_idx on public.internal_chat_messages(organization_id) include(attachment_bytes) where attachment_path is not null;
create index internal_chat_search_idx on public.internal_chat_messages using gin(to_tsvector('simple'::regconfig,body)) where kind='text' and deleted_at is null;
grant insert(client_token,reply_to) on public.internal_chat_messages to authenticated;

-- Run after the existing caller guard. No edits can change the target of a message.
create function private.internal_chat_guard_features() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_size bigint; v_mime text; v_max bigint; v_quota bigint; v_used bigint;
begin
 if not private.internal_chat_allowed(new.organization_id,'internal_chat.use') or new.sender_id is distinct from auth.uid() then raise exception 'Sem acesso' using errcode='42501'; end if;
 if not private.internal_chat_feature(new.organization_id,case when new.kind='call' then 'call' when new.group_id is not null then 'group' else 'message' end) then raise exception 'Recurso desabilitado pela empresa' using errcode='42501'; end if;
 if new.reply_to is not null and not exists(select 1 from public.internal_chat_messages m where m.id=new.reply_to and m.organization_id=new.organization_id and
   ((new.group_id is not null and m.group_id=new.group_id) or (new.group_id is null and m.group_id is null and
    ((m.sender_id=new.sender_id and m.recipient_id=new.recipient_id) or (m.sender_id=new.recipient_id and m.recipient_id=new.sender_id))))) then raise exception 'Resposta fora da conversa' using errcode='42501'; end if;
 if new.attachment_path is not null then
  if not private.internal_chat_allowed(new.organization_id,'internal_chat.attachments.send') or not private.internal_chat_feature(new.organization_id,'attachment') then raise exception 'Anexos desabilitados' using errcode='42501';end if;
  select (o.metadata->>'size')::bigint,o.metadata->>'mimetype' into v_size,v_mime from storage.objects o
  where o.bucket_id='internal-chat-files' and o.name=new.attachment_path and o.owner_id=auth.uid()::text;
  if v_size is null or v_size<=0 or v_mime is null then raise exception 'Arquivo não encontrado' using errcode='22023';end if;
  if v_mime like 'audio/%' and not private.internal_chat_feature(new.organization_id,'audio') then raise exception 'Áudio desabilitado' using errcode='42501';end if;
  select coalesce(s.max_file_bytes,10485760),coalesce(s.quota_bytes,1073741824) into v_max,v_quota from (select 1) x left join public.internal_chat_settings s on s.organization_id=new.organization_id;
  perform pg_advisory_xact_lock(hashtextextended('internal-chat-storage:'||new.organization_id::text,0));
  select coalesce(sum(m.attachment_bytes),0) into v_used from public.internal_chat_messages m where m.organization_id=new.organization_id and m.attachment_path is not null;
  if v_size>v_max or v_used+v_size>v_quota then raise exception 'Limite de armazenamento do chat atingido' using errcode='22023';end if;
  new.attachment_bytes:=v_size;new.attachment_mime:=v_mime;
 end if;
 return new;
end;
$$;
revoke all on function private.internal_chat_guard_features() from public,anon,authenticated;
create trigger internal_chat_guard_features before insert on public.internal_chat_messages for each row execute function private.internal_chat_guard_features();

create function private.internal_chat_group_feature_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not private.internal_chat_feature(new.organization_id,'group') then raise exception 'Grupos desabilitados' using errcode='42501';end if;
 return new;
end;
$$;
revoke all on function private.internal_chat_group_feature_guard() from public,anon,authenticated;
create trigger internal_chat_group_feature_guard before insert or update on public.internal_chat_groups for each row execute function private.internal_chat_group_feature_guard();

-- Soft deletion preserves reply references; content is replaced, never returned as original text.
create function private.internal_chat_edit(p_org uuid,p_id uuid,p_body text,p_delete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare m public.internal_chat_messages;
begin
 if not private.internal_chat_allowed(p_org,'internal_chat.use') then raise exception 'Sem acesso' using errcode='42501';end if;
 select * into m from public.internal_chat_messages where id=p_id and organization_id=p_org and sender_id=auth.uid() for update;
 if not found or m.kind<>'text' or m.deleted_at is not null or (m.group_id is not null and not private.internal_chat_group_member(p_org,m.group_id)) then raise exception 'Mensagem indisponível' using errcode='42501';end if;
 if p_delete then
   update public.internal_chat_messages set body='Mensagem excluída',deleted_at=now() where id=p_id;
 elsif m.attachment_path is null and char_length(btrim(coalesce(p_body,''))) between 1 and 4000 then
   update public.internal_chat_messages set body=btrim(p_body),edited_at=now() where id=p_id;
 else raise exception 'Mensagem inválida' using errcode='22023';end if;
end;
$$;
revoke all on function private.internal_chat_edit(uuid,uuid,text,boolean) from public,anon;
grant execute on function private.internal_chat_edit(uuid,uuid,text,boolean) to authenticated;
create function public.internal_chat_edit_v1(p_org uuid,p_id uuid,p_body text,p_delete boolean)
returns void language sql security invoker set search_path='' as $$ select private.internal_chat_edit(p_org,p_id,p_body,p_delete); $$;
revoke all on function public.internal_chat_edit_v1(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.internal_chat_edit_v1(uuid,uuid,text,boolean) to authenticated;

create function private.internal_chat_notify_edit() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_peer uuid;
begin
 if new.group_id is not null then
  for v_peer in select user_id from public.internal_chat_group_members where organization_id=new.organization_id and group_id=new.group_id loop
   perform realtime.send(jsonb_build_object('group_id',new.group_id,'id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||v_peer::text,true);
  end loop;
 else
  perform realtime.send(jsonb_build_object('id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||new.sender_id::text,true);
  perform realtime.send(jsonb_build_object('id',new.id),'changed','internal-chat:'||new.organization_id::text||':'||new.recipient_id::text,true);
 end if;
 return new;
end;
$$;
revoke all on function private.internal_chat_notify_edit() from public,anon,authenticated;
create trigger internal_chat_notify_edit after update of edited_at,deleted_at on public.internal_chat_messages for each row when(old.edited_at is distinct from new.edited_at or old.deleted_at is distinct from new.deleted_at) execute function private.internal_chat_notify_edit();

create table public.internal_chat_preferences(
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references public.profiles(id),
 target_id uuid not null,
 target_type text not null check(target_type in ('direct','group')),
 pinned boolean not null default false,
 muted boolean not null default false,
 primary key(organization_id,user_id,target_type,target_id)
);
alter table public.internal_chat_preferences enable row level security;
revoke all on public.internal_chat_preferences from public,anon,authenticated;
grant select,insert,update on public.internal_chat_preferences to authenticated;
create policy internal_chat_preferences_own on public.internal_chat_preferences for all to authenticated
using(user_id=(select auth.uid()) and private.internal_chat_allowed(organization_id,'internal_chat.use'))
with check(user_id=(select auth.uid()) and private.internal_chat_allowed(organization_id,'internal_chat.use') and
 ((target_type='group' and private.internal_chat_group_member(organization_id,target_id)) or
 (target_type='direct' and private.internal_chat_recipient_active(organization_id,target_id))));

create function public.internal_chat_search_v1(p_org uuid,p_peer uuid,p_group uuid,p_query text)
returns setof public.internal_chat_messages language sql stable security invoker set search_path='' as $$
 select m.* from public.internal_chat_messages m where m.organization_id=p_org and m.kind='text' and m.deleted_at is null
 and char_length(btrim(p_query)) between 2 and 100
 and ((p_group is not null and m.group_id=p_group) or (p_group is null and p_peer is not null and m.group_id is null and
 ((m.sender_id=(select auth.uid()) and m.recipient_id=p_peer) or (m.recipient_id=(select auth.uid()) and m.sender_id=p_peer))))
 and to_tsvector('simple'::regconfig,m.body) @@ plainto_tsquery('simple'::regconfig,p_query)
 order by m.created_at desc limit 50;
$$;
revoke all on function public.internal_chat_search_v1(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.internal_chat_search_v1(uuid,uuid,uuid,text) to authenticated;

update storage.buckets set allowed_mime_types=allowed_mime_types||array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'] where id='internal-chat-files';
drop policy internal_chat_files_select on storage.objects;
create policy internal_chat_files_select on storage.objects for select to authenticated
using(bucket_id='internal-chat-files' and (private.internal_chat_owns_upload(name,false)
 or exists(select 1 from public.internal_chat_messages m where m.attachment_path=storage.objects.name and m.deleted_at is null)));

-- Settings and preferences propagate to open tabs using existing private topics.
create function private.internal_chat_notify_settings() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_peer uuid;
begin
 for v_peer in select m.user_id from public.organization_members m where m.organization_id=new.organization_id and m.status='active' loop
  perform realtime.send(jsonb_build_object('settings',true),'changed','internal-chat:'||new.organization_id::text||':'||v_peer::text,true);
 end loop;
 return new;
end;
$$;
revoke all on function private.internal_chat_notify_settings() from public,anon,authenticated;
create trigger internal_chat_notify_settings after insert or update on public.internal_chat_settings for each row execute function private.internal_chat_notify_settings();

create function private.internal_chat_notify_preferences() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send(jsonb_build_object('preferences',true),'changed','internal-chat:'||new.organization_id::text||':'||new.user_id::text,true);
 return new;
end;
$$;
revoke all on function private.internal_chat_notify_preferences() from public,anon,authenticated;
create trigger internal_chat_notify_preferences after insert or update on public.internal_chat_preferences for each row execute function private.internal_chat_notify_preferences();

-- Only metadata is sent on new-message notifications. No body or file URL.
create or replace function private.internal_chat_notify() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_peer uuid; v_payload jsonb;
begin
 if tg_op='UPDATE' and new.read_at is not distinct from old.read_at and new.response is not distinct from old.response then return new;end if;
 v_payload:=jsonb_build_object('id',new.id,'sender_id',new.sender_id,'kind',new.kind,'new_message',tg_op='INSERT');
 if new.group_id is not null then
  v_payload:=v_payload||jsonb_build_object('group_id',new.group_id);
  for v_peer in select m.user_id from public.internal_chat_group_members m
   join public.organization_members om on om.organization_id=m.organization_id and om.user_id=m.user_id and om.status='active'
   where m.organization_id=new.organization_id and m.group_id=new.group_id loop
   perform realtime.send(v_payload,'changed','internal-chat:'||new.organization_id::text||':'||v_peer::text,true);
  end loop;
 else
  perform realtime.send(v_payload,'changed','internal-chat:'||new.organization_id::text||':'||new.sender_id::text,true);
  perform realtime.send(v_payload,'changed','internal-chat:'||new.organization_id::text||':'||new.recipient_id::text,true);
 end if;
 return new;
end;
$$;

-- Enforce chat-specific phone switch without changing ordinary PABX access.
create or replace function private.internal_chat_extension(p_org uuid,p_peer uuid)
returns integer language sql stable security definer set search_path='' as $$
 select ext.number from public.pbx_extensions ext
 join public.employees e on e.id=ext.employee_id and e.organization_id=ext.organization_id
 join public.organization_members m on m.organization_id=e.organization_id and m.user_id=e.profile_id
 where ext.organization_id=p_org and e.profile_id=p_peer and e.is_active and m.status='active'
 and ext.desired_enabled and ext.is_managed and ext.provisioning_status='applied'
 and private.internal_chat_allowed(p_org,'internal_chat.use')
 and private.has_effective_organization_permission(p_org,'pbx.view')
 and private.internal_chat_feature(p_org,'pbx')
 limit 1;
$$;

commit;
