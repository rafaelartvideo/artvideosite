create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  person_type text not null check (person_type in ('PF','PJ')),
  name text not null,
  legal_name text,
  trade_name text,
  document text,
  state_registration text,
  birth_date date,
  foundation_date date,
  phone text,
  whatsapp text,
  email text,
  is_active boolean not null default true,
  legacy_customer_id uuid unique references public.customers(id) on delete restrict,
  legacy_employee_id uuid unique references public.employees(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists entities_org_name_idx on public.entities(organization_id, name);

create table if not exists public.entity_roles (
  entity_id uuid not null references public.entities(id) on delete cascade,
  role text not null check (role in ('customer','employee','supplier')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (entity_id, role)
);

create table if not exists public.entity_employee_details (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  job_title text,
  team_name text,
  admission_date date,
  profile_id uuid references public.profiles(id) on delete set null,
  role_id uuid references public.roles(id) on delete set null,
  uniq_subscriber_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.entity_addresses (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  type text not null default 'Principal',
  zip_code text,
  state text,
  city text,
  neighborhood text,
  street text,
  number text,
  complement text,
  reference text,
  location_url text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  legacy_customer_address_id uuid unique references public.customer_addresses(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists entity_addresses_entity_idx on public.entity_addresses(entity_id);

create table if not exists public.entity_contacts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  job_title text,
  phone text,
  whatsapp text,
  email text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);