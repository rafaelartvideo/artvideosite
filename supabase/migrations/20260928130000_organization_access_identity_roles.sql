create or replace function public.my_organizations_v2()
returns table (
  organization_id uuid,
  organization_name text,
  legal_name text,
  slug text,
  organization_type text,
  organization_status text,
  parent_organization_id uuid,
  membership_id uuid,
  membership_organization_id uuid,
  role_id uuid,
  is_owner boolean,
  is_direct_member boolean,
  enabled_modules text[],
  is_platform_operator boolean,
  is_artvideo_tenant boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    access.organization_id,
    access.organization_name,
    access.legal_name,
    access.slug,
    access.organization_type,
    access.organization_status,
    access.parent_organization_id,
    access.membership_id,
    access.membership_organization_id,
    access.role_id,
    access.is_owner,
    access.is_direct_member,
    access.enabled_modules,
    private.is_platform_organization(access.organization_id) as is_platform_operator,
    private.is_artvideo_site_organization(access.organization_id) as is_artvideo_tenant
  from public.my_organizations() access;
$$;

revoke all on function public.my_organizations_v2() from public;
grant execute on function public.my_organizations_v2() to authenticated;

comment on function public.my_organizations_v2()
is 'Contexto de organizações do usuário com papéis explícitos de operadora Union World e tenant ArtVideo.';
