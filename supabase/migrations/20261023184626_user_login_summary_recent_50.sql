CREATE OR REPLACE FUNCTION public.get_user_login_summary(p_organization_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
    or p_organization_id is null
    or p_user_id is null
    or not (
      private.has_effective_organization_permission(p_organization_id, 'employees.view')
      or private.has_effective_organization_permission(p_organization_id, 'roles.view')
    )
    or not exists (
      select 1
      from public.organization_members member
      where member.organization_id = p_organization_id
        and member.user_id = p_user_id
    )
  then
    raise exception 'Sem permissão para consultar estes acessos'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'last_login_at', (
      select s.logged_in_at
      from public.user_login_sessions s
      where s.user_id = p_user_id
      order by s.logged_in_at desc
      limit 1
    ),
    'last_logout_at', (
      select s.logged_out_at
      from public.user_login_sessions s
      where s.user_id = p_user_id and s.logged_out_at is not null
      order by s.logged_out_at desc
      limit 1
    ),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'logged_in_at', recent.logged_in_at,
        'logged_out_at', recent.logged_out_at
      ) order by recent.logged_in_at desc)
      from (
        select s.logged_in_at, s.logged_out_at
        from public.user_login_sessions s
        where s.user_id = p_user_id
        order by s.logged_in_at desc
        limit 50
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_user_login_summary(uuid, uuid) from public, anon;
grant execute on function public.get_user_login_summary(uuid, uuid) to authenticated;
