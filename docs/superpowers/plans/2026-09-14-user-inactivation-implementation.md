# Inativação Segura de Usuários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover exclusão física de usuários do fluxo operacional e implementar ativação/inativação reversível, multiempresa e sincronizada entre funcionário, perfil e membership.

**Architecture:** O frontend continuará usando a Edge Function `server`, mas a ação `toggle_employee_user_active` terá autorização própria por `employees.toggle_active`. A Edge Function chamará um RPC restrito ao `service_role` que atualiza `employees`, `profiles` e `organization_members` na mesma transação. A UI removerá exclusão, pedirá confirmação ao inativar e usará a mesma operação dedicada para alterações de status.

**Tech Stack:** React 18, TypeScript, Vite 6, TanStack Query 5, Supabase Auth/Postgres/Edge Functions/RLS.

**Spec:** `docs/superpowers/specs/2026-09-14-user-inactivation-design.md`

## Global Constraints

- Usuários não são excluídos fisicamente pelo fluxo normal do admin.
- Inativação deve preservar `auth.users`, histórico, função, vínculos e UNIQ.
- `employees.toggle_active` funciona independentemente de `employees.edit`.
- Toda operação é restrita a `organization_id`.
- A UI não deve renderizar botão Excluir.
- Não usar service role no navegador.
- Não monitorar deploy/Actions durante a implementação.
- `package.json` não possui test runner; validar banco com transações/consultas e frontend por inspeção/build apenas se houver ambiente executável.

---

### Task 1: RPC transacional para status do usuário

**Files:**
- Create: `supabase/migrations/20260914184000_employee_active_state_transaction.sql`

**Interfaces:**
- Produces: `public.admin_set_employee_active_state(p_organization_id uuid, p_employee_id uuid, p_is_active boolean)`.
- Execute allowed only to `service_role`.
- Returns target `profile_id` and effective active state.

- [ ] **Step 1: Registrar pré-condições**

Run:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name in ('employees','profiles','organization_members')
  and column_name in ('organization_id','profile_id','is_active','status');
```

Expected: employee has `organization_id/profile_id/is_active`, profile has `is_active`, membership has `status`.

- [ ] **Step 2: Criar função transacional**

Function must load employee by `(id, organization_id)` `FOR UPDATE`, reject missing target, update profile when non-null, update membership for same organization/profile user id, update employee, and return one row. Function uses `SECURITY DEFINER SET search_path=''`, revokes PUBLIC/anon/authenticated and grants only `service_role`.

- [ ] **Step 3: Validar sem persistir**

Run a transaction with an existing employee, call the helper as privileged SQL, verify three states align, then `ROLLBACK`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260914184000_employee_active_state_transaction.sql
git commit -m "feat(users): add transactional active state sync"
```

---

### Task 2: Ação dedicada na Edge Function

**Files:**
- Modify: `supabase/functions/server/index.ts`

**Interfaces:**
- Consumes action:

```ts
{
  action: "toggle_employee_user_active",
  organization_id: string,
  employee_id: string,
  is_active: boolean
}
```

- Requires `employees.toggle_active`.
- Calls `admin_set_employee_active_state` through `adminClient.rpc`.

- [ ] **Step 1: Confirmar falha atual**

Verify `toggle_employee_user_active` is not in the allow-list and `update_employee_user` maps to `employees.edit`.

- [ ] **Step 2: Adicionar action e permission mapping**

Allow `toggle_employee_user_active`; map it to `employees.toggle_active`, leaving create/edit mappings unchanged.

- [ ] **Step 3: Implementar branch antes do update comum**

Load target employee in organization, reject missing `employee_id`, reject unsafe self-deactivation when caller is owner/last administrative access where applicable, call RPC, return `{ success: true, employee_id, is_active }`.

- [ ] **Step 4: Manter compatibilidade**

`update_employee_user` continues editing profile data. Status-only UI must no longer depend on it.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/server/index.ts
git commit -m "feat(users): add dedicated activate deactivate action"
```

---

### Task 3: Frontend de Usuários sem exclusão

**Files:**
- Modify: `src/features/employees/infrastructure/employees.repository.ts`
- Modify: `src/features/employees/presentation/TabEmployees.tsx`
- Modify: `src/features/employees/domain/permission-taxonomy.ts`

**Interfaces:**
- Produces `setEmployeeActive(organizationId, employeeId, isActive)`.
- `employees.toggle_active` depends on `employees.view`, not `employees.edit`.

- [ ] **Step 1: Criar repository helper**

```ts
export const setEmployeeActive = (organizationId: string, employeeId: string, isActive: boolean) =>
  supabase.functions.invoke("server", {
    body: { action: "toggle_employee_user_active", organization_id: organizationId, employee_id: employeeId, is_active: isActive },
  });
```

- [ ] **Step 2: Remover exclusão física da UI**

Delete `Trash2` import, `canDeleteEmployee`, delete state/dialog, `deleteEmployee()` and every delete button. No operational code path may call `delete_employee_user` from this page.

- [ ] **Step 3: Confirmar inativação**

Before active → inactive, open `ConfirmDialog` with explicit copy preserving historical data. Reactivation can execute directly.

- [ ] **Step 4: Separar status de edição**

Direct action button uses `setEmployeeActive`. In edit form, show `Funcionário ativo` only to `canToggleEmployee`; if changed, execute dedicated status action separately from editable profile payload.

- [ ] **Step 5: Corrigir dependência de permissão**

Change:

```ts
"employees.toggle_active": ["employees.edit", "employees.view"]
```

to:

```ts
"employees.toggle_active": ["employees.view"]
```

- [ ] **Step 6: Static verification**

Search `TabEmployees.tsx` for `Trash2`, `delete_employee_user`, `employees.delete`; expected zero operational references.

- [ ] **Step 7: Commit**

```bash
git add src/features/employees
git commit -m "feat(users): replace deletion with inactivation"
```

---

### Task 4: Acceptance verification

- [ ] **Step 1:** Verify database function execute grants expose only `service_role`.
- [ ] **Step 2:** Verify Edge action maps to `employees.toggle_active`.
- [ ] **Step 3:** Verify UI has action for active/inactive and no delete action.
- [ ] **Step 4:** Verify a user with only view + toggle can reach the dedicated backend permission path.
- [ ] **Step 5:** Verify cross-tenant employee lookup is rejected by organization predicate.
