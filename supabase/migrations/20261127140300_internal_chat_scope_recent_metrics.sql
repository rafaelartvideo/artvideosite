begin;
-- Chat is a cross-cutting feature, enabled by explicit role permissions rather
-- than a separately contracted module. Preserve all unrelated scope rules.
do $scope$
declare v_old text; v_new text;
begin
 select pg_get_functiondef('private.permission_required_module_keys(text)'::regprocedure) into v_old;
 if position('internal_chat.%' in v_old)=0 then
   v_new:=replace(v_old,'else array[split_part(p_key,''.'',1)]',
      'when p_key like ''internal_chat.%'' then array[]::text[] else array[split_part(p_key,''.'',1)]');
   if v_new=v_old then raise exception 'Permission scope changed; review chat scope before migration';end if;
   execute v_new;
 end if;
 if cardinality(private.permission_required_module_keys('internal_chat.use'))<>0 then
   raise exception 'Internal chat scope not enabled';
 end if;
end;
$scope$;

insert into public.permissions(key,label,description,module_name,sort_order) values
('internal_chat.metrics.view','Ver indicadores do chat','Consultar indicadores agregados do chat da própria empresa, sem ler conversas privadas.','Chat interno',6150)
on conflict(key) do nothing;
create or replace function private.internal_chat_allowed(p_org uuid,p_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and p_key in ('internal_chat.use','internal_chat.call','internal_chat.groups.create','internal_chat.groups.manage','internal_chat.attachments.send','internal_chat.metrics.view')
 and exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id
 where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.status='active' and p.is_active)
 and private.has_effective_organization_permission(p_org,p_key);
$$;
-- Directory and direct send targets require the recipient's explicit role grant
-- (or allow override) and reject explicit denials and disabled profiles.
create or replace function private.internal_chat_recipient_active(p_org uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.internal_chat_allowed(p_org,'internal_chat.use')
 and exists(
  select 1 from public.organization_members m
  join public.profiles profile on profile.id=m.user_id
  join public.permissions permission on permission.key='internal_chat.use'
  where m.organization_id=p_org and m.user_id=p_user and m.status='active' and profile.is_active
  and not exists(select 1 from public.user_permission_overrides denied where denied.organization_id=p_org
   and denied.user_id=p_user and denied.permission_id=permission.id and not denied.is_allowed)
  and (exists(select 1 from public.role_permissions rp where rp.role_id=m.role_id and rp.permission_id=permission.id)
   or exists(select 1 from public.user_permission_overrides allowed where allowed.organization_id=p_org
    and allowed.user_id=p_user and allowed.permission_id=permission.id and allowed.is_allowed))
 );
$$;
create or replace function private.internal_chat_directory(p_org uuid)
returns table(user_id uuid,full_name text)
language sql stable security definer set search_path='' as $$
 select m.user_id,coalesce(nullif(p.full_name,''),'Funcionário')
 from public.organization_members m join public.profiles p on p.id=m.user_id
 where m.organization_id=p_org and m.status='active' and m.user_id<>(select auth.uid())
 and private.internal_chat_recipient_active(p_org,m.user_id)
 order by 2,1;
$$;

create index internal_chat_recent_sent_idx on public.internal_chat_messages(organization_id,sender_id,created_at desc,id desc) where group_id is null;
create index internal_chat_recent_received_idx on public.internal_chat_messages(organization_id,recipient_id,created_at desc,id desc) where group_id is null;
create index internal_chat_usage_idx on public.internal_chat_messages(organization_id,created_at desc);
create index internal_chat_pending_company_idx on public.internal_chat_messages(organization_id) where kind='call' and response is null;

-- Bounded recent-conversation list; unread counts use the existing partial index.
create function public.internal_chat_recent_v1(p_org uuid)
returns table(peer_id uuid,created_at timestamptz,kind text,body text,attachment boolean,unread bigint)
language sql stable security invoker set search_path='' as $$
 with recent as (
  (select m.recipient_id peer_id,m.created_at,m.id,m.kind,m.body,m.attachment_path is not null attachment
   from public.internal_chat_messages m where m.organization_id=p_org and m.sender_id=(select auth.uid()) and m.group_id is null
   order by m.created_at desc,m.id desc limit 250)
  union all
  (select m.sender_id peer_id,m.created_at,m.id,m.kind,m.body,m.attachment_path is not null attachment
   from public.internal_chat_messages m where m.organization_id=p_org and m.recipient_id=(select auth.uid()) and m.group_id is null
   order by m.created_at desc,m.id desc limit 250)
 ), latest as (
  select distinct on (r.peer_id) r.peer_id,r.created_at,r.kind,r.body,r.attachment
  from recent r order by r.peer_id,r.created_at desc,r.id desc
 ), counts as (
  select m.sender_id peer_id,count(*) unread from public.internal_chat_messages m
   where m.organization_id=p_org and m.recipient_id=(select auth.uid()) and m.read_at is null
   group by m.sender_id
 )
 select l.peer_id,l.created_at,l.kind,l.body,l.attachment,coalesce(c.unread,0)
 from latest l left join counts c on c.peer_id=l.peer_id order by l.created_at desc limit 100;
$$;
revoke all on function public.internal_chat_recent_v1(uuid) from public,anon;
grant execute on function public.internal_chat_recent_v1(uuid) to authenticated;

create function private.internal_chat_metrics(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not private.internal_chat_allowed(p_org,'internal_chat.use') or not private.internal_chat_allowed(p_org,'internal_chat.metrics.view') then
  raise exception 'Sem permissão para consultar indicadores' using errcode='42501';
 end if;
 select jsonb_build_object('messages',count(*) filter(where kind='text'),
  'attachments',count(*) filter(where attachment_path is not null),
  'calls',count(*) filter(where kind='call'),
  'answered',count(*) filter(where kind='call' and response in ('coming','busy')),
  'mean_response_seconds',round(avg(extract(epoch from responded_at-created_at)) filter(where kind='call' and response in ('coming','busy'))),
  'pending',(select count(*) from public.internal_chat_messages p where p.organization_id=p_org and p.kind='call' and p.response is null))
 into v_result
 from public.internal_chat_messages where organization_id=p_org and created_at>=now()-interval '24 hours';
 return v_result;
end;
$$;
revoke all on function private.internal_chat_metrics(uuid) from public,anon;
grant execute on function private.internal_chat_metrics(uuid) to authenticated;
create function public.internal_chat_metrics_v1(p_org uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.internal_chat_metrics(p_org);
$$;
revoke all on function public.internal_chat_metrics_v1(uuid) from public,anon;
grant execute on function public.internal_chat_metrics_v1(uuid) to authenticated;
commit;
