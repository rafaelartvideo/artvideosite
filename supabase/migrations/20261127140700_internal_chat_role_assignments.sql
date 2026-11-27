begin;
-- These independent profiles affect the chat only. No CRM grants are overwritten.
create table private.internal_chat_role_templates (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 role_key text not null check(role_key in ('operator','manager')),
 permission_keys text[] not null,
 primary key(organization_id,role_key),
 check(permission_keys <@ array['internal_chat.use','internal_chat.call','internal_chat.groups.create','internal_chat.groups.manage','internal_chat.attachments.send','internal_chat.metrics.view','internal_chat.settings.manage']::text[]),
 check(cardinality(permission_keys)=0 or 'internal_chat.use'=any(permission_keys))
);
create table private.internal_chat_role_assignments (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role_key text not null check(role_key in ('operator','manager')),
 primary key(organization_id,user_id)
);
alter table private.internal_chat_role_templates enable row level security;
alter table private.internal_chat_role_assignments enable row level security;
revoke all on private.internal_chat_role_templates,private.internal_chat_role_assignments from public,anon,authenticated;
create index internal_chat_role_assignments_role_idx on private.internal_chat_role_assignments(organization_id,role_key);
create function private.internal_chat_template_keys(p_org uuid,p_role text)
returns text[] language sql stable security definer set search_path='' as $$
 select coalesce((select t.permission_keys from private.internal_chat_role_templates t where t.organization_id=p_org and t.role_key=p_role),
 case p_role when 'operator' then array['internal_chat.use','internal_chat.call','internal_chat.attachments.send']::text[]
 when 'manager' then array['internal_chat.use','internal_chat.call','internal_chat.groups.create','internal_chat.groups.manage','internal_chat.attachments.send','internal_chat.metrics.view','internal_chat.settings.manage']::text[]
 else array[]::text[] end);
$$;
revoke all on function private.internal_chat_template_keys(uuid,text) from public,anon,authenticated;

-- A linked chat profile replaces CRM chat grants, including explicit chat overrides.
-- Active company membership is mandatory regardless of the chosen profile.
create function private.internal_chat_member_permission(p_org uuid,p_user uuid,p_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
 select case when a.role_key is not null then p_key=any(private.internal_chat_template_keys(p_org,a.role_key))
 when p_user=(select auth.uid()) then private.has_effective_organization_permission(p_org,p_key)
 else not exists(select 1 from public.user_permission_overrides d where d.organization_id=p_org and d.user_id=p_user and d.permission_id=perm.id and not d.is_allowed)
 and (exists(select 1 from public.role_permissions rp where rp.role_id=m.role_id and rp.permission_id=perm.id)
 or exists(select 1 from public.user_permission_overrides g where g.organization_id=p_org and g.user_id=p_user and g.permission_id=perm.id and g.is_allowed)) end
 from public.organization_members m
 join public.profiles profile on profile.id=m.user_id and profile.is_active
 join public.organizations o on o.id=m.organization_id and o.status='active'
 join public.permissions perm on perm.key=p_key and perm.key like 'internal_chat.%'
 left join private.internal_chat_role_assignments a on a.organization_id=m.organization_id and a.user_id=m.user_id
 where m.organization_id=p_org and m.user_id=p_user and m.status='active'
 ),false);
$$;
revoke all on function private.internal_chat_member_permission(uuid,uuid,text) from public,anon,authenticated;
create or replace function private.internal_chat_allowed(p_org uuid,p_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and private.employee_crm_access_now(p_org)
 and p_key in ('internal_chat.use','internal_chat.call','internal_chat.groups.create','internal_chat.groups.manage','internal_chat.attachments.send','internal_chat.metrics.view','internal_chat.settings.manage')
 and private.internal_chat_member_permission(p_org,(select auth.uid()),'internal_chat.use')
 and (p_key='internal_chat.use' or private.internal_chat_member_permission(p_org,(select auth.uid()),p_key));
$$;
create or replace function private.internal_chat_recipient_active(p_org uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.internal_chat_allowed(p_org,'internal_chat.use')
 and private.internal_chat_member_permission(p_org,p_user,'internal_chat.use');
$$;
create function public.internal_chat_my_permissions_v1(p_org uuid)
returns text[] language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(k order by k),array[]::text[]) from unnest(array['internal_chat.use','internal_chat.call','internal_chat.groups.create','internal_chat.groups.manage','internal_chat.attachments.send','internal_chat.metrics.view','internal_chat.settings.manage']::text[]) k
 where private.internal_chat_allowed(p_org,k);
$$;
revoke all on function public.internal_chat_my_permissions_v1(uuid) from public,anon;
grant execute on function public.internal_chat_my_permissions_v1(uuid) to authenticated;

-- Editing these profiles is reserved to existing CRM role administrators.
-- Granting chat manager does not grant CRM role administration.
create function private.internal_chat_role_admin(p_org uuid,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_organization_permission(p_org,'roles.view')
 and (private.has_organization_permission(p_org,'roles.permissions.manage') or
 (not p_write and private.has_organization_permission(p_org,'roles.details.view')));
$$;
revoke all on function private.internal_chat_role_admin(uuid,boolean) from public,anon,authenticated;
create function private.internal_chat_role_admin_data(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.internal_chat_role_admin(p_org,false) then raise exception 'Sem permissão' using errcode='42501';end if;
 return jsonb_build_object('operator',private.internal_chat_template_keys(p_org,'operator'),'manager',private.internal_chat_template_keys(p_org,'manager'),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'full_name',coalesce(nullif(p.full_name,''),'Funcionário'),'crm_role',r.name,'chat_role',a.role_key) order by p.full_name,m.user_id)
 from public.organization_members m join public.profiles p on p.id=m.user_id and p.is_active
 left join public.roles r on r.id=m.role_id and r.organization_id=p_org
 left join private.internal_chat_role_assignments a on a.organization_id=m.organization_id and a.user_id=m.user_id
 where m.organization_id=p_org and m.status='active'),'[]'::jsonb));
end;
$$;
revoke all on function private.internal_chat_role_admin_data(uuid) from public,anon;
grant execute on function private.internal_chat_role_admin_data(uuid) to authenticated;
create function public.internal_chat_role_admin_data_v1(p_org uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select private.internal_chat_role_admin_data(p_org);$$;
revoke all on function public.internal_chat_role_admin_data_v1(uuid) from public,anon;
grant execute on function public.internal_chat_role_admin_data_v1(uuid) to authenticated;
create function private.internal_chat_save_template(p_org uuid,p_role text,p_keys text[])
returns void language plpgsql security definer set search_path='' as $$
declare v_peer uuid; v_keys text[];
begin
 if not private.internal_chat_role_admin(p_org,true) then raise exception 'Sem permissão' using errcode='42501';end if;
 if p_role not in ('operator','manager') or p_role is null or p_keys is null or array_position(p_keys,null) is not null then raise exception 'Perfil inválido' using errcode='22023';end if;
 select coalesce(array_agg(distinct k order by k),array[]::text[]) into v_keys from unnest(p_keys) k;
 insert into private.internal_chat_role_templates(organization_id,role_key,permission_keys) values(p_org,p_role,v_keys)
 on conflict(organization_id,role_key) do update set permission_keys=excluded.permission_keys;
 for v_peer in select user_id from private.internal_chat_role_assignments where organization_id=p_org and role_key=p_role loop
  perform realtime.send(jsonb_build_object('chat_permissions',true),'changed','internal-chat:'||p_org::text||':'||v_peer::text,true);
 end loop;
end;
$$;
revoke all on function private.internal_chat_save_template(uuid,text,text[]) from public,anon;
grant execute on function private.internal_chat_save_template(uuid,text,text[]) to authenticated;
create function public.internal_chat_save_template_v1(p_org uuid,p_role text,p_keys text[])
returns void language sql security invoker set search_path='' as $$select private.internal_chat_save_template(p_org,p_role,p_keys);$$;
revoke all on function public.internal_chat_save_template_v1(uuid,text,text[]) from public,anon;
grant execute on function public.internal_chat_save_template_v1(uuid,text,text[]) to authenticated;
create function private.internal_chat_assign_role(p_org uuid,p_user uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.internal_chat_role_admin(p_org,true) then raise exception 'Sem permissão' using errcode='42501';end if;
 if not exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id and p.is_active where m.organization_id=p_org and m.user_id=p_user and m.status='active') then raise exception 'Funcionário indisponível' using errcode='42501';end if;
 if p_role is null then
  delete from private.internal_chat_role_assignments where organization_id=p_org and user_id=p_user;
 elsif p_role in ('operator','manager') then
  insert into private.internal_chat_role_assignments(organization_id,user_id,role_key) values(p_org,p_user,p_role)
  on conflict(organization_id,user_id) do update set role_key=excluded.role_key;
 else raise exception 'Perfil inválido' using errcode='22023';end if;
 perform realtime.send(jsonb_build_object('chat_permissions',true),'changed','internal-chat:'||p_org::text||':'||p_user::text,true);
end;
$$;
revoke all on function private.internal_chat_assign_role(uuid,uuid,text) from public,anon;
grant execute on function private.internal_chat_assign_role(uuid,uuid,text) to authenticated;
create function public.internal_chat_assign_role_v1(p_org uuid,p_user uuid,p_role text)
returns void language sql security invoker set search_path='' as $$select private.internal_chat_assign_role(p_org,p_user,p_role);$$;
revoke all on function public.internal_chat_assign_role_v1(uuid,uuid,text) from public,anon;
grant execute on function public.internal_chat_assign_role_v1(uuid,uuid,text) to authenticated;
-- Keep the existing settings RPC, changing only its chat-specific permission gate.
do $patch$
declare original text; modified text;
begin
 select pg_get_functiondef('private.internal_chat_settings_save(uuid,jsonb)'::regprocedure) into original;
 modified:=replace(original,'private.has_organization_permission(p_org,''internal_chat.settings.manage'')','private.internal_chat_allowed(p_org,''internal_chat.settings.manage'')');
 if modified=original then raise exception 'Chat settings authorization changed; inspect before applying';end if;
 execute modified;
end;
$patch$;
commit;
