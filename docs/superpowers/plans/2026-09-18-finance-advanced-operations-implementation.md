# Finance Advanced Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Etapa 6 do Financeiro: caixa físico, recorrências, documentos, cobranças e operação global das liquidações futuras.

**Architecture:** O núcleo existente de títulos, baixas e movimentos continua sendo a fonte da verdade. Caixa físico adiciona sessões e movimentos de suprimento/sangria; recorrências geram títulos independentes; documentos usam bucket privado e metadados auditáveis; cobranças são histórico append-only; liquidações futuras reutilizam `financial_settlements` e a RPC de confirmação já existente.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase/PostgreSQL, PL/pgSQL, Supabase Storage, RLS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-financeiro-design.md`

## Global Constraints

- Um único módulo Financeiro com subseções internas.
- Todas as linhas financeiras são isoladas por `organization_id`.
- Sem hard delete de histórico financeiro.
- Ações sensíveis usam RPCs com validação de permissão e organização.
- Recorrências criam ocorrências independentes; alterações não reescrevem títulos antigos.
- Caixa físico só é obrigatório quando `financial_settings.cash_session_enabled=true`.
- Documentos ficam em bucket privado e arquivamento não apaga o arquivo histórico.
- Cobranças não alteram valores do título.
- Liquidação futura só entra no saldo real depois de confirmada.
- Não implementar conciliação bancária.
- Não verificar deploy nesta etapa.

---

### Task 1: Regras puras da operação avançada

**Files:**
- Create: `src/features/finance/domain/finance-advanced.mjs`
- Create: `src/features/finance/domain/finance-advanced.test.mjs`

**Interfaces:**
- Produces `nextRecurringDate(date, frequency, interval)`.
- Produces `cashClosingDifference(expected, counted)`.
- Produces `validateRecurringWindow(start, next, end)`.

- [ ] **Step 1:** Escrever testes falhando para mensal/semanal/anual, diferença de caixa e janela de recorrência.
- [ ] **Step 2:** Executar os testes e confirmar RED.
- [ ] **Step 3:** Implementar usando datas ISO e arredondamento monetário em centavos.
- [ ] **Step 4:** Executar testes e exigir zero falhas.
- [ ] **Step 5:** Commit.

### Task 2: Schema e RPCs de caixa físico

**Files:**
- Create: `supabase/migrations/20260918080000_finance_cash_sessions.sql`
- Create: `supabase/tests/finance_cash_sessions.sql`
- Modify: `src/features/finance/domain/finance.types.ts`
- Create: `src/features/finance/infrastructure/finance-cash.repository.ts`
- Create: `src/features/finance/application/useFinanceCash.ts`
- Create: `src/features/finance/presentation/FinanceCashSection.tsx`

**Interfaces:**
- Table `financial_cash_sessions`.
- Adds optional `cash_session_id` to `financial_movements`.
- Movement types add `supply` and `withdraw`; source type adds `cash_session`.
- RPCs: `open_financial_cash_session`, `record_financial_cash_adjustment`, `close_financial_cash_session`.
- One open session per financial account.
- Opening requires account `allows_cash_session=true`.
- Closing computes expected vs counted and requires reason when difference != 0.

- [ ] **Step 1:** Write structural/rollback test first.
- [ ] **Step 2:** Apply migration.
- [ ] **Step 3:** Test open, duplicate open rejection, supply, sangria, close, divergence rule and rollback.
- [ ] **Step 4:** Add repository/hook/UI inside Caixas e contas.
- [ ] **Step 5:** Commit.

### Task 3: Recorrências

**Files:**
- Create: `supabase/migrations/20260918083000_finance_recurring_rules.sql`
- Create: `supabase/tests/finance_recurring_rules.sql`
- Modify: `src/features/finance/domain/finance.types.ts`
- Create: `src/features/finance/infrastructure/finance-recurring.repository.ts`
- Create: `src/features/finance/application/useFinanceRecurring.ts`
- Create: `src/features/finance/presentation/FinanceRecurringSection.tsx`
- Modify: `src/features/finance/presentation/TabFinance.tsx`
- Modify: `src/features/finance/presentation/FinanceSectionTabs.tsx`
- Modify: `src/features/finance/domain/finance-foundation.mjs`

**Interfaces:**
- Table `financial_recurring_rules`.
- Rule stores cadence, next occurrence and immutable entry template JSON.
- RPCs: `save_financial_recurring_rule`, `generate_financial_recurring_occurrences`, `set_financial_recurring_rule_active`.
- Generated title uses origin `recurring` and unique origin reference `<rule_id>:<date>`.
- Default rolling generation horizon: 90 days.
- Generated AP/AR enters the normal approval flow.

- [ ] **Step 1:** Structural test and duplicate occurrence test.
- [ ] **Step 2:** Apply migration.
- [ ] **Step 3:** Test generation, idempotency, deactivation and approval snapshots using rollback.
- [ ] **Step 4:** Add repository/hook/subsection.
- [ ] **Step 5:** Commit.

### Task 4: Documentos financeiros

**Files:**
- Create: `supabase/migrations/20260918090000_finance_documents.sql`
- Create: `supabase/tests/finance_documents.sql`
- Modify: `src/features/finance/domain/finance.types.ts`
- Create: `src/features/finance/infrastructure/finance-documents.repository.ts`
- Create: `src/features/finance/presentation/FinanceDocumentsPanel.tsx`
- Modify: `src/features/finance/presentation/FinanceEntryDetail.tsx`
- Modify: `src/features/finance/presentation/FinanceEntriesSection.tsx`

**Interfaces:**
- Private bucket `financial-documents`.
- Table `financial_attachments` linked to entry and optionally settlement.
- Files stored under `<organization_id>/<entry_id>/...`.
- Archive attachment via RPC; no hard delete.
- Signed URL for viewing.
- Permissions `finance.documents.view/manage`.

- [ ] **Step 1:** Create structural security test.
- [ ] **Step 2:** Apply migration/bucket policies.
- [ ] **Step 3:** Test cross-org access rejection and archive preserving metadata.
- [ ] **Step 4:** Add upload/view/archive UI.
- [ ] **Step 5:** Commit.

### Task 5: Cobranças de Contas a Receber

**Files:**
- Create: `supabase/migrations/20260918093000_finance_collections.sql`
- Create: `supabase/tests/finance_collections.sql`
- Modify: `src/features/finance/domain/finance.types.ts`
- Create: `src/features/finance/infrastructure/finance-collections.repository.ts`
- Create: `src/features/finance/presentation/FinanceCollectionsPanel.tsx`
- Modify: `src/features/finance/presentation/FinanceEntryDetail.tsx`
- Modify: `src/features/finance/presentation/FinanceEntriesSection.tsx`

**Interfaces:**
- Table `financial_collection_logs`.
- RPC `register_financial_collection_log`.
- Receivables only.
- Stores channel, note, contacted_at and optional next_follow_up_at.
- Append-only.

- [ ] **Step 1:** Write structural test.
- [ ] **Step 2:** Apply migration and rollback acceptance tests.
- [ ] **Step 3:** Add repository/panel only for receivables.
- [ ] **Step 4:** Show next follow-up in list/detail where applicable.
- [ ] **Step 5:** Commit.

### Task 6: Liquidações futuras globais e fechamento da etapa

**Files:**
- Modify: `src/features/finance/infrastructure/finance-movements.repository.ts`
- Modify: `src/features/finance/application/useFinanceMovements.ts`
- Modify: `src/features/finance/presentation/FinanceMovementsSection.tsx`
- Modify: `src/features/finance/domain/finance.types.ts`
- Test: existing finance domain tests + new advanced tests.

**Behavior:**
- List scheduled settlements ordered by expected date.
- Show gross, fee, net, method, account and expected date.
- Allow confirmation with `confirm_financial_settlement`.
- Keep actual balance based only on posted movements.
- Surface overdue scheduled settlements visually without auto-posting them.

- [ ] **Step 1:** Add repository query and hook.
- [ ] **Step 2:** Add scheduled settlement panel in Movimentações.
- [ ] **Step 3:** Confirm one scheduled settlement in rollback test and verify movement appears only after confirmation.
- [ ] **Step 4:** Run all finance domain tests.
- [ ] **Step 5:** Verify RLS, anon grants, direct writes and zero test residue.
- [ ] **Step 6:** Commit.
