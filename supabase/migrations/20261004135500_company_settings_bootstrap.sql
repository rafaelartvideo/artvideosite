begin;

create or replace function public.load_company_settings_v1(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'company', to_jsonb(company),
    'organization_settings', coalesce(organization.settings, '{}'::jsonb)
  )
  from public.organizations organization
  left join public.organization_company_settings company
    on company.organization_id = organization.id
  where organization.id = p_organization_id
  limit 1;
$$;

revoke all on function public.load_company_settings_v1(uuid) from public, anon;
grant execute on function public.load_company_settings_v1(uuid) to authenticated;

do $$
begin
  if to_regclass('public.organization_company_settings') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'organization_company_settings'
     ) then
    alter publication supabase_realtime add table public.organization_company_settings;
  end if;
end
$$;

commit;
