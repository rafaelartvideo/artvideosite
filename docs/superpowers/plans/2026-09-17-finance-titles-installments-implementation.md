# Finance Titles and Installments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Etapa 2 do Financeiro com Contas a Pagar/Receber manuais, parcelas, rateio, detalhe do título e histórico básico, sem antecipar baixas, aprovações operacionais, recorrências ou integrações com OS/Estoque.

**Architecture:** O banco será a fonte de verdade para criação/edição do título por RPC transacional. `financial_entries` compartilha o núcleo de Pagar/Receber; parcelas e rateios ficam em tabelas filhas isoladas por `organization_id`; `financial_events` é histórico imutável. A UI usa um componente reutilizável para Pagar/Receber e mantém a navegação dentro do módulo único `Financeiro`.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase/PostgreSQL, Node test runner para regras puras `.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-17-financeiro-design.md`

## Global Constraints

- Toda informação financeira é isolada por `organization_id`.
- Valores monetários usam `numeric`, nunca `float`.
- Não existe DELETE operacional direto para títulos financeiros.
- Todo Contas a Pagar manual entra `pending` e grava o número de aprovações exigidas no momento da submissão.
- Todo Contas a Receber manual entra `pending` com exatamente 1 aprovação exigida.
- Nesta etapa não implementar `financial_settlements`, `financial_movements`, `financial_approvals`, recorrências, documentos, cobranças, OS ou Estoque.
- Rateio deve fechar exatamente o valor original do título; categoria de Receber deve ser `revenue` e de Pagar deve ser `expense`.
- Toda criação/edição deve registrar `financial_events` e preservar snapshots de contraparte/categoria/centro de custo.

---

### Task 1: Regras puras e tipos de títulos

**Files:**
- Create: `src/features/finance/domain/finance-entry.mjs`
- Create: `src/features/finance/domain/finance-entry.test.mjs`
- Modify: `src/features/finance/domain/finance.types.ts`
- Modify: `src/features/finance/domain/finance-foundation.mjs`

**Interfaces:**
- Produces: `splitInstallmentAmounts(total, count)`, `buildMonthlyInstallments(total, count, firstDueDate)`, `allocationAmount(total, mode, value)`, `validateAllocationTotal(total, allocations)`, `deriveEntryStatus(installments, today)`.
- Produces TS types: `FinancialEntry`, `FinancialInstallment`, `FinancialAllocation`, `FinancialEvent`, `FinancialEntryDetail`, `FinancialEntryDraft`.

- [ ] **Step 1: Write failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { splitInstallmentAmounts, buildMonthlyInstallments, validateAllocationTotal, deriveEntryStatus } from "./finance-entry.mjs";

test("divide centavos sem perder o total", () => {
  assert.deepEqual(splitInstallmentAmounts(100, 3), [33.34, 33.33, 33.33]);
});

test("gera parcelas mensais mantendo soma e vencimentos", () => {
  const rows = buildMonthlyInstallments(1200, 3, "2026-09-20");
  assert.deepEqual(rows.map(row => row.amount), [400, 400, 400]);
  assert.deepEqual(rows.map(row => row.due_date), ["2026-09-20", "2026-10-20", "2026-11-20"]);
});

test("rateio precisa fechar o valor do título", () => {
  assert.equal(validateAllocationTotal(1000, [{ amount: 600 }, { amount: 400 }]).ok, true);
  assert.equal(validateAllocationTotal(1000, [{ amount: 600 }, { amount: 399.99 }]).ok, false);
});

test("situação usa vencimento e saldo", () => {
  assert.equal(deriveEntryStatus([{ due_date: "2026-09-01", original_amount: 100, settled_amount: 0 }], "2026-09-17"), "overdue");
  assert.equal(deriveEntryStatus([{ due_date: "2026-10-01", original_amount: 100, settled_amount: 0 }], "2026-09-17"), "open");
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test src/features/finance/domain/finance-entry.test.mjs`
Expected: FAIL because `finance-entry.mjs` does not exist yet.

- [ ] **Step 3: Implement minimal money-safe helpers**

Use integer cents internally, normalize dates as `YYYY-MM-DD`, carry cent remainder into the first installments, and compare rateio totals in cents.

- [ ] **Step 4: Extend finance routing**

`FinanceSection` must include `receivables` and `payables`. `financeRoute("receivables", <uuid>)` and `financeRoute("payables", <uuid>)` must preserve the optional title id as `entryId`, while existing `registries` routing remains unchanged.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `node --test src/features/finance/domain/finance-entry.test.mjs src/features/finance/domain/finance-foundation.test.mjs`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/finance/domain
git commit -m "feat: add finance entry domain rules"
```

---

### Task 2: Schema, RLS e RPC transacional de títulos

**Files:**
- Create: `supabase/migrations/20260917170000_finance_titles_installments.sql`
- Create: `supabase/tests/finance_titles_installments.sql`

**Interfaces:**
- Produces tables: `financial_entries`, `financial_installments`, `financial_allocations`, `financial_events`.
- Produces RPC: `public.save_financial_entry(...) returns uuid`.

- [ ] **Step 1: Add schema assertions before migration**

```sql
select to_regclass('public.financial_entries') is not null as entries_exist;
select to_regclass('public.financial_installments') is not null as installments_exist;
select to_regclass('public.financial_allocations') is not null as allocations_exist;
select to_regclass('public.financial_events') is not null as events_exist;
```

Expected before migration: false.

- [ ] **Step 2: Create tables**

`financial_entries` stores type, description, competence/issue dates, original amount, approval snapshot/status, counterpart link and snapshots, origin, notes and audit users/timestamps. `financial_installments` stores sequence, due date and immutable original value. `financial_allocations` stores category/cost center plus snapshots, amount and percentage. `financial_events` stores immutable business events as JSONB.

- [ ] **Step 3: Add tenant-safe constraints/indexes**

Every child row must reference parent records using `(organization_id, id)` composite foreign keys. Add indexes for organization/type/status/date and unique `(financial_entry_id, installment_number)`.

- [ ] **Step 4: Implement `save_financial_entry`**

The RPC must:

```text
validate active organization membership + finance module
validate create/edit permission according to entry_type
lock current entry on edit
allow only manual entries in editable states
validate positive original amount
snapshot counterpart from entities when entity_id is provided
set required_approvals = 1 for manual receivable
set required_approvals = 1 or 2 for payable using financial_settings.second_approval_threshold
set approval_status = pending
replace installments/allocations atomically before approval
validate installment sum == original_amount
validate allocation sum == original_amount
validate category nature matches entry type
snapshot category/cost-center names
append created/submitted or updated/resubmitted financial_events
return entry id
```

- [ ] **Step 5: RLS/grants**

Receivable rows use `finance.receivables.view/create/edit`; payable rows use `finance.payables.view/create/edit`. Child rows inherit access through their parent entry. `financial_events` is SELECT-only for authenticated users; only RPCs write events. Revoke all from `anon`; do not grant DELETE to `authenticated`.

- [ ] **Step 6: Apply migration and run SQL verification**

Verify RLS enabled, no anon grants, no DELETE grants/policies, cross-organization FKs reject invalid links, and direct inserts cannot bypass intended permissions.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260917170000_finance_titles_installments.sql supabase/tests/finance_titles_installments.sql
git commit -m "feat: add finance titles schema"
```

---

### Task 3: Repository e React Query

**Files:**
- Create: `src/features/finance/infrastructure/finance-entries.repository.ts`
- Create: `src/features/finance/application/useFinanceEntries.ts`
- Modify: `src/infrastructure/query/query-keys.ts`

**Interfaces:**
- Produces: `listFinancialEntries(entryType)`, `getFinancialEntryDetail(id)`, `listFinancialCounterparties(entryType)`, `saveFinancialEntry(draft)`.
- Produces hook: `useFinanceEntries(entryType, selectedEntryId?)`.

- [ ] **Step 1: Add query keys**

```ts
finance: {
  all: ["finance"] as const,
  entries: (organizationId: string, type: "payable" | "receivable") => ["finance", organizationId, "entries", type] as const,
  entry: (organizationId: string, id: string) => ["finance", organizationId, "entry", id] as const,
}
```

- [ ] **Step 2: Implement repository**

List entries scoped to active organization. Detail loads title, installments, allocations and events. Counterparties use `entities`/`entity_roles`: suppliers first for payable, customers first for receivable, without preventing optional unlinked counterpart snapshot text.

- [ ] **Step 3: Implement mutations**

`saveFinancialEntry` calls the RPC only; do not perform multi-insert transactions from frontend. On success invalidate entry lists/detail.

- [ ] **Step 4: Commit**

```bash
git add src/features/finance/infrastructure src/features/finance/application src/infrastructure/query/query-keys.ts
git commit -m "feat: add finance entries data layer"
```

---

### Task 4: UI de Pagar/Receber e detalhe

**Files:**
- Create: `src/features/finance/presentation/FinanceEntriesSection.tsx`
- Create: `src/features/finance/presentation/FinanceEntryEditorDialog.tsx`
- Create: `src/features/finance/presentation/FinanceEntryDetail.tsx`
- Create: `src/features/finance/presentation/FinanceAllocationEditor.tsx`
- Modify: `src/features/finance/presentation/FinanceSectionTabs.tsx`
- Modify: `src/features/finance/presentation/TabFinance.tsx`

**Interfaces:**
- Reusable `FinanceEntriesSection({ entryType, selectedEntryId, onSelectEntry })`.
- Editor returns a complete `FinancialEntryDraft` including installments and allocations.

- [ ] **Step 1: Add main tabs**

Show `Contas a receber` when user has `finance.receivables.view`; show `Contas a pagar` when user has `finance.payables.view`. Existing foundation sections remain.

- [ ] **Step 2: Implement list**

Table/cards include descrição, contraparte, emissão, competência, próximo vencimento, valor original, status de aprovação and operational due state. Add search and status filter. `Novo lançamento` respects create permission.

- [ ] **Step 3: Implement editor**

Fields: descrição, contraparte opcional, emissão, competência, valor, observações. Parcelas support `1..60`, first due date and editable generated rows. Rateio supports multiple rows, mode `%` or `R$`, category filtered by nature, optional cost center, and live total validation.

- [ ] **Step 4: Implement detail**

Contextual tabs in this stage: `Resumo`, `Parcelas`, `Rateio`, `Histórico`. `Baixas`, `Documentos` and `Cobranças` are not rendered until their implementation stages.

- [ ] **Step 5: Route selection**

`/admin/finance/receivables/<id>` and `/admin/finance/payables/<id>` select a title without leaving the main Financeiro module. Closing detail returns to its list.

- [ ] **Step 6: Commit**

```bash
git add src/features/finance/presentation src/features/finance/domain/finance-foundation.mjs
git commit -m "feat: add finance payables and receivables ui"
```

---

### Task 5: Verification

- [ ] Run `node --test src/features/finance/domain/finance-entry.test.mjs src/features/finance/domain/finance-foundation.test.mjs` and require 0 failures.
- [ ] Run SQL checks confirming RLS, no anon access, no authenticated DELETE, tenant isolation and exact sums for installments/rateios.
- [ ] Search repository to confirm this phase did not add `financial_settlements`, `financial_movements`, `financial_approvals`, recurring generation, OS completion integration or inventory purchase integration.
- [ ] Review the diff against the Etapa 2 scope before declaring completion.
