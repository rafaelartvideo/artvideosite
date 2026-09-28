-- Separa semanticamente a operadora Union World do tenant ArtVideo sem mover dados.
-- A instalação atual mantém ambos os papéis na organização raiz por compatibilidade.

update public.organizations
set
  settings = coalesce(settings, '{}'::jsonb)
    || jsonb_build_object(
      'platform_operator_code', 'unionworld',
      'platform_operator_name', 'Union World'
    )
    || case
      when lower(coalesce(slug, '')) = 'artvideo'
        or lower(coalesce(name, '')) = 'artvideo'
        or lower(coalesce(name, '')) = 'eletrônica artvideo'
      then jsonb_build_object('is_artvideo_tenant', true)
      else '{}'::jsonb
    end,
  updated_at = now()
where coalesce(settings ->> 'is_platform_operator', 'false') = 'true';

create or replace function public.platform_operator_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.organizations
  where coalesce(settings ->> 'is_platform_operator', 'false') = 'true'
    and status = 'active'
  order by created_at asc, id asc
  limit 1
$$;

create or replace function public.artvideo_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.organizations
  where coalesce(settings ->> 'is_artvideo_tenant', 'false') = 'true'
    and status = 'active'
  order by created_at asc, id asc
  limit 1
$$;

revoke all on function public.platform_operator_organization_id() from public;
revoke all on function public.artvideo_organization_id() from public;

grant execute on function public.platform_operator_organization_id() to authenticated, service_role;
grant execute on function public.artvideo_organization_id() to anon, authenticated, service_role;

comment on function public.platform_operator_organization_id()
is 'Retorna a organização que opera a plataforma Union World, identificada por organizations.settings.is_platform_operator.';

comment on function public.artvideo_organization_id()
is 'Retorna o tenant da Eletrônica ArtVideo, identificado por organizations.settings.is_artvideo_tenant.';
