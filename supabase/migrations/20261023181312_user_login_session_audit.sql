-- Historico de entrada/saida do CRM usando sessoes reais do Supabase Auth.
create table if not exists public.user_login_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null,
  logged_out_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_login_sessions_order_chk check (logged_out_at is null or logged_out_at >= logged_in_at)
);
create index if not exists user_login_sessions_user_time_idx
  on public.user_login_sessions (user_id, logged_in_at desc);

alter table public.user_login_sessions enable row level security;
revoke all on table public.user_login_sessions from public, anon, authenticated;

create or replace function public.record_user_auth_activity(p_action text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_login_at timestamptz;
begin
  if v_user_id is null or p_action not in ('login', 'logout') then
    raise exception 'Ação não permitida' using errcode = '42501';
  end if;

  v_session_id := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  if v_session_id is null then
    raise exception 'Sessão não identificada' using errcode = '42501';
  end if;

  select s.created_at into v_login_at
  from auth.sessions s
  where s.id = v_session_id and s.user_id = v_user_id;

  if v_login_at is null then
    raise exception 'Sessão inválida' using errcode = '42501';
  end if;

  insert into public.user_login_sessions (session_id, user_id, logged_in_at)
  values (v_session_id, v_user_id, v_login_at)
  on conflict (session_id) do nothing;

  if p_action = 'logout' then
    update public.user_login_sessions
    set logged_out_at = greatest(clock_timestamp(), logged_in_at)
    where session_id = v_session_id and user_id = v_user_id and logged_out_at is null;
  end if;
end;
$function$;

revoke all on function public.record_user_auth_activity(text) from public, anon;
grant execute on function public.record_user_auth_activity(text) to authenticated;

create or replace function public.get_user_login_summary(
  p_organization_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
        limit 5
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_user_login_summary(uuid, uuid) from public, anon;
grant execute on function public.get_user_login_summary(uuid, uuid) to authenticated;

-- Historico preexistente de entrada; saidas anteriores nao sao recuperaveis.
insert into public.user_login_sessions (session_id, user_id, logged_in_at)
select s.id, s.user_id, s.created_at
from auth.sessions s
join public.profiles p on p.id = s.user_id
on conflict (session_id) do nothing;
