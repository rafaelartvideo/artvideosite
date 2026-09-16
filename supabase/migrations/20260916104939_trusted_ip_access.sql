alter table public.profiles
  add column if not exists restrict_by_ip boolean not null default false,
  add column if not exists allowed_ips inet[] not null default '{}'::inet[];

update public.profiles
set
  restrict_by_ip = true,
  allowed_ips = array['189.15.10.214'::inet],
  updated_at = timezone('utc'::text, now());

alter table public.profiles
  drop constraint if exists profiles_restricted_ip_requires_allowlist;

alter table public.profiles
  add constraint profiles_restricted_ip_requires_allowlist
  check (not restrict_by_ip or cardinality(allowed_ips) > 0);

comment on column public.profiles.restrict_by_ip is
  'Quando verdadeiro, o login e a restauração da sessão exigem um IP presente em allowed_ips.';

comment on column public.profiles.allowed_ips is
  'Lista de endereços IPv4/IPv6 públicos autorizados para o usuário.';

create or replace function public.is_profile_ip_allowed(
  p_profile_id uuid,
  p_client_ip text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_restrict_by_ip boolean;
  v_allowed_ips inet[];
  v_client_ip inet;
begin
  select profile.restrict_by_ip, profile.allowed_ips
  into v_restrict_by_ip, v_allowed_ips
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.is_active is not false;

  if not found then
    return false;
  end if;

  if not v_restrict_by_ip then
    return true;
  end if;

  begin
    v_client_ip := nullif(btrim(p_client_ip), '')::inet;
  exception
    when invalid_text_representation then
      return false;
  end;

  return v_client_ip = any(v_allowed_ips);
end;
$$;

revoke all on function public.is_profile_ip_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.is_profile_ip_allowed(uuid, text) to service_role;
