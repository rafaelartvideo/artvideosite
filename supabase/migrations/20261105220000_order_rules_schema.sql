begin;
create table if not exists public.organization_order_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('company','service_type','equipment_type','combination')),
  service_type_id uuid,
  equipment_type_id uuid,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules)='object'),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_rule_scope_check check (
    (scope='company' and service_type_id is null and equipment_type_id is null)
    or (scope='service_type' and service_type_id is not null and equipment_type_id is null)
    or (scope='equipment_type' and service_type_id is null and equipment_type_id is not null)
    or (scope='combination' and service_type_id is not null and equipment_type_id is not null)
  ),
  unique nulls not distinct (organization_id,scope,service_type_id,equipment_type_id)
);
create index if not exists organization_order_rules_org_idx on public.organization_order_rules(organization_id,scope);
alter table public.organization_order_rules enable row level security;
revoke all on public.organization_order_rules from public,anon,authenticated;
grant select,insert,update,delete on public.organization_order_rules to authenticated;
create policy organization_order_rules_read on public.organization_order_rules for select to authenticated
  using (private.has_effective_organization_permission(organization_id,'orders.view')
    or private.has_effective_organization_permission(organization_id,'orders.create')
    or private.has_effective_organization_permission(organization_id,'orders.edit')
    or private.has_effective_organization_permission(organization_id,'settings.view')
    or private.has_effective_organization_permission(organization_id,'settings.update'));
create policy organization_order_rules_insert on public.organization_order_rules for insert to authenticated
  with check (private.has_effective_organization_permission(organization_id,'settings.update'));
create policy organization_order_rules_update on public.organization_order_rules for update to authenticated
  using (private.has_effective_organization_permission(organization_id,'settings.update'))
  with check (private.has_effective_organization_permission(organization_id,'settings.update'));
create policy organization_order_rules_delete on public.organization_order_rules for delete to authenticated
  using (private.has_effective_organization_permission(organization_id,'settings.update'));
alter table public.service_orders add column if not exists order_rules_snapshot jsonb;
alter table public.service_orders add column if not exists custom_field_values jsonb not null default '{}'::jsonb;
commit;