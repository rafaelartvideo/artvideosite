begin;

alter table public.quote_requests
  add column if not exists origin text not null default 'site',
  add column if not exists issue_reported text,
  add column if not exists diagnosis text,
  add column if not exists proposed_solution text,
  add column if not exists internal_notes text,
  add column if not exists equipment_name text,
  add column if not exists equipment_brand text,
  add column if not exists equipment_model text,
  add column if not exists serial_number text,
  add column if not exists accessories text,
  add column if not exists equipment_condition text,
  add column if not exists valid_until date,
  add column if not exists discount_type text not null default 'amount',
  add column if not exists discount_value numeric(14,2) not null default 0;

alter table public.quote_requests
  drop constraint if exists quote_requests_origin_check;
alter table public.quote_requests
  add constraint quote_requests_origin_check check (origin in ('site', 'internal'));
alter table public.quote_requests
  drop constraint if exists quote_requests_discount_value_check;
alter table public.quote_requests
  add constraint quote_requests_discount_value_check check (discount_value >= 0);
alter table public.quote_requests
  drop constraint if exists quote_requests_discount_type_check;
alter table public.quote_requests
  add constraint quote_requests_discount_type_check check (discount_type in ('amount','percentage'));

create sequence if not exists public.internal_quote_number_seq start with 1 increment by 1;
create or replace function private.assign_internal_quote_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.origin = 'internal' and (new.protocol is null or btrim(new.protocol) = '') then
    new.protocol := 'ORC-' || lpad(nextval('public.internal_quote_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
revoke all on function private.assign_internal_quote_number() from public, anon, authenticated;
drop trigger if exists quote_requests_assign_internal_number on public.quote_requests;
create trigger quote_requests_assign_internal_number
before insert on public.quote_requests
for each row execute function private.assign_internal_quote_number();

create table if not exists public.quote_commercial_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_type text not null check (item_type in ('product','service','custom_service')),
  general_service_id uuid references public.general_services(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  title_snapshot text not null check (length(btrim(title_snapshot)) > 0),
  description_snapshot text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  additional_cost numeric(14,2) not null default 0 check (additional_cost >= 0),
  subtotal numeric(14,2) generated always as ((quantity * unit_price) + additional_cost) stored,
  created_at timestamptz not null default now()
);
create index if not exists quote_commercial_items_lookup_idx on public.quote_commercial_items(organization_id, quote_request_id, created_at);

create table if not exists public.quote_comments (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists quote_comments_lookup_idx on public.quote_comments(organization_id, quote_request_id, created_at);

alter table public.quote_commercial_items enable row level security;
alter table public.quote_comments enable row level security;

drop policy if exists quote_commercial_items_read on public.quote_commercial_items;
create policy quote_commercial_items_read on public.quote_commercial_items for select to authenticated
using (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','read')
  and private.has_effective_organization_permission(organization_id,'quotes.view')
  and exists (select 1 from public.quote_requests q where q.id = quote_request_id and q.organization_id = organization_id)
);
drop policy if exists quote_commercial_items_manage on public.quote_commercial_items;
create policy quote_commercial_items_manage on public.quote_commercial_items for all to authenticated
using (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','manage')
  and (private.has_effective_organization_permission(organization_id,'quotes.edit') or private.has_effective_organization_permission(organization_id,'quotes.update'))
  and exists (select 1 from public.quote_requests q where q.id = quote_request_id and q.organization_id = organization_id)
)
with check (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','manage')
  and (private.has_effective_organization_permission(organization_id,'quotes.create') or private.has_effective_organization_permission(organization_id,'quotes.edit') or private.has_effective_organization_permission(organization_id,'quotes.update'))
  and exists (select 1 from public.quote_requests q where q.id = quote_request_id and q.organization_id = organization_id)
);

drop policy if exists quote_comments_read on public.quote_comments;
create policy quote_comments_read on public.quote_comments for select to authenticated
using (
  private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','read')
  and private.has_effective_organization_permission(organization_id,'quotes.view')
  and exists (select 1 from public.quote_requests q where q.id = quote_request_id and q.organization_id = organization_id)
);
drop policy if exists quote_comments_insert on public.quote_comments;
create policy quote_comments_insert on public.quote_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.is_organization_module_enabled(organization_id,'quotes')
  and private.can_access_shared_organization_resource(organization_id,'quotes','manage')
  and (private.has_effective_organization_permission(organization_id,'quotes.create') or private.has_effective_organization_permission(organization_id,'quotes.edit') or private.has_effective_organization_permission(organization_id,'quotes.update'))
  and exists (select 1 from public.quote_requests q where q.id = quote_request_id and q.organization_id = organization_id)
);
grant select,insert,update,delete on public.quote_commercial_items to authenticated;
grant select,insert on public.quote_comments to authenticated;

insert into public.request_statuses(id, organization_id, name, slug, color, sort_order, is_final)
select gen_random_uuid(), tenant.organization_id, state.name, state.slug, state.color, state.sort_order, false
from (select distinct organization_id from public.request_statuses) tenant
cross join (values
  ('Rascunho','RASCUNHO','#64748B',-1),
  ('Aguardando aprovação','AGUARDANDO_APROVACAO','#F59E0B',30),
  ('Reprovado','REPROVADO','#EF4444',50),
  ('Em renegociação','RENEGOCIACAO','#3B82F6',60)
) state(name,slug,color,sort_order)
where not exists (
  select 1 from public.request_statuses r
  where r.organization_id = tenant.organization_id and r.slug = state.slug
);

commit;