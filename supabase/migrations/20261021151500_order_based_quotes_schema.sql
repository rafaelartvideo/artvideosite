begin;
alter table public.service_types add column if not exists quote_workflow_enabled boolean not null default false;
update public.service_types set quote_workflow_enabled=true where lower(trim(title)) in ('orçamento','orçamentos');

create table public.service_order_quote_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  service_order_id uuid not null unique references public.service_orders(id) on delete cascade,
  status text not null default 'draft' check(status in ('draft','awaiting_approval','approved','rejected','renegotiation')),
  version integer not null default 1 check(version>0),
  diagnosis text not null default '',
  proposed_solution text not null default '',
  commercial_conditions text not null default '',
  valid_until date,
  items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array'),
  discount_type text not null default 'amount' check(discount_type in ('amount','percentage')),
  discount_value numeric(14,2) not null default 0 check(discount_value>=0),
  versions jsonb not null default '[]'::jsonb check(jsonb_typeof(versions)='array'),
  rejection_reason text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_order_quote_proposals_org_idx on public.service_order_quote_proposals(organization_id,created_at desc);
alter table public.service_order_quote_proposals enable row level security;
create policy order_quote_view on public.service_order_quote_proposals for select to authenticated using (
  private.is_organization_member(organization_id) and private.is_organization_module_enabled(organization_id,'orders')
  and private.has_effective_organization_permission(organization_id,'orders.view')
  and private.can_view_service_order(service_order_id)
);
create policy order_quote_create on public.service_order_quote_proposals for insert to authenticated with check (
  private.is_organization_member(organization_id) and private.is_organization_module_enabled(organization_id,'orders')
  and (private.has_effective_organization_permission(organization_id,'orders.edit') or private.has_effective_organization_permission(organization_id,'orders.update'))
  and private.can_view_service_order(service_order_id)
  and exists (select 1 from public.service_orders os join public.service_types st on st.id=os.service_type_id
    where os.id=service_order_quote_proposals.service_order_id and os.organization_id=service_order_quote_proposals.organization_id and st.organization_id=os.organization_id and st.quote_workflow_enabled)
);
create policy order_quote_edit on public.service_order_quote_proposals for update to authenticated using (
  private.is_organization_member(organization_id) and private.is_organization_module_enabled(organization_id,'orders')
  and (private.has_effective_organization_permission(organization_id,'orders.edit') or private.has_effective_organization_permission(organization_id,'orders.update'))
  and private.can_view_service_order(service_order_id)
) with check (
  private.is_organization_member(organization_id) and private.is_organization_module_enabled(organization_id,'orders')
  and (private.has_effective_organization_permission(organization_id,'orders.edit') or private.has_effective_organization_permission(organization_id,'orders.update'))
  and private.can_view_service_order(service_order_id)
);
grant select,insert,update on public.service_order_quote_proposals to authenticated;

create table public.service_order_quote_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check(length(btrim(body))>0 and length(body)<=4000),
  created_at timestamptz not null default now()
);
create index service_order_quote_comments_list on public.service_order_quote_comments(organization_id,service_order_id,created_at desc);
alter table public.service_order_quote_comments enable row level security;
create policy order_quote_comments_read on public.service_order_quote_comments for select to authenticated using (
  private.is_organization_member(organization_id) and private.is_organization_module_enabled(organization_id,'orders')
  and private.has_effective_organization_permission(organization_id,'orders.view')
  and private.can_view_service_order(service_order_id)
);
create policy order_quote_comments_add on public.service_order_quote_comments for insert to authenticated with check (
  author_id=auth.uid()
  and private.is_organization_member(organization_id) and private.is_organization_module_enabled(organization_id,'orders')
  and (private.has_effective_organization_permission(organization_id,'orders.edit') or private.has_effective_organization_permission(organization_id,'orders.update'))
  and private.can_view_service_order(service_order_id)
  and exists (select 1 from public.service_orders os join public.service_types st on st.id=os.service_type_id
    where os.id=service_order_quote_comments.service_order_id and os.organization_id=service_order_quote_comments.organization_id and st.organization_id=os.organization_id and st.quote_workflow_enabled)
);
grant select,insert on public.service_order_quote_comments to authenticated;
commit;