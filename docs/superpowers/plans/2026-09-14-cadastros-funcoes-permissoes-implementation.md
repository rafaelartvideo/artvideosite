# Cadastros, Funções e Permissões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o cadastro de pessoas/empresas, mover criação e manutenção de acesso de funcionários para Cadastros, transformar Funções e Permissões em módulo próprio e permitir permissões individuais adicionais por usuário.

**Architecture:** `entities` continua sendo a origem cadastral e `employees/customers` permanecem como tabelas de compatibilidade operacional. O acesso do funcionário usa `auth.users + profiles + organization_members` com uma função base, enquanto uma nova tabela tenant-scoped adiciona permissões individuais sem negar permissões herdadas. O frontend separa claramente Cadastros, Funções e Permissões e a ficha legada do cliente.

**Tech Stack:** React 18, TypeScript, Vite 6, React Router 7, TanStack Query 5, Supabase Auth/Postgres/RLS/Edge Functions.

**Spec:** `docs/superpowers/specs/2026-09-14-cadastros-funcoes-permissoes-design.md`

## Global Constraints

- A rota canônica de Funções e Permissões é `/admin/operation/roles`.
- `/admin/operation/employees` só pode existir como redirecionamento compatível; não pode renderizar a antiga página de usuários.
- Permissões individuais são somente aditivas: `função base UNION permissões individuais`.
- `roles.permissions.manage` controla alterações de permissões individuais.
- Auth Admin permanece somente em Edge Function/backend; nunca usar service role no navegador.
- Não remover fisicamente `employees`, `profiles`, `organization_members` ou `customers` nesta etapa.
- Não excluir cadastros de negócio; usar status ativo/inativo.
- ArtVideo mantém integração UNIQ; outros tenants não recebem esse campo.
- `hasPermission()` mantém a interface atual e passa a receber a união efetiva pelo RPC já consumido pelo AuthProvider.
- O `package.json` não possui test runner; a verificação automatizada disponível é SQL de banco + `npm run build`, complementada por checks funcionais direcionados.

---

### Task 1: Persistência de permissões individuais e cálculo efetivo

**Files:**
- Create: `supabase/migrations/20260914_user_permission_overrides.sql`
- Verify against: `supabase/migrations/20260908_multi_tenant_independent_companies.sql`

**Interfaces:**
- Produces table: `public.user_permission_overrides(id, organization_id, user_id, permission_id, created_at, created_by)`
- Produces effective helper behavior: `private.has_organization_permission(uuid,text)` inclui função base + override individual.
- Produces RPC behavior: `public.my_organization_permissions(uuid)` retorna chaves herdadas + individuais sem duplicatas.

- [ ] **Step 1: Registrar consulta de pré-condição**

Run in Supabase SQL before migration:

```sql
select to_regclass('public.user_permission_overrides') as overrides_table;
select pg_get_functiondef('public.my_organization_permissions(uuid)'::regprocedure);
```

Expected: `overrides_table` is null and the current RPC reads only `role_permissions`.

- [ ] **Step 2: Criar tabela, índices, grants e RLS**

Migration core:

```sql
create table public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  permission_id uuid not null references public.permissions(id),
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id),
  unique (organization_id, user_id, permission_id)
);

create index user_permission_overrides_org_user_idx
  on public.user_permission_overrides (organization_id, user_id);

alter table public.user_permission_overrides enable row level security;

grant select, insert, delete on public.user_permission_overrides to authenticated;
revoke all on public.user_permission_overrides from anon;
```

Policies:

```sql
create policy user_permission_overrides_select
on public.user_permission_overrides for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_effective_organization_permission(organization_id, 'roles.view')
);

create policy user_permission_overrides_insert
on public.user_permission_overrides for insert to authenticated
with check (
  private.has_effective_organization_permission(organization_id, 'roles.permissions.manage')
);

create policy user_permission_overrides_delete
on public.user_permission_overrides for delete to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'roles.permissions.manage')
);
```

- [ ] **Step 3: Atualizar helpers de autorização sem alterar assinatura**

`private.has_organization_permission(p_organization_id,p_permission_key)` deve retornar true quando existir a permissão na função do membership **ou** em `user_permission_overrides` para `(organization_id, auth.uid())`.

Use a `union all`/`exists` sem depender de RLS recursiva da própria tabela de overrides. Como helper privado de autorização já é `SECURITY DEFINER`, manter `search_path=''` e revogar de `public`, preservando o padrão atual.

- [ ] **Step 4: Atualizar `public.my_organization_permissions`**

A query final deve unir:

```sql
select permission.key
from access_roles
join public.role_permissions rp on rp.role_id = access_roles.role_id
join public.permissions permission on permission.id = rp.permission_id
union
select permission.key
from public.user_permission_overrides override
join public.permissions permission on permission.id = override.permission_id
where override.organization_id = p_organization_id
  and override.user_id = (select auth.uid())
```

Preservar acesso administrativo de plataforma já existente e retornar `distinct/order by`.

- [ ] **Step 5: Aplicar migration e validar estrutura**

Run:

```sql
select relrowsecurity
from pg_class
where oid = 'public.user_permission_overrides'::regclass;

select indexdef
from pg_indexes
where schemaname='public' and tablename='user_permission_overrides';
```

Expected: RLS `true`; unique composite + `organization_id,user_id` index presentes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260914_user_permission_overrides.sql
git commit -m "feat(auth): add individual permission overrides"
```

---

### Task 2: API de acesso do funcionário no backend

**Files:**
- Modify: `supabase/functions/server/index.ts`
- Modify: `src/features/registrations/infrastructure/registrations.repository.ts`
- Create: `src/features/access/infrastructure/user-access.repository.ts`

**Interfaces:**
- Edge actions: `get_employee_access`, `upsert_employee_access`, `set_user_permission_overrides`.
- `getEmployeeAccess(organizationId, employeeId)` retorna `{ profile_id, email, access_active, role_id, uniq_subscriber_id }`.
- `saveEmployeeAccess(...)` cria/atualiza Auth/Profile/Membership e sincroniza `employees` + `entity_employee_details`.
- `getUserPermissionAccess(...)` retorna permissões herdadas e adicionais separadamente.

- [ ] **Step 1: Confirmar comportamento atual que falha para o novo fluxo**

Search `server/index.ts` and verify only `create_employee_user`, `update_employee_user`, `delete_employee_user` exist and require a standalone employee UI payload.

- [ ] **Step 2: Adicionar `get_employee_access`**

Input:

```ts
{ action: "get_employee_access", organization_id: string, employee_id: string }
```

Server validates caller, organization and `employees.view`/`roles.view`, then resolves `employees.profile_id`, `profiles.email`, `organization_members.role_id`, `profiles.is_active`, `employees.uniq_subscriber_id`.

- [ ] **Step 3: Adicionar `upsert_employee_access`**

Input:

```ts
{
  action: "upsert_employee_access",
  organization_id: string,
  employee_id: string,
  enabled: boolean,
  email: string,
  password?: string,
  role_id: string | null,
  uniq_subscriber_id?: string | null
}
```

Rules:
- create Auth user only when `enabled=true` and employee has no `profile_id`;
- require email + password on first creation;
- editing may omit password;
- disabling does not delete Auth: set profile/membership/employee access inactive as appropriate;
- synchronize `employees.profile_id`, `employees.role_id`, `entity_employee_details.profile_id`, `entity_employee_details.role_id` and UNIQ for ArtVideo;
- do not change identity fields here; identity remains owned by Cadastros.

- [ ] **Step 4: Adicionar `set_user_permission_overrides`**

Input:

```ts
{
  action: "set_user_permission_overrides",
  organization_id: string,
  user_id: string,
  permission_ids: string[]
}
```

Require `roles.permissions.manage`, validate every permission id exists, then atomically replace only rows for that organization/user. Do not edit `role_permissions`.

- [ ] **Step 5: Criar repository frontend**

`src/features/access/infrastructure/user-access.repository.ts` exports:

```ts
export const getEmployeeAccess = (organizationId: string, employeeId: string) =>
  supabase.functions.invoke("server", { body: { action: "get_employee_access", organization_id: organizationId, employee_id: employeeId } });

export const upsertEmployeeAccess = (payload: EmployeeAccessPayload) =>
  supabase.functions.invoke("server", { body: { action: "upsert_employee_access", ...payload } });

export const listUserPermissionAccess = async (organizationId: string, userId: string) => { /* permissions + role_permissions + overrides */ };

export const setUserPermissionOverrides = (organizationId: string, userId: string, permissionIds: string[]) =>
  supabase.functions.invoke("server", { body: { action: "set_user_permission_overrides", organization_id: organizationId, user_id: userId, permission_ids: permissionIds } });
```

- [ ] **Step 6: Build check**

Run: `npm run build`

Expected: Vite build succeeds; no missing exports/types.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/server/index.ts src/features/access/infrastructure/user-access.repository.ts src/features/registrations/infrastructure/registrations.repository.ts
git commit -m "feat(access): manage employee login from registrations"
```

---

### Task 3: Funções e Permissões como único módulo em Operação

**Files:**
- Create: `src/features/roles/presentation/TabRoles.tsx`
- Create: `src/features/roles/infrastructure/roles.repository.ts`
- Modify: `src/features/admin-shell/domain/admin.types.ts`
- Modify: `src/features/admin-shell/navigation-config.ts`
- Modify: `src/features/admin-shell/admin-routes.ts`
- Modify: `src/app/Admin.tsx`
- Modify: `src/features/employees/domain/permission-taxonomy.ts`
- Delete after successful extraction: `src/features/employees/presentation/TabEmployees.tsx`

**Interfaces:**
- New AdminTab: `roles`.
- Canonical path: `/admin/operation/roles`.
- Legacy `/admin/operation/employees/*` redirects to canonical path.
- Module requires `roles.view`; module licensing may continue mapping to legacy module key `employees` until module catalog migration is intentionally changed.

- [ ] **Step 1: Extrair somente o painel de funções**

Move `RolePermissionsPanel`, `RoleRow` and role CRUD behavior out of `TabEmployees.tsx`. `TabRoles` must render one page only:

```tsx
export function TabRoles(props: TeamRouteProps & { onBack: () => void }) {
  return <div className="space-y-5">
    <PageHeader title="Funções e Permissões" subtitle="Configure funções e permissões da empresa." actions={<InternalBackButton onBack={props.onBack} />} />
    <RolePermissionsPanel {...props} />
  </div>;
}
```

No tabs and no text `Usuários`, `Equipe` or `Equipes` in this module.

- [ ] **Step 2: Mover repository de roles para domínio próprio**

`roles.repository.ts` keeps only `listRoles`, `listPermissions`, `getRolePermissionIds`, `createRole`, `updateRole`, `addRolePermission`, `removeRolePermission` and role user counts. Employee/Auth commands no longer belong to this page.

- [ ] **Step 3: Alterar navegação**

`operationItems` gains:

```ts
{ id: "roles", label: "Funções e Permissões", icon: ShieldCheck, description: "Configure funções e os acessos disponíveis para os usuários.", permissionKey: "roles.view" }
```

`AdminTab` removes `employees` and adds `roles`; `permissionForTab.roles = "roles.view"`; `moduleForTab.roles = "employees"` for compatibility with enabled_modules.

- [ ] **Step 4: Alterar rotas e compatibilidade**

`ADMIN_TAB_PATHS.roles = "/admin/operation/roles"`; `parentAdminTab("roles") = "operation"`.

In `Admin.tsx`:

```tsx
<Route path="operation/roles/*" element={<TabRoles ... />} />
<Route path="operation/employees/*" element={<Navigate to="/admin/operation/roles" replace />} />
```

- [ ] **Step 5: Limpar taxonomia visual**

Change `employees` module display label from `Acessos e Usuários` to `Cadastros — Acesso ao sistema`. Remove the dependency `roles.view -> employees.view`; roles permissions should depend on roles permissions only.

- [ ] **Step 6: Build check**

Run: `npm run build`

Expected: no AdminTab mismatch and no import to deleted `TabEmployees`.

- [ ] **Step 7: Commit**

```bash
git add src/features/roles src/features/admin-shell src/app/Admin.tsx src/features/employees/domain/permission-taxonomy.ts
git rm src/features/employees/presentation/TabEmployees.tsx
git commit -m "refactor(admin): make roles a standalone operation module"
```

---

### Task 4: Cadastros com dados maduros, máscaras, CEP e acesso do funcionário

**Files:**
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Modify: `src/features/registrations/infrastructure/registrations.repository.ts`
- Create: `src/features/registrations/application/useRegistrationLookups.ts`
- Create: `src/features/access/presentation/UserAccessSection.tsx`
- Create: `src/features/access/presentation/UserPermissionOverridesPage.tsx`
- Reuse: `src/shared/ui/address/AddressFields.tsx`
- Reuse: `src/features/customers/infrastructure/cpf.gateway.ts`
- Reuse: `src/features/customers/infrastructure/customers.repository.ts::fetchCnpjData`
- Reuse: `src/features/customers/domain/customer-form.ts::applyCnpjData`

**Interfaces:**
- `TabRegistrations` route subpage `access` opens individual access/permission management for selected employee registration.
- `UserAccessSection` owns access enabled/email/password/base role/UNIQ fields inside registration editor.
- `UserPermissionOverridesPage` separates inherited vs individual permission ids.

- [ ] **Step 1: Tornar lookup CPF compatível com entidades**

Update CPF duplicate check to search `entities.document` in the active organization rather than only `customers.document`; accept optional current entity id so editing the same registration does not block lookup.

Expected lookup result remains:

```ts
type CpfLookupResult = { name: string; birthDate: string | null };
```

- [ ] **Step 2: Criar hook de consultas cadastrais**

`useRegistrationLookups` exposes `lookupCpfName()` and `lookupCnpjData()`, reusing existing gateway/repository helpers and mapping result into Registration form fields + Address.

- [ ] **Step 3: Substituir campos genéricos por controles maduros**

Use existing controls:

```tsx
<FCpfInput ... />
<FCnpjInput ... />
<FBrazilianDateInput ... />
<FPhoneInput ... />
<FEmailInput ... />
<AddressFields value={address} onChange={setAddress} inputClassName={INPUT} />
```

PF requires valid CPF, birth date not future, and at least phone or WhatsApp. PJ requires valid CNPJ; foundation date cannot be future.

- [ ] **Step 4: Incorporar `Acesso ao sistema` para Funcionário**

When `roles.includes("employee")`, render `UserAccessSection` containing:
- toggle access enabled;
- access email;
- password only required if enabling first access;
- role selector from active roles;
- UNIQ only when `activeOrganizationId === ARTVIDEO_ORGANIZATION_ID`.

Save order:
1. `saveRegistration()` identity/employee/address;
2. resolve created registration/legacy employee id;
3. `upsertEmployeeAccess()` only if employee access fields are enabled or an existing access needs update.

If step 1 succeeds and step 3 fails, show explicit partial-success error and keep editor open; do not silently lose the registration.

- [ ] **Step 5: Criar página individual de Acessos e Permissões**

Route: `/admin/customers/:entityId/access` using existing route segments.

Display:
- base role name;
- inherited permission checkboxes disabled and tagged `Herdada da função`;
- individual permission checkboxes editable when `roles.permissions.manage`;
- grouped with `buildPermissionGroups()`.

Saving calls `setUserPermissionOverrides` and dispatches:

```ts
window.dispatchEvent(new Event("artvideo:permissions-changed"));
```

- [ ] **Step 6: Adicionar toolbar inferior nos detalhes e edição**

Detail toolbar:

```tsx
<div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
  <BtnSecondary onClick={closeDetail}>Fechar</BtnSecondary>
  {customerAction}
  {accessAction}
  {canEdit && <BtnPrimary onClick={openEdit}>Editar cadastro</BtnPrimary>}
</div>
```

Editor toolbar uses Cancelar/Salvar. Rely on existing `AdminPage` mobile safe-area behavior.

- [ ] **Step 7: Build check**

Run: `npm run build`

Expected: all shared control imports compile and no old standalone user form remains.

- [ ] **Step 8: Commit**

```bash
git add src/features/registrations src/features/access src/features/customers/infrastructure/cpf.gateway.ts
git commit -m "feat(registrations): integrate employee access and mature form controls"
```

---

### Task 5: Ficha do Cliente contextual e mais rápida

**Files:**
- Modify: `src/features/customers/presentation/TabCustomers.tsx`
- Modify: `src/features/customers/presentation/LegacyTabCustomers.tsx`
- Modify: `src/features/customers/application/useCustomerDetails.ts`
- Modify: `src/app/Admin.tsx`

**Interfaces:**
- `LegacyTabCustomers` accepts optional `initialCustomer` and `onCloseToRegistration` behavior.
- Opening `Ficha do cliente` keeps registration id as origin.
- Closing customer ficha returns to `/admin/customers/:entityId`, not `/admin/customers`.

- [ ] **Step 1: Passar origem explicitamente ao abrir ficha**

`TabRegistrations` must call a callback with both `legacy_customer_id` and current `entity.id`.

Use route state/origin or callback signature:

```ts
onOpenCustomerHistory?: (customerId: string, registrationId: string) => void;
```

- [ ] **Step 2: Evitar fetch redundante de identidade**

When entering legacy ficha from a loaded Registration, construct the minimal customer seed from the registration and pass it to `details.open(seed)` immediately. Only fetch legacy customer row if fields required by the ficha are absent.

The expensive history/equipment queries may run in parallel after the page is visible; identity/header must render immediately.

- [ ] **Step 3: Corrigir fechamento e retorno de OS**

Close action returns to registration origin. Opening OS keeps:

```ts
origin: { tab: "customers", resourceId: registrationId, subpage: null }
```

Returning from OS therefore reopens the registration detail, not the old ficha route or list.

- [ ] **Step 4: Renomear breadcrumbs legados visíveis**

Where the ficha is opened from Cadastros, breadcrumb becomes `Cadastros > Ficha do cliente`; preserve read-only partner customer terminology only in partner-company context.

- [ ] **Step 5: Build check**

Run: `npm run build`

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/features/customers src/features/registrations/presentation/TabRegistrations.tsx src/app/Admin.tsx
git commit -m "fix(customers): preserve registration origin in customer record"
```

---

### Task 6: Limpeza de permissões legadas, banco e verificação final

**Files:**
- Create: `supabase/migrations/20260914_registration_access_permission_labels.sql`
- Modify as needed: `src/features/employees/domain/permission-taxonomy.ts`
- Review entire changed set.

**Interfaces:**
- Existing `employees.*` permission keys remain stable for compatibility, but labels/module names describe access within Cadastros.
- No visible admin navigation uses `employees` as a page.

- [ ] **Step 1: Atualizar labels sem trocar chaves**

Migration updates examples:

```sql
update public.permissions
set module_name = 'Cadastros — Acesso ao sistema',
    label = case key
      when 'employees.create' then 'Criar acesso do funcionário'
      when 'employees.edit' then 'Editar acesso do funcionário'
      when 'employees.toggle_active' then 'Ativar ou desativar acesso'
      when 'employees.view' then 'Visualizar acesso do funcionário'
      else label
    end
where key like 'employees.%';
```

Table-column permissions that only supported the deleted Users table should no longer be presented by the role UI; keep rows only if other code still references them.

- [ ] **Step 2: Verificar overrides e autorização no banco**

Run targeted SQL as an authenticated test user/session where possible. At minimum validate joins and duplicate behavior with a transaction rolled back:

```sql
begin;
-- insert one override for a known membership/user + permission
-- verify function query returns the key once
-- verify a second organization does not receive it
rollback;
```

Expected: no cross-tenant rows; union has no duplicate keys.

- [ ] **Step 3: Revisar resíduos de UI**

Search:

```bash
rg 'Equipes|Equipe|>Usuários<|operation/employees|TabEmployees' src
```

Expected: only legitimate business `team_name`/compatibility identifiers remain; no visible legacy admin module or breadcrumb.

- [ ] **Step 4: Full build**

Run:

```bash
npm run build
```

Expected: exit 0. Existing Vite large-chunk warning is acceptable; TypeScript/import/build errors are not.

- [ ] **Step 5: Supabase advisors**

Run security/performance advisors and confirm no new warning is introduced by `user_permission_overrides` or its policies.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260914_registration_access_permission_labels.sql src/features/employees/domain/permission-taxonomy.ts
git commit -m "chore(access): clean legacy employee permission labels"
```

---

### Task 7: Integration review and release handoff

**Files:**
- Review: all branch changes vs `main`

**Interfaces:**
- Final branch must be mergeable to main with migrations committed before production DB application.

- [ ] **Step 1: Compare branch to main**

Run/inspect:

```bash
git diff --stat main...feature/cadastros-funcoes-permissoes
git diff --check main...feature/cadastros-funcoes-permissoes
```

Expected: only spec/plan, migrations, access/roles/registrations/customer navigation files and necessary backend changes.

- [ ] **Step 2: Functional smoke matrix**

Verify manually:

```text
Cadastros > PF > consulta CPF > nascimento > CEP > salvar
Cadastros > PJ > consulta CNPJ > CEP > salvar
Cadastros > Funcionário sem login > salvar
Cadastros > Funcionário > habilitar login > função > salvar
Cadastros > Funcionário > Acessos e Permissões > adicionar permissão individual
Login do usuário afetado > evento/refresh > permissão efetiva disponível
Operação > Funções e Permissões > criar/editar função
Legacy /admin/operation/employees > redireciona para /admin/operation/roles
Cadastros > Cliente > Ficha do cliente > Fechar > volta ao cadastro
Ficha do cliente > abrir OS > voltar > volta ao cadastro
```

- [ ] **Step 3: Final build and commit status**

Run `npm run build` one final time and confirm working tree clean.

- [ ] **Step 4: Merge/deploy only after verification**

Do not merge failing branch. After success, merge branch into `main`, apply committed Supabase migrations in the same order, deploy Edge Function `server`, and let the existing production workflow deploy the frontend.
