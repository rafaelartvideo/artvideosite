-- Fundação multiempresa (fase 1).
-- Cria o controle de organizações sem alterar o escopo das tabelas operacionais.
-- Todos os usuários existentes são associados à organização raiz ArtVideo.

begin;

create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  parent_organization_id uuid references public.organizations(id) on delete restrict,
  organization_type text not null default 'partner'
    check (organization_type in ('parent', 'partner')),
  name text not null,
  legal_name text,
  document text,
  slug text not null,
  logo_url text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'cancelled')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_parent_not_self
    check (parent_organization_id is null or parent_organization_id <> id),
  constraint organizations_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists organizations_slug_unique_idx
  on public.organizations (lower(slug));

create unique index if not exists organizations_document_unique_idx
  on public.organizations (regexp_replace(document, '[^0-9]', '', 'g'))
  where document is not null and regexp_replace(document, '[^0-9]', '', 'g') <> '';

create index if not exists organizations_parent_idx
  on public.organizations (parent_organization_id, status);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role_id uuid references public.roles(id) on delete set null,
  status text not null default 'active'
    check (status in ('invited', 'active', 'blocked')),
  is_owner boolean not null default false,
  joined_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id, status, organization_id);

create index if not exists organization_members_org_idx
  on public.organization_members (organization_id, status, role_id);

create table if not exists public.system_modules (
  key text primary key,
  name text not null,
  description text,
  category text not null check (category in ('management', 'operation', 'site')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_modules (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  module_key text not null references public.system_modules(key) on delete restrict,
  is_enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  enabled_by uuid references public.profiles(id) on delete set null,
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, module_key)
);

create table if not exists public.organization_data_shares (
  id uuid primary key default gen_random_uuid(),
  parent_organization_id uuid not null references public.organizations(id) on delete restrict,
  child_organization_id uuid not null references public.organizations(id) on delete restrict,
  resource_key text not null,
  access_level text not null default 'none'
    check (access_level in ('none', 'summary', 'read', 'manage')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_data_shares_distinct_orgs
    check (parent_organization_id <> child_organization_id),
  unique (parent_organization_id, child_organization_id, resource_key)
);

create index if not exists organization_data_shares_child_idx
  on public.organization_data_shares (child_organization_id, resource_key, access_level);

create table if not exists public.organization_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_audit_logs_org_date_idx
  on public.organization_audit_logs (organization_id, created_at desc);

insert into public.system_modules (key, name, description, category, sort_order)
values
  ('dashboard', 'Dashboard', 'Indicadores e visão geral da operação.', 'management', 10),
  ('customers', 'Clientes', 'Cadastro e gestão de clientes.', 'operation', 20),
  ('orders', 'Ordens de serviço', 'Fluxo completo de ordens de serviço.', 'operation', 30),
  ('agenda', 'Agenda', 'Agendamentos, visitas e retornos.', 'operation', 40),
  ('inventory', 'Estoque', 'Itens, movimentações e solicitações de peças.', 'operation', 50),
  ('equipment', 'Equipamentos', 'Tipos, marcas, modelos e campos técnicos.', 'operation', 60),
  ('services', 'Serviços gerais', 'Serviços internos, preços e descontos.', 'operation', 70),
  ('service_types', 'Tipos de atendimento', 'Fluxos e regras de SLA.', 'operation', 80),
  ('order_situations', 'Situações da OS', 'Etapas operacionais das ordens.', 'operation', 90),
  ('order_statuses', 'Status da OS', 'Status administrativos das ordens.', 'operation', 100),
  ('documents', 'Documentos', 'Modelos, impressões e anexos das ordens.', 'operation', 110),
  ('quotes', 'Orçamentos', 'Solicitações e gestão de orçamentos.', 'operation', 120),
  ('employees', 'Funcionários', 'Usuários, equipes, funções e permissões.', 'management', 130),
  ('company_settings', 'Dados da empresa', 'Dados cadastrais e identidade da empresa.', 'management', 140),
  ('site_services', 'Serviços do site', 'Conteúdo público de serviços.', 'site', 200),
  ('site_categories', 'Categorias do site', 'Categorias do catálogo público.', 'site', 210),
  ('site_products', 'Produtos do site', 'Produtos do catálogo público.', 'site', 220),
  ('site_brands', 'Marcas do site', 'Marcas do catálogo público.', 'site', 230),
  ('site_settings', 'Configurações do site', 'Configurações da experiência pública.', 'site', 240)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('organizations.view', 'Visualizar empresas', 'Visualiza empresas vinculadas à controladora.', 'Empresas parceiras', 2000),
  ('organizations.create', 'Cadastrar empresas', 'Cadastra novas empresas parceiras.', 'Empresas parceiras', 2001),
  ('organizations.edit', 'Editar empresas', 'Edita dados e configurações das empresas.', 'Empresas parceiras', 2002),
  ('organizations.suspend', 'Bloquear empresas', 'Suspende ou reativa o acesso de uma empresa.', 'Empresas parceiras', 2003),
  ('organizations.modules.manage', 'Gerenciar módulos', 'Libera ou bloqueia módulos por empresa.', 'Empresas parceiras', 2004),
  ('organizations.members.manage', 'Gerenciar membros', 'Gerencia usuários vinculados às empresas.', 'Empresas parceiras', 2005),
  ('organizations.data_shares.manage', 'Gerenciar compartilhamento', 'Define quais dados a controladora pode consultar.', 'Empresas parceiras', 2006),
  ('organizations.audit.view', 'Visualizar auditoria', 'Consulta ações administrativas da empresa.', 'Empresas parceiras', 2007)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Compatibilidade inicial: quem já administra funções recebe o controle multiempresa.
insert into public.role_permissions (role_id, permission_id)
select distinct existing_access.role_id, organization_permission.id
from public.role_permissions existing_access
join public.permissions existing_permission
  on existing_permission.id = existing_access.permission_id
 and existing_permission.key in ('roles.edit', 'roles.permissions.manage')
cross join public.permissions organization_permission
where organization_permission.key like 'organizations.%'
on conflict (role_id, permission_id) do nothing;

-- UUID fixo para permitir backfills reproduzíveis nas próximas fases.
insert into public.organizations (
  id,
  organization_type,
  name,
  legal_name,
  slug,
  status,
  settings
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'parent',
  'ArtVideo',
  'ArtVideo',
  'artvideo',
  'active',
  jsonb_build_object('is_root', true)
)
on conflict (id) do update set
  organization_type = 'parent',
  name = excluded.name,
  slug = excluded.slug,
  status = 'active',
  settings = public.organizations.settings || jsonb_build_object('is_root', true),
  updated_at = now();

insert into public.organization_members (
  organization_id,
  user_id,
  role_id,
  status,
  is_owner,
  joined_at
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  profile.id,
  profile.role_id,
  'active',
  false,
  now()
from public.profiles profile
on conflict (organization_id, user_id) do update set
  role_id = excluded.role_id,
  status = 'active',
  updated_at = now();

insert into public.organization_modules (
  organization_id,
  module_key,
  is_enabled,
  enabled_at
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  module.key,
  true,
  now()
from public.system_modules module
on conflict (organization_id, module_key) do update set
  is_enabled = true,
  enabled_at = coalesce(public.organization_modules.enabled_at, now()),
  updated_at = now();

create or replace function private.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
  );
$$;

create or replace function private.has_organization_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    join public.role_permissions role_permission
      on role_permission.role_id = member.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
      and permission.key = p_permission_key
  );
$$;

create or replace function private.can_manage_organization(
  p_target_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations target
    join public.organizations parent
      on parent.id = coalesce(target.parent_organization_id, target.id)
    where target.id = p_target_organization_id
      and parent.organization_type = 'parent'
      and parent.status = 'active'
      and private.has_organization_permission(parent.id, p_permission_key)
  );
$$;

create or replace function private.is_parent_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.organization_type = 'parent'
      and organization.status = 'active'
  );
$$;

create or replace function private.is_direct_child_organization(
  p_parent_organization_id uuid,
  p_child_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations child
    where child.id = p_child_organization_id
      and child.parent_organization_id = p_parent_organization_id
  );
$$;

revoke all on function private.is_organization_member(uuid) from public;
revoke all on function private.has_organization_permission(uuid, text) from public;
revoke all on function private.can_manage_organization(uuid, text) from public;
revoke all on function private.is_parent_organization(uuid) from public;
revoke all on function private.is_direct_child_organization(uuid, uuid) from public;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.has_organization_permission(uuid, text) to authenticated;
grant execute on function private.can_manage_organization(uuid, text) to authenticated;
grant execute on function private.is_parent_organization(uuid) to authenticated;
grant execute on function private.is_direct_child_organization(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.system_modules enable row level security;
alter table public.organization_modules enable row level security;
alter table public.organization_data_shares enable row level security;
alter table public.organization_audit_logs enable row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.system_modules from anon, authenticated;
revoke all on table public.organization_modules from anon, authenticated;
revoke all on table public.organization_data_shares from anon, authenticated;
revoke all on table public.organization_audit_logs from anon, authenticated;

grant select, insert, update on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;
grant select on table public.system_modules to authenticated;
grant select, insert, update, delete on table public.organization_modules to authenticated;
grant select, insert, update, delete on table public.organization_data_shares to authenticated;
grant select on table public.organization_audit_logs to authenticated;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations for select to authenticated
using (
  private.is_organization_member(id)
  or private.can_manage_organization(id, 'organizations.view')
);

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert
on public.organizations for insert to authenticated
with check (
  organization_type = 'partner'
  and parent_organization_id is not null
  and private.has_organization_permission(parent_organization_id, 'organizations.create')
  and private.is_parent_organization(parent_organization_id)
);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations for update to authenticated
using (private.can_manage_organization(id, 'organizations.edit'))
with check (private.can_manage_organization(id, 'organizations.edit'));

drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select
on public.organization_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_organization_permission(organization_id, 'employees.view')
  or private.can_manage_organization(organization_id, 'organizations.members.manage')
);

drop policy if exists organization_members_insert on public.organization_members;
create policy organization_members_insert
on public.organization_members for insert to authenticated
with check (
  private.can_manage_organization(organization_id, 'organizations.members.manage')
);

drop policy if exists organization_members_update on public.organization_members;
create policy organization_members_update
on public.organization_members for update to authenticated
using (private.can_manage_organization(organization_id, 'organizations.members.manage'))
with check (private.can_manage_organization(organization_id, 'organizations.members.manage'));

drop policy if exists organization_members_delete on public.organization_members;
create policy organization_members_delete
on public.organization_members for delete to authenticated
using (
  not is_owner
  and private.can_manage_organization(organization_id, 'organizations.members.manage')
);

drop policy if exists system_modules_select on public.system_modules;
create policy system_modules_select
on public.system_modules for select to authenticated
using (is_active);

drop policy if exists organization_modules_select on public.organization_modules;
create policy organization_modules_select
on public.organization_modules for select to authenticated
using (
  private.is_organization_member(organization_id)
  or private.can_manage_organization(organization_id, 'organizations.view')
);

drop policy if exists organization_modules_insert on public.organization_modules;
create policy organization_modules_insert
on public.organization_modules for insert to authenticated
with check (
  private.can_manage_organization(organization_id, 'organizations.modules.manage')
);

drop policy if exists organization_modules_update on public.organization_modules;
create policy organization_modules_update
on public.organization_modules for update to authenticated
using (private.can_manage_organization(organization_id, 'organizations.modules.manage'))
with check (private.can_manage_organization(organization_id, 'organizations.modules.manage'));

drop policy if exists organization_modules_delete on public.organization_modules;
create policy organization_modules_delete
on public.organization_modules for delete to authenticated
using (private.can_manage_organization(organization_id, 'organizations.modules.manage'));

drop policy if exists organization_data_shares_select on public.organization_data_shares;
create policy organization_data_shares_select
on public.organization_data_shares for select to authenticated
using (
  private.has_organization_permission(parent_organization_id, 'organizations.data_shares.manage')
  or private.has_organization_permission(child_organization_id, 'organizations.data_shares.manage')
);

drop policy if exists organization_data_shares_insert on public.organization_data_shares;
create policy organization_data_shares_insert
on public.organization_data_shares for insert to authenticated
with check (
  private.has_organization_permission(parent_organization_id, 'organizations.data_shares.manage')
  and private.is_direct_child_organization(parent_organization_id, child_organization_id)
);

drop policy if exists organization_data_shares_update on public.organization_data_shares;
create policy organization_data_shares_update
on public.organization_data_shares for update to authenticated
using (private.has_organization_permission(parent_organization_id, 'organizations.data_shares.manage'))
with check (
  private.has_organization_permission(parent_organization_id, 'organizations.data_shares.manage')
  and private.is_direct_child_organization(parent_organization_id, child_organization_id)
);

drop policy if exists organization_data_shares_delete on public.organization_data_shares;
create policy organization_data_shares_delete
on public.organization_data_shares for delete to authenticated
using (private.has_organization_permission(parent_organization_id, 'organizations.data_shares.manage'));

drop policy if exists organization_audit_logs_select on public.organization_audit_logs;
create policy organization_audit_logs_select
on public.organization_audit_logs for select to authenticated
using (
  private.has_organization_permission(organization_id, 'organizations.audit.view')
  or private.can_manage_organization(organization_id, 'organizations.audit.view')
);

commit;
