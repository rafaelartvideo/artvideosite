begin;

select pg_advisory_xact_lock(hashtextextended('unionworld:crm_test_access', 0));

with union_org as (
  select id
  from public.organizations
  where slug = 'unionworld'
    and status = 'active'
  limit 1
)
insert into public.organization_modules (
  organization_id,
  module_key,
  is_enabled,
  limits,
  settings,
  enabled_at,
  updated_at
)
select
  union_org.id,
  module.key,
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from union_org
cross join public.system_modules module
where module.is_active = true
  and module.key not like 'site_%'
on conflict (organization_id, module_key) do update
set is_enabled = true,
    updated_at = now();

with union_org as (
  select id
  from public.organizations
  where slug = 'unionworld'
    and status = 'active'
  limit 1
),
union_gestor as (
  select role_row.id, role_row.organization_id
  from public.roles role_row
  join union_org on union_org.id = role_row.organization_id
  where role_row.name = 'Gestor'
    and role_row.is_active = true
  limit 1
)
insert into public.role_permissions (role_id, permission_id)
select
  union_gestor.id,
  permission.id
from union_gestor
cross join public.permissions permission
where private.permission_belongs_to_organization(
  union_gestor.organization_id,
  permission.key
)
on conflict (role_id, permission_id) do nothing;

commit;
