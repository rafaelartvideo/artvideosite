insert into public.organization_modules (
  organization_id,
  module_key,
  is_enabled,
  limits,
  settings,
  enabled_at,
  updated_at
)
values (
  public.platform_operator_organization_id(),
  'employees',
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (organization_id, module_key) do update
set
  is_enabled = true,
  enabled_at = coalesce(public.organization_modules.enabled_at, now()),
  updated_at = now();
