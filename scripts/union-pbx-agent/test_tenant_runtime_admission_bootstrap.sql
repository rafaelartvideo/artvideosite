-- Disposable PG14+ bootstrap for the PBX migration test. NEVER run on an existing database.
-- Non-PBX core table DDL, constraints/indexes and authorization function bodies
-- exported read-only from Supabase catalogs on 2026-11-10. No customer rows.
-- auth.users/profiles are identity shells only; their unrelated account columns,
-- and unrelated business triggers/policies, are intentionally outside this fixture.
-- Real PBX tables/policies/grants/triggers come from the historical migrations.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
grant usage on schema public,auth to anon,authenticated,service_role;
grant usage on schema private to authenticated;
-- Match postgres-owned public-object default ACLs read from pg_default_acl.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key references auth.users(id),created_at timestamptz not null default now());
create table public.employees(
id uuid default gen_random_uuid() not null,
profile_id uuid,
full_name text not null,
cpf text not null,
phone text,
function_name text not null,
is_active boolean default true not null,
created_at timestamp with time zone default timezone('utc'::text, now()) not null,
updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
role_id uuid,
organization_id uuid not null,
uniq_subscriber_id text,
field_tracking_prompt_on_login boolean default false not null,
disable_inactivity_logout boolean default false not null
);

create table public.organization_members(
id uuid default gen_random_uuid() not null,
organization_id uuid not null,
user_id uuid not null,
role_id uuid,
status text default 'active'::text not null,
is_owner boolean default false not null,
joined_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null
);

create table public.organization_modules(
organization_id uuid not null,
module_key text not null,
is_enabled boolean default true not null,
limits jsonb default '{}'::jsonb not null,
settings jsonb default '{}'::jsonb not null,
enabled_by uuid,
enabled_at timestamp with time zone,
updated_at timestamp with time zone default now() not null
);

create table public.organizations(
id uuid default gen_random_uuid() not null,
parent_organization_id uuid,
organization_type text default 'partner'::text not null,
name text not null,
legal_name text,
document text,
slug text not null,
logo_url text,
status text default 'active'::text not null,
settings jsonb default '{}'::jsonb not null,
created_by uuid,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null
);

create table public.permissions(
id uuid default gen_random_uuid() not null,
key text not null,
description text,
created_at timestamp with time zone default timezone('utc'::text, now()) not null,
label text,
module_name text,
sort_order integer default 0 not null
);

create table public.role_permissions(
role_id uuid not null,
permission_id uuid not null,
created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.roles(
id uuid default gen_random_uuid() not null,
name text not null,
description text,
is_active boolean default true not null,
created_at timestamp with time zone default timezone('utc'::text, now()) not null,
is_system boolean default false not null,
sort_order integer default 0 not null,
organization_id uuid not null
);

create table public.system_modules(
key text not null,
name text not null,
description text,
category text not null,
sort_order integer default 0 not null,
is_active boolean default true not null,
created_at timestamp with time zone default now() not null
);

create table public.user_permission_overrides(
id uuid default gen_random_uuid() not null,
organization_id uuid not null,
user_id uuid not null,
permission_id uuid not null,
created_at timestamp with time zone default now() not null,
created_by uuid default auth.uid(),
is_allowed boolean default true not null
);
CREATE OR REPLACE FUNCTION public.artvideo_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id
  from public.organizations
  where coalesce(settings ->> 'is_artvideo_tenant', 'false') = 'true'
    and status = 'active'
  order by created_at asc, id asc
  limit 1
$function$
;
alter table public.employees add constraint employees_uniq_subscriber_artvideo_only CHECK (((uniq_subscriber_id IS NULL) OR (organization_id = artvideo_organization_id())));
alter table public.employees add constraint employees_pkey PRIMARY KEY (id);
alter table public.organization_members add constraint organization_members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'blocked'::text])));
alter table public.organization_members add constraint organization_members_pkey PRIMARY KEY (id);
alter table public.organization_members add constraint organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);
alter table public.organization_modules add constraint organization_modules_pkey PRIMARY KEY (organization_id, module_key);
alter table public.organizations add constraint organizations_no_hierarchy_check CHECK ((parent_organization_id IS NULL));
alter table public.organizations add constraint organizations_organization_type_check CHECK ((organization_type = ANY (ARRAY['parent'::text, 'partner'::text])));
alter table public.organizations add constraint organizations_parent_not_self CHECK (((parent_organization_id IS NULL) OR (parent_organization_id <> id)));
alter table public.organizations add constraint organizations_slug_format CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
alter table public.organizations add constraint organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'cancelled'::text])));
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table public.permissions add constraint permissions_pkey PRIMARY KEY (id);
alter table public.permissions add constraint permissions_key_key UNIQUE (key);
alter table public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (role_id, permission_id);
alter table public.roles add constraint roles_pkey PRIMARY KEY (id);
alter table public.roles add constraint roles_organization_name_key UNIQUE (organization_id, name);
alter table public.system_modules add constraint system_modules_category_check CHECK ((category = ANY (ARRAY['management'::text, 'operation'::text, 'site'::text])));
alter table public.system_modules add constraint system_modules_pkey PRIMARY KEY (key);
alter table public.user_permission_overrides add constraint user_permission_overrides_pkey PRIMARY KEY (id);
alter table public.user_permission_overrides add constraint user_permission_overrides_unique UNIQUE (organization_id, user_id, permission_id);
alter table public.employees add constraint employees_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.employees add constraint employees_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.employees add constraint employees_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
alter table public.organization_members add constraint organization_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.organization_members add constraint organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.organization_members add constraint organization_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
alter table public.organization_members add constraint organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.organization_modules add constraint organization_modules_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.organization_modules add constraint organization_modules_module_key_fkey FOREIGN KEY (module_key) REFERENCES system_modules(key) ON DELETE RESTRICT;
alter table public.organization_modules add constraint organization_modules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.organizations add constraint organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.organizations add constraint organizations_parent_organization_id_fkey FOREIGN KEY (parent_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

alter table public.role_permissions add constraint role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
alter table public.role_permissions add constraint role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
alter table public.roles add constraint roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

alter table public.user_permission_overrides add constraint user_permission_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.user_permission_overrides add constraint user_permission_overrides_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
alter table public.user_permission_overrides add constraint user_permission_overrides_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id);
alter table public.user_permission_overrides add constraint user_permission_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
CREATE UNIQUE INDEX employees_organization_cpf_unique ON public.employees USING btree (organization_id, cpf) WHERE ((cpf IS NOT NULL) AND (btrim(cpf) <> ''::text));
CREATE INDEX idx_employees_full_name ON public.employees USING btree (full_name);
CREATE INDEX employees_org_active_full_name_idx ON public.employees USING btree (organization_id, is_active, full_name);
CREATE INDEX idx_employees_role_id ON public.employees USING btree (role_id);
CREATE INDEX idx_employees_profile_id ON public.employees USING btree (profile_id);
CREATE INDEX employees_org_profile_id_idx ON public.employees USING btree (organization_id, profile_id, id) WHERE (profile_id IS NOT NULL);
CREATE INDEX employees_uniq_subscriber_idx ON public.employees USING btree (organization_id, uniq_subscriber_id) WHERE (uniq_subscriber_id IS NOT NULL);
CREATE INDEX employees_field_tracking_prompt_idx ON public.employees USING btree (organization_id, profile_id) WHERE (field_tracking_prompt_on_login AND is_active AND (profile_id IS NOT NULL));
CREATE INDEX idx_employees_is_active ON public.employees USING btree (is_active);
CREATE INDEX employees_organization_id_idx ON public.employees USING btree (organization_id);
CREATE INDEX idx_employees_function_name ON public.employees USING btree (function_name);
alter table public.employees enable row level security;
CREATE INDEX organization_members_user_idx ON public.organization_members USING btree (user_id, status, organization_id);
CREATE INDEX organization_members_org_idx ON public.organization_members USING btree (organization_id, status, role_id);
alter table public.organization_members enable row level security;

alter table public.organization_modules enable row level security;
CREATE UNIQUE INDEX organizations_slug_unique_idx ON public.organizations USING btree (lower(slug));
CREATE UNIQUE INDEX organizations_single_active_platform_operator ON public.organizations USING btree ((1)) WHERE ((status = 'active'::text) AND (COALESCE((settings ->> 'is_platform_operator'::text), 'false'::text) = 'true'::text));
CREATE UNIQUE INDEX organizations_single_active_artvideo_tenant ON public.organizations USING btree ((1)) WHERE ((status = 'active'::text) AND (COALESCE((settings ->> 'is_artvideo_tenant'::text), 'false'::text) = 'true'::text));
CREATE UNIQUE INDEX organizations_document_unique_idx ON public.organizations USING btree (regexp_replace(document, '[^0-9]'::text, ''::text, 'g'::text)) WHERE ((document IS NOT NULL) AND (regexp_replace(document, '[^0-9]'::text, ''::text, 'g'::text) <> ''::text));
CREATE INDEX organizations_parent_idx ON public.organizations USING btree (parent_organization_id, status);
alter table public.organizations enable row level security;
CREATE INDEX idx_permissions_module_name ON public.permissions USING btree (module_name);
alter table public.permissions enable row level security;
CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions USING btree (permission_id);
CREATE INDEX idx_role_permissions_role_id ON public.role_permissions USING btree (role_id);
alter table public.role_permissions enable row level security;
CREATE INDEX roles_organization_id_idx ON public.roles USING btree (organization_id);
alter table public.roles enable row level security;

alter table public.system_modules enable row level security;
CREATE INDEX user_permission_overrides_permission_idx ON public.user_permission_overrides USING btree (permission_id);
CREATE INDEX user_permission_overrides_org_user_idx ON public.user_permission_overrides USING btree (organization_id, user_id);
alter table public.user_permission_overrides enable row level security;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
;

CREATE OR REPLACE FUNCTION private.is_artvideo_only_permission_key(p_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select
    p_key like 'products.%'
    or p_key like 'categories.%'
    or p_key like 'brands.%'
    or p_key like 'services.%'
    or p_key like 'filters.%'
    or p_key like 'site.%'
    or p_key like 'site_settings.%'
    or p_key like 'contact.%'
    or p_key in ('tools.sac_digital.use', 'tools.uniq.use');
$function$
;

CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$
;

CREATE OR REPLACE FUNCTION private.has_organization_permission(p_organization_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with permission_context as materialized (
    select
      (select auth.uid()) as user_id,
      permission.id as permission_id
    from public.permissions permission
    where permission.key = p_permission_key
    limit 1
  )
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    cross join permission_context context
    where member.organization_id = p_organization_id
      and member.user_id = context.user_id
      and member.status = 'active'
      and organization.status = 'active'
      and not exists (
        select 1 from public.user_permission_overrides denied
        where denied.organization_id=member.organization_id and denied.user_id=member.user_id
          and denied.permission_id=context.permission_id and denied.is_allowed=false
      )
      and (
        exists (
          select 1
          from public.role_permissions role_permission
          where role_permission.role_id = member.role_id
            and role_permission.permission_id = context.permission_id
        )
        or exists (
          select 1
          from public.user_permission_overrides override_permission
          where override_permission.organization_id = member.organization_id
            and override_permission.user_id = member.user_id
            and override_permission.permission_id = context.permission_id
            and override_permission.is_allowed = true
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_platform_organization(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and coalesce(organization.settings ->> 'is_platform_operator', 'false') = 'true'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_platform_only_permission_key(p_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select
    (p_key like 'organizations.%' and p_key <> 'organizations.audit.view')
    or p_key like 'integrations.%'
    or p_key like 'audit.%'
    or p_key like 'orders.monitor.%'
    or p_key like 'platform.%';
$function$
;

CREATE OR REPLACE FUNCTION private.permission_required_module_keys(p_key text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select case
 when p_key in ('notifications.view','notifications.personal.view','notifications.personal.receive') then array[]::text[]
 when p_key like 'notifications.orders.%' or p_key like 'notifications.technician.%' then array['orders']
 when p_key like 'notifications.customers.%' then array['customers']
 when p_key like 'notifications.quotes.%' then array['quotes']
 when p_key like 'notifications.agenda.%' then array['agenda']
 when p_key like 'notifications.work_items.%' then array['work_items']
 when p_key like 'notifications.inventory.%' then array['inventory','products']
 when p_key like 'notifications.pdv.%' then array['pdv']
 when p_key like 'notifications.finance.%' then array['finance']
 when p_key like 'notifications.site.%' then array['site_categories','site_brands','site_services','site_settings']
 when p_key like 'notifications.%' then array[]::text[]
 when p_key='organizations.audit.view' then array[]::text[]
 when p_key like 'dashboard.%' then array['dashboard']
 when p_key like 'customer_requests.%' or p_key like 'customers.requests.%' then array['customer_requests']
 when p_key like 'customers.%' or p_key like 'registrations.%' then array['customers']
 when p_key like 'employees.%' or p_key like 'roles.%' or p_key like 'users.%' then array['employees']
 when p_key like 'agenda.%' then array['agenda']
 when p_key like 'technician_panel.%' then array['orders']
 when p_key like 'field_tracking.%' then array['field_tracking']
 when p_key like 'inventory.%' or p_key like 'products.%' then array['inventory','products']
 when p_key like 'pdv.%' then array['pdv']
 when p_key like 'finance.%' then array['finance']
 when p_key like 'equipment.%' then array['equipment']
 when p_key like 'checklists.%' then array['checklists']
 when p_key like 'general_services.%' then array['services']
 when p_key like 'service_types.%' then array['service_types']
 when p_key like 'situations.%' then array['order_situations']
 when p_key like 'order_statuses.%' then array['order_statuses']
 when p_key like 'documents.%' then array['documents']
 when p_key like 'quotes.%' then array['quotes']
 when p_key like 'settings.%' or p_key like 'terms.%' then array['company_settings']
 when p_key like 'categories.%' then array['site_categories']
 when p_key like 'brands.%' then array['site_brands']
 when p_key like 'services.%' or p_key like 'filters.%' then array['site_services']
 when p_key like 'site_settings.%' or p_key like 'contact.%' then array['site_settings']
 when p_key like 'site.%' then array['site_categories','site_brands','site_services','site_settings']
 when p_key='tools.view' then array['field_tracking','queue','pbx','marketplace','ai','sac_digital']
 when p_key in ('tools.sac_digital.use','tools.uniq.use') then array[]::text[]
 when p_key like 'queue.%' then array['queue']
 when p_key like 'pbx.%' then array['pbx']
 when p_key like 'marketplace.%' then array['marketplace']
 when p_key like 'ai.%' then array['ai']
 when p_key like 'sac_digital.%' then array['sac_digital']
 when p_key like 'operation.%' then array[
   'customers','customer_requests','orders','agenda','inventory','products','equipment',
   'checklists','services','service_types','order_situations','order_statuses',
   'documents','quotes','employees','company_settings','finance','pdv'
 ]
 else array[split_part(p_key,'.',1)]
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_partner_role_permission_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_organization_id uuid;
  v_permission_key text;
begin
  select role.organization_id
    into v_organization_id
  from public.roles role
  where role.id = new.role_id;

  select permission.key
    into v_permission_key
  from public.permissions permission
  where permission.id = new.permission_id;

  if v_organization_id is null or v_permission_key is null then
    raise exception 'Função ou permissão inválida.'
      using errcode = '23503';
  end if;

  if not private.permission_belongs_to_organization(
    v_organization_id,
    v_permission_key
  ) then
    if private.is_artvideo_only_permission_key(v_permission_key) then
      raise exception 'Esta permissão é exclusiva da ArtVideo.'
        using errcode = '42501';
    end if;

    raise exception 'Esta permissão pertence a uma situação de outra empresa ou já removida.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.is_artvideo_site_organization(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and coalesce(organization.settings ->> 'is_artvideo_tenant', 'false') = 'true'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.permission_belongs_to_organization(p_organization_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_situation_text text;
  v_situation_id uuid;
  v_required_modules text[];
  v_is_platform boolean;
begin
  if p_organization_id is null or p_permission_key is null then
    return false;
  end if;

  v_is_platform := private.is_platform_organization(p_organization_id);

  if private.is_platform_only_permission_key(p_permission_key)
     and not v_is_platform then
    return false;
  end if;

  if private.is_artvideo_only_permission_key(p_permission_key)
     and not private.is_artvideo_site_organization(p_organization_id)
     and not (v_is_platform and p_permission_key = 'tools.uniq.use') then
    return false;
  end if;

  if not v_is_platform then
    v_required_modules := private.permission_required_module_keys(p_permission_key);

    if cardinality(v_required_modules) > 0
       and not exists (
         select 1
         from public.organization_modules organization_module
         where organization_module.organization_id = p_organization_id
           and organization_module.is_enabled
           and organization_module.module_key = any(v_required_modules)
       ) then
      return false;
    end if;
  end if;

  v_situation_text := substring(
    p_permission_key
    from '^orders\.images\.situation\.([0-9a-fA-F-]{36})\.upload$'
  );

  if v_situation_text is null then
    return true;
  end if;

  begin
    v_situation_id := v_situation_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.os_situations situation
    where situation.id = v_situation_id
      and situation.organization_id = p_organization_id
  );
end;
$function$
;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_platform_organization(uuid),private.has_organization_permission(uuid,text) to authenticated;
create trigger enforce_partner_role_permission_scope before insert or update of role_id,permission_id on public.role_permissions for each row execute function private.enforce_partner_role_permission_scope();
CREATE OR REPLACE FUNCTION private.enforce_partner_user_permission_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_permission_key text;
begin
  select permission.key
    into v_permission_key
  from public.permissions permission
  where permission.id = new.permission_id;

  if v_permission_key is null then
    raise exception 'Permissão inválida.'
      using errcode = '23503';
  end if;

  if not private.permission_belongs_to_organization(
    new.organization_id,
    v_permission_key
  ) then
    if private.is_artvideo_only_permission_key(v_permission_key) then
      raise exception 'Esta permissão é exclusiva da ArtVideo.'
        using errcode = '42501';
    end if;

    raise exception 'Esta permissão pertence a uma situação de outra empresa ou já removida.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$
;
revoke all on function private.enforce_partner_user_permission_scope() from public,anon,authenticated;
create trigger enforce_partner_user_permission_scope before insert or update of organization_id,permission_id on public.user_permission_overrides for each row execute function private.enforce_partner_user_permission_scope();
insert into auth.users values ('10000000-0000-4000-8000-000000000001');
insert into public.profiles(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.system_modules(key,name,category) values('pbx','PABX','operation');
insert into public.permissions(key,label,description,module_name,sort_order) values('pbx.view','PABX','PABX fixture','pbx',5020);
insert into public.permissions(key,label,description,module_name,sort_order) values('products.view','Produtos','Unrelated permission fixture','products',5010);
-- No platform organization is pre-created: historical seed statements affect no real rows.
