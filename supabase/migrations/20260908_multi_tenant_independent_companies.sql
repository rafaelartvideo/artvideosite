-- Corrige a semântica multiempresa: as organizações cadastradas são empresas
-- independentes entre si. A ArtVideo é apenas a organização operadora da
-- plataforma; ela não é matriz/controladora e as demais não são filiais.
--
-- Mantemos parent_organization_id e os valores parent/partner somente por
-- compatibilidade com migrations já aplicadas. A partir desta migration,
-- parent_organization_id deve permanecer NULL e nenhuma regra de acesso depende
-- de relação pai/filho.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_independent_companies', 0)
);

lock table public.organizations in access exclusive mode;
lock table public.organization_data_shares in access exclusive mode;

-- Remove qualquer vínculo hierárquico criado pela modelagem anterior.
update public.organizations
set parent_organization_id = null,
    updated_at = now()
where parent_organization_id is not null;

alter table public.organizations
  drop constraint if exists organizations_no_hierarchy_check;
alter table public.organizations
  add constraint organizations_no_hierarchy_check
  check (parent_organization_id is null);

-- A organização fixa ArtVideo representa a operação da plataforma. O valor
-- 'parent' passa a ser apenas um marcador legado dessa função administrativa;
-- 'partner' representa uma empresa independente cadastrada na plataforma.
update public.organizations
set organization_type = case
  when id = '00000000-0000-4000-8000-000000000001'::uuid then 'parent'
  else 'partner'
end,
settings = case
  when id = '00000000-0000-4000-8000-000000000001'::uuid
    then settings || jsonb_build_object('is_platform_operator', true, 'is_root', true)
  else settings - 'is_root' - 'is_platform_operator'
end,
updated_at = now();

create unique index if not exists organizations_single_platform_operator_idx
  on public.organizations ((organization_type))
  where organization_type = 'parent';

comment on column public.organizations.parent_organization_id is
  'Campo legado. Empresas são tenants independentes e este valor deve permanecer NULL.';
comment on column public.organizations.organization_type is
  'Marcador legado: parent identifica somente a organização operadora da plataforma; partner identifica uma empresa independente. Não representa matriz/filial.';
comment on table public.organization_data_shares is
  'Compartilhamentos explícitos entre empresas independentes. Os nomes parent_organization_id/child_organization_id são legados e não representam hierarquia.';
comment on column public.organization_data_shares.parent_organization_id is
  'Campo legado: organização que recebe acesso ao recurso compartilhado; não representa empresa-mãe.';
comment on column public.organization_data_shares.child_organization_id is
  'Campo legado: organização proprietária dos dados compartilhados; não representa filial.';

create or replace function private.is_platform_organization(p_organization_id uuid)
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
      and organization.status = 'active'
      and organization.id = '00000000-0000-4000-8000-000000000001'::uuid
      and coalesce((organization.settings ->> 'is_platform_operator')::boolean, false)
  );
$$;

create or replace function private.has_platform_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_organization_permission(
    '00000000-0000-4000-8000-000000000001'::uuid,
    p_permission_key
  );
$$;

-- Compatibilidade de nome: o conceito antigo de parent passa a significar apenas
-- a organização operadora da plataforma, nunca uma relação hierárquica.
create or replace function private.is_parent_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_organization(p_organization_id);
$$;

-- Não existem empresas-filhas. Mantemos a função apenas para que objetos legados
-- não quebrem antes de serem substituídos, mas ela sempre nega a relação.
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
  select false;
$$;

-- Administração da plataforma é uma capacidade de acesso, não uma relação de
-- propriedade entre empresas.
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
    where target.id = p_target_organization_id
      and target.status = 'active'
      and (
        private.has_organization_permission(target.id, p_permission_key)
        or private.has_platform_permission(p_permission_key)
      )
  );
$$;

create or replace function private.can_access_organization(p_organization_id uuid)
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
      and organization.status = 'active'
      and (
        private.is_organization_member(organization.id)
        or private.has_platform_permission('organizations.view')
      )
  );
$$;

-- Dados operacionais de outra empresa nunca ficam disponíveis só porque o
-- usuário administra a plataforma. Para acessar dados de negócio é necessário
-- um compartilhamento explícito registrado em organization_data_shares.
create or replace function private.can_access_shared_organization_resource(
  p_organization_id uuid,
  p_resource_key text,
  p_required_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_organization_member(p_organization_id)
    or exists (
      select 1
      from public.organization_data_shares data_share
      where data_share.child_organization_id = p_organization_id
        and private.is_platform_organization(data_share.parent_organization_id)
        and private.has_organization_permission(
          data_share.parent_organization_id,
          'organizations.view'
        )
        and data_share.resource_key = p_resource_key
        and case p_required_access_level
          when 'summary' then data_share.access_level in ('summary', 'read', 'manage')
          when 'read' then data_share.access_level in ('read', 'manage')
          when 'manage' then data_share.access_level = 'manage'
          else false
        end
    );
$$;

-- Permissão efetiva: membro direto usa a função da própria empresa. Um operador
-- da plataforma pode usar suas permissões administrativas, mas o acesso aos dados
-- continua dependendo também de can_access_shared_organization_resource().
create or replace function private.has_effective_organization_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_organization_permission(p_organization_id, p_permission_key)
    or private.can_manage_organization(p_organization_id, p_permission_key);
$$;

-- Lista empresas das quais o usuário é membro. Usuários da organização operadora
-- com organizations.view também podem selecionar outras empresas para funções de
-- administração da plataforma; isso não concede acesso automático aos dados.
create or replace function public.my_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  legal_name text,
  slug text,
  organization_type text,
  organization_status text,
  parent_organization_id uuid,
  membership_id uuid,
  membership_organization_id uuid,
  role_id uuid,
  is_owner boolean,
  is_direct_member boolean,
  enabled_modules text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with direct_access as (
    select
      organization.id as organization_id,
      organization.name as organization_name,
      organization.legal_name,
      organization.slug,
      organization.organization_type,
      organization.status as organization_status,
      null::uuid as parent_organization_id,
      member.id as membership_id,
      member.organization_id as membership_organization_id,
      member.role_id,
      member.is_owner,
      true as is_direct_member,
      0 as access_priority
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
  ),
  platform_access as (
    select
      target.id as organization_id,
      target.name as organization_name,
      target.legal_name,
      target.slug,
      target.organization_type,
      target.status as organization_status,
      null::uuid as parent_organization_id,
      platform_member.id as membership_id,
      platform_member.organization_id as membership_organization_id,
      platform_member.role_id,
      platform_member.is_owner,
      false as is_direct_member,
      1 as access_priority
    from public.organization_members platform_member
    join public.organizations platform
      on platform.id = platform_member.organization_id
    join public.role_permissions role_permission
      on role_permission.role_id = platform_member.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
     and permission.key = 'organizations.view'
    cross join public.organizations target
    where platform_member.user_id = (select auth.uid())
      and platform_member.status = 'active'
      and private.is_platform_organization(platform.id)
      and target.status = 'active'
  ),
  available_access as (
    select * from direct_access
    union all
    select * from platform_access
  ),
  preferred_access as (
    select distinct on (access.organization_id)
      access.*
    from available_access access
    order by access.organization_id, access.access_priority
  )
  select
    access.organization_id,
    access.organization_name,
    access.legal_name,
    access.slug,
    access.organization_type,
    access.organization_status,
    access.parent_organization_id,
    access.membership_id,
    access.membership_organization_id,
    access.role_id,
    access.is_owner,
    access.is_direct_member,
    coalesce(
      array(
        select organization_module.module_key
        from public.organization_modules organization_module
        join public.system_modules system_module
          on system_module.key = organization_module.module_key
        where organization_module.organization_id = access.organization_id
          and organization_module.is_enabled
          and system_module.is_active
        order by system_module.sort_order, organization_module.module_key
      ),
      array[]::text[]
    ) as enabled_modules
  from preferred_access access
  order by access.access_priority, access.organization_name;
$$;

create or replace function public.my_organization_permissions(p_organization_id uuid)
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  with access_roles as (
    select member.role_id
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'

    union

    select platform_member.role_id
    from public.organization_members platform_member
    join public.organizations platform
      on platform.id = platform_member.organization_id
    join public.organizations target
      on target.id = p_organization_id
    where platform_member.user_id = (select auth.uid())
      and platform_member.status = 'active'
      and platform.status = 'active'
      and target.status = 'active'
      and private.is_platform_organization(platform.id)
      and private.has_organization_permission(
        platform.id,
        'organizations.view'
      )
  )
  select distinct permission.key as permission_key
  from access_roles access_role
  join public.role_permissions role_permission
    on role_permission.role_id = access_role.role_id
  join public.permissions permission
    on permission.id = role_permission.permission_id
  where access_role.role_id is not null
  order by permission.key;
$$;

revoke all on function private.is_platform_organization(uuid) from public;
revoke all on function private.has_platform_permission(text) from public;
revoke all on function private.is_parent_organization(uuid) from public;
revoke all on function private.is_direct_child_organization(uuid, uuid) from public;
revoke all on function private.can_manage_organization(uuid, text) from public;
revoke all on function private.can_access_organization(uuid) from public;
revoke all on function private.can_access_shared_organization_resource(uuid, text, text) from public;
revoke all on function private.has_effective_organization_permission(uuid, text) from public;
revoke all on function public.my_organizations() from public;
revoke all on function public.my_organization_permissions(uuid) from public;

grant execute on function private.is_platform_organization(uuid) to authenticated;
grant execute on function private.has_platform_permission(text) to authenticated;
grant execute on function private.is_parent_organization(uuid) to authenticated;
grant execute on function private.is_direct_child_organization(uuid, uuid) to authenticated;
grant execute on function private.can_manage_organization(uuid, text) to authenticated;
grant execute on function private.can_access_organization(uuid) to authenticated;
grant execute on function private.can_access_shared_organization_resource(uuid, text, text) to authenticated;
grant execute on function private.has_effective_organization_permission(uuid, text) to authenticated;
grant execute on function public.my_organizations() to authenticated;
grant execute on function public.my_organization_permissions(uuid) to authenticated;

-- Empresas são independentes: novas organizações não recebem parent_organization_id.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations
for select
to authenticated
using (
  private.is_organization_member(id)
  or private.has_platform_permission('organizations.view')
);

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert
on public.organizations
for insert
to authenticated
with check (
  organization_type = 'partner'
  and parent_organization_id is null
  and private.has_platform_permission('organizations.create')
);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations
for update
to authenticated
using (
  private.can_manage_organization(id, 'organizations.edit')
)
with check (
  parent_organization_id is null
  and (
    (id = '00000000-0000-4000-8000-000000000001'::uuid and organization_type = 'parent')
    or
    (id <> '00000000-0000-4000-8000-000000000001'::uuid and organization_type = 'partner')
  )
  and private.can_manage_organization(id, 'organizations.edit')
);

-- Compartilhamento é explícito e não depende de relação pai/filho. A empresa
-- proprietária dos dados (child_organization_id no esquema legado) é quem concede
-- acesso à organização operadora da plataforma.
drop policy if exists organization_data_shares_select on public.organization_data_shares;
create policy organization_data_shares_select
on public.organization_data_shares
for select
to authenticated
using (
  private.has_organization_permission(
    child_organization_id,
    'organizations.data_shares.manage'
  )
  or private.has_organization_permission(
    parent_organization_id,
    'organizations.data_shares.manage'
  )
);

drop policy if exists organization_data_shares_insert on public.organization_data_shares;
create policy organization_data_shares_insert
on public.organization_data_shares
for insert
to authenticated
with check (
  child_organization_id <> parent_organization_id
  and private.is_platform_organization(parent_organization_id)
  and private.has_organization_permission(
    child_organization_id,
    'organizations.data_shares.manage'
  )
);

drop policy if exists organization_data_shares_update on public.organization_data_shares;
create policy organization_data_shares_update
on public.organization_data_shares
for update
to authenticated
using (
  private.has_organization_permission(
    child_organization_id,
    'organizations.data_shares.manage'
  )
)
with check (
  child_organization_id <> parent_organization_id
  and private.is_platform_organization(parent_organization_id)
  and private.has_organization_permission(
    child_organization_id,
    'organizations.data_shares.manage'
  )
);

drop policy if exists organization_data_shares_delete on public.organization_data_shares;
create policy organization_data_shares_delete
on public.organization_data_shares
for delete
to authenticated
using (
  private.has_organization_permission(
    child_organization_id,
    'organizations.data_shares.manage'
  )
);

-- Atualiza nomenclatura exibida sem alterar as chaves de permissão já usadas.
update public.permissions
set module_name = 'Empresas',
    description = case key
      when 'organizations.view' then 'Visualiza empresas cadastradas na plataforma.'
      when 'organizations.create' then 'Cadastra novas empresas independentes na plataforma.'
      when 'organizations.edit' then 'Edita dados e configurações das empresas.'
      when 'organizations.suspend' then 'Suspende ou reativa o acesso de uma empresa.'
      when 'organizations.modules.manage' then 'Libera ou bloqueia módulos de uma empresa.'
      when 'organizations.members.manage' then 'Gerencia usuários vinculados a uma empresa.'
      when 'organizations.data_shares.manage' then 'Gerencia compartilhamentos explícitos de dados da empresa.'
      when 'organizations.audit.view' then 'Consulta ações administrativas da empresa.'
      else description
    end
where key like 'organizations.%';

comment on function private.can_manage_organization(uuid, text) is
  'Autoriza administração da própria empresa ou administração da plataforma, sem relação matriz/filial.';
comment on function private.can_access_shared_organization_resource(uuid, text, text) is
  'Permite dados da própria empresa ou acesso explicitamente compartilhado; não existe herança entre empresas.';
comment on function private.has_effective_organization_permission(uuid, text) is
  'Combina permissões da empresa com permissões administrativas da plataforma sem criar vínculo hierárquico.';
comment on function public.my_organizations() is
  'Lista empresas acessíveis ao usuário. Empresas são tenants independentes; is_direct_member distingue vínculo direto de administração da plataforma.';

commit;
