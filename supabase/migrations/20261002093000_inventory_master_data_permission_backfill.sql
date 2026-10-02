begin;

with source_grants as (
  select distinct override.organization_id,override.user_id,override.created_by
  from public.user_permission_overrides override
  join public.permissions permission on permission.id=override.permission_id
  where permission.key='inventory.view'
), targets as (
  select id
  from public.permissions
  where key in ('inventory.categories.view','inventory.brands.view')
)
insert into public.user_permission_overrides (
  organization_id,user_id,permission_id,created_by
)
select source_grants.organization_id,source_grants.user_id,targets.id,source_grants.created_by
from source_grants cross join targets
on conflict (organization_id,user_id,permission_id) do nothing;

with source_grants as (
  select distinct override.organization_id,override.user_id,override.created_by
  from public.user_permission_overrides override
  join public.permissions permission on permission.id=override.permission_id
  where permission.key in ('inventory.create','inventory.update')
), targets as (
  select id
  from public.permissions
  where key in ('inventory.categories.manage','inventory.brands.manage')
)
insert into public.user_permission_overrides (
  organization_id,user_id,permission_id,created_by
)
select source_grants.organization_id,source_grants.user_id,targets.id,source_grants.created_by
from source_grants cross join targets
on conflict (organization_id,user_id,permission_id) do nothing;

commit;