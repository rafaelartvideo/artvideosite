begin;
create function private.internal_chat_directory_profiles(p_org uuid)
returns table(user_id uuid,full_name text,function_name text,role_name text)
language sql stable security definer set search_path='' as $$
 select d.user_id,d.full_name,e.function_name,r.name
 from private.internal_chat_directory(p_org) d
 join public.organization_members m on m.organization_id=p_org and m.user_id=d.user_id and m.status='active'
 left join public.roles r on r.id=m.role_id and r.organization_id=p_org and r.is_active
 left join lateral (
  select nullif(btrim(emp.function_name),'') as function_name
  from public.employees emp where emp.organization_id=p_org and emp.profile_id=d.user_id and emp.is_active
  order by emp.updated_at desc,emp.id limit 1
 ) e on true
 order by d.full_name,d.user_id;
$$;
revoke all on function private.internal_chat_directory_profiles(uuid) from public,anon;
grant execute on function private.internal_chat_directory_profiles(uuid) to authenticated;
create function public.internal_chat_directory_v2(p_org uuid)
returns table(user_id uuid,full_name text,function_name text,role_name text)
language sql stable security invoker set search_path='' as $$ select * from private.internal_chat_directory_profiles(p_org); $$;
revoke all on function public.internal_chat_directory_v2(uuid) from public,anon;
grant execute on function public.internal_chat_directory_v2(uuid) to authenticated;
commit;
