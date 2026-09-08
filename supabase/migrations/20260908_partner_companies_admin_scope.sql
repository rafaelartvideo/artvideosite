-- Administração de empresas parceiras independentes pela organização operadora.
--
-- Diferencia administração cadastral da empresa (que precisa continuar possível
-- mesmo quando a empresa está suspensa/cancelada) do acesso aos dados operacionais,
-- que permanece dependente das regras multiempresa e dos compartilhamentos explícitos.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:partner_companies_admin_scope', 0)
);

create or replace function private.can_administer_organization(
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
      and (
        private.has_platform_permission(p_permission_key)
        or (
          target.status = 'active'
          and private.has_organization_permission(
            target.id,
            p_permission_key
          )
        )
      )
  );
$$;

revoke all on function private.can_administer_organization(uuid, text) from public;
grant execute on function private.can_administer_organization(uuid, text) to authenticated;

-- A plataforma precisa continuar enxergando uma empresa suspensa/cancelada para
-- poder corrigir dados cadastrais e reativá-la. Isso não concede acesso aos dados
-- operacionais da empresa.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations
for select
to authenticated
using (
  private.is_organization_member(id)
  or private.has_platform_permission('organizations.view')
);

-- Permite edição/reabilitação cadastral pelo operador da plataforma mesmo quando
-- o status atual do tenant não é active. Mantém empresas independentes e impede
-- transformar parceiros em organização operadora ou criar hierarquia.
drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations
for update
to authenticated
using (
  private.can_administer_organization(id, 'organizations.edit')
  or private.can_administer_organization(id, 'organizations.suspend')
)
with check (
  parent_organization_id is null
  and (
    (
      id = '00000000-0000-4000-8000-000000000001'::uuid
      and organization_type = 'parent'
    )
    or
    (
      id <> '00000000-0000-4000-8000-000000000001'::uuid
      and organization_type = 'partner'
    )
  )
  and (
    private.can_administer_organization(id, 'organizations.edit')
    or private.can_administer_organization(id, 'organizations.suspend')
  )
);

-- Permite ao operador consultar os membros de empresas suspensas/canceladas para
-- diagnóstico e administração. A escrita continua nas policies já existentes e
-- portanto segue mais restrita.
drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.has_organization_permission(
    organization_id,
    'employees.view'
  )
  or private.can_administer_organization(
    organization_id,
    'organizations.members.manage'
  )
);

comment on function private.can_administer_organization(uuid, text) is
  'Autoriza administração cadastral de uma organização pela própria empresa ativa ou pela organização operadora, inclusive quando o tenant alvo está suspenso/cancelado. Não concede acesso a dados operacionais.';

commit;
