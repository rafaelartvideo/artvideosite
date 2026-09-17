# Finance Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Etapa 3 do Financeiro: aprovação/rejeição de Contas a Pagar e Contas a Receber manuais, com uma ou duas aprovações, usuários distintos, fila de pendências e histórico auditável.

**Architecture:** `financial_entries` continua sendo a fonte do estado atual e ganha uma trilha imutável em `financial_approvals`; decisões são executadas exclusivamente por RPC transacional com `FOR UPDATE`. A UI reutiliza as subseções de Pagar/Receber e acrescenta ações/fila de pendências, sem implementar baixas ou movimentações de caixa nesta etapa.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase/PostgreSQL, RLS, PL/pgSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-financeiro-design.md`

## Global Constraints

- Todo Contas a Pagar exige aprovação: 1 até o limite salvo no título, 2 acima dele.
- Contas a Receber manual exige exatamente 1 aprovação.
- Recebíveis automáticos de OS serão aprovados na integração futura; não implementar integração de OS nesta etapa.
- Para títulos com 2 aprovações, os aprovadores devem ser diferentes.
- O criador do lançamento não pode contar como segundo aprovador.
- Rejeição exige motivo e mantém histórico.
- Aprovação/rejeição exige permissão específica e validação server-side.
- Não criar exclusão física de aprovações nem títulos.
- Não implementar `financial_settlements`, `financial_movements`, recorrência, anexos, cobranças, OS ou Estoque nesta etapa.

---

### Task 1: Regras puras de aprovação

**Files:**
- Create: `src/features/finance/domain/finance-approval.mjs`
- Create: `src/features/finance/domain/finance-approval.test.mjs`
- Modify: `src/features/finance/domain/finance.types.ts`

**Interfaces:**
- Produces: `approvalProgress(requiredApprovals, approvals)`, `canUserApprove({ requiredApprovals, approvals, userId, creatorId })`, tipos `FinancialApproval`, `FinancialApprovalAction`.

- [ ] **Step 1: Write failing tests** cobrindo 1 aprovação, 2 aprovações, usuário repetido e criador tentando ser segundo aprovador.
- [ ] **Step 2: Run `node --test src/features/finance/domain/finance-approval.test.mjs` and confirm RED** por módulo inexistente.
- [ ] **Step 3: Implement minimal pure rules** retornando contagem válida, `pending/approved` e motivo de bloqueio.
- [ ] **Step 4: Run test and confirm all approval-domain tests pass.**
- [ ] **Step 5: Commit domain/types.**

### Task 2: Schema e RPC transacional de decisão

**Files:**
- Create: `supabase/migrations/20260917_finance_approvals.sql`
- Create: `supabase/tests/finance_approvals.sql`

**Interfaces:**
- Produces table `public.financial_approvals`.
- Produces RPC `public.decide_financial_entry(p_organization_id uuid, p_entry_id uuid, p_action text, p_note text default null) returns jsonb`.

**Schema:**
```sql
create table public.financial_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  financial_entry_id uuid not null,
  approver_user_id uuid not null,
  action text not null check (action in ('approve','reject')),
  approval_order smallint,
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, financial_entry_id)
    references public.financial_entries(organization_id, id) on delete restrict,
  foreign key (approver_user_id) references public.profiles(id) on delete restrict
);
```

**RPC rules:**
- lock entry `FOR UPDATE`;
- require pending state;
- choose permission by `entry_type`: `finance.receivables.approve` or `finance.payables.approve`;
- reject requires non-empty note, inserts `reject`, sets entry `rejected`, `rejected_at`, clears `approved_at`, writes event;
- approve refuses duplicate approve from same user;
- for required=2, second approver cannot equal creator and must differ from first approver;
- first approval keeps entry `pending`; final approval sets `approved`, `approved_at`, writes event;
- return `{status, approvals, required_approvals}`.

- [ ] **Step 1: Before migration, query `to_regclass('public.financial_approvals')` and verify missing.**
- [ ] **Step 2: Apply migration through Supabase.**
- [ ] **Step 3: Run rollback-only SQL scenarios** for single approval, double approval, duplicate user rejection, creator-as-second rejection, and mandatory reject note.
- [ ] **Step 4: Verify RLS, no anon grants, no direct authenticated INSERT/UPDATE/DELETE.**
- [ ] **Step 5: Commit migration/test.**

### Task 3: Repository e query state

**Files:**
- Modify: `src/infrastructure/query/query-keys.ts`
- Modify: `src/features/finance/infrastructure/finance-entries.repository.ts`
- Modify: `src/features/finance/application/useFinanceEntries.ts`

**Interfaces:**
- Produces `decideFinancialEntry(organizationId, entryId, action, note)`.
- Entry detail includes `approvals`.
- Produces mutation `decisionMutation` and invalidates list/detail/pending queries.

- [ ] **Step 1: Add query keys for approvals/pending counts.**
- [ ] **Step 2: Load approvals with title detail.**
- [ ] **Step 3: Add RPC gateway and mutation.**
- [ ] **Step 4: Ensure actual backend errors are propagated.**
- [ ] **Step 5: Commit repository/application changes.**

### Task 4: Approval UI on title details

**Files:**
- Create: `src/features/finance/presentation/FinanceApprovalPanel.tsx`
- Modify: `src/features/finance/presentation/FinanceEntryDetail.tsx`
- Modify: `src/features/finance/presentation/FinanceEntriesSection.tsx`

**Interfaces:**
- Approval panel consumes title, approvals and `hasPermission` result.
- Emits `approve()` / `reject(note)` via mutation.

**Behavior:**
- show progress `0/1`, `1/2`, `2/2`;
- show approver/date history;
- pending entries with permission show `Aprovar` and `Rejeitar`;
- rejection opens note input and requires text;
- after decision, detail/list update through query invalidation;
- hide actions after approved/rejected.

- [ ] **Step 1: Add approval panel component with loading/error states.**
- [ ] **Step 2: Wire panel into details without changing installments/rateio/history.**
- [ ] **Step 3: Show pending approval badge/count in list consistently.**
- [ ] **Step 4: Commit UI.**

### Task 5: Fila de aprovações na Visão Geral

**Files:**
- Create: `src/features/finance/presentation/FinancePendingApprovals.tsx`
- Modify: `src/features/finance/presentation/FinanceOverviewFoundation.tsx`
- Modify: `src/features/finance/presentation/TabFinance.tsx` only if routing callback is required.

**Behavior:**
- query pending AP/AR visible to current user;
- show description, contraparte, valor, tipo, aprovações atuais/necessárias e vencimento;
- click opens the existing title detail route;
- no separate sidebar module.

- [ ] **Step 1: Add pending query/repository helper reusing RLS-visible entries.**
- [ ] **Step 2: Render pending card/table in Finance overview.**
- [ ] **Step 3: Route click to `receivables/<id>` or `payables/<id>`.**
- [ ] **Step 4: Commit overview queue.**

### Task 6: Verification

- [ ] Run both finance domain test files and require zero failures.
- [ ] Run rollback-only database acceptance scenarios and confirm zero test residue.
- [ ] Verify `financial_approvals` has RLS, no anon grants and no direct authenticated writes.
- [ ] Verify no DELETE policy/grant was added.
- [ ] Search implementation and confirm this phase did not add settlements, movements, recurrence, OS or inventory finance integration.
- [ ] Do not check deployment unless explicitly requested by the user.
