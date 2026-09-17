# Finance OS + Inventory Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar a conclusão financeira da OS ao Contas a Receber e entradas de compra do Estoque a pré-lançamentos de Contas a Pagar, com atomicidade, idempotência e sem duplicar títulos financeiros.

**Architecture:** As origens operacionais continuam donas de seus fluxos. A OS conclui por uma RPC transacional que atualiza `service_orders`, cria o Receber aprovado e opcionalmente registra recebimentos imediatos/mistos. A compra de estoque usa uma RPC transacional que registra a movimentação e cria um Pagar pendente de aprovação. `financial_entries` recebe metadados de origem e uma chave única `(organization_id, origin_type, origin_reference)` para impedir duplicatas.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase/PostgreSQL, PL/pgSQL, RLS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-financeiro-design.md`

## Global Constraints

- Recebíveis originados da conclusão da OS nascem aprovados, sem aprovação adicional.
- Contas a Pagar originadas do Estoque nascem pendentes e obedecem 1 ou 2 aprovações conforme o limite salvo na empresa.
- Estoque apenas envia/preenche o pré-lançamento; rejeição financeira não desfaz automaticamente a movimentação de estoque.
- Conclusão da OS + Receber e entrada de estoque + pré-lançamento devem ser atômicos.
- Nenhuma integração pode gerar dois títulos para a mesma origem.
- Lançamentos/movimentações aprovados não são excluídos fisicamente.
- Não implementar reconciliação bancária, NF-e, CNAB ou integrações bancárias.
- Não verificar deploy nesta etapa.

---

### Task 1: Regras puras dos payloads de integração

**Files:**
- Create: `src/features/finance/domain/finance-integration.mjs`
- Create: `src/features/finance/domain/finance-integration.test.mjs`

**Interfaces:**
- Produces `normalizePaymentSplits(total, splits)`.
- Produces `inventoryPurchaseTotal({ quantity, unitCost, discount, freight, otherCosts })`.
- Produces `buildInstallments(total, count, firstDueDate)` for inventory default installments.

- [ ] **Step 1: Write failing tests** for mixed OS payments, open balance, inventory total adjustments and installment rounding.
- [ ] **Step 2: Run `node --test src/features/finance/domain/finance-integration.test.mjs` and confirm RED.**
- [ ] **Step 3: Implement minimal rules using integer cents for rounding.**
- [ ] **Step 4: Run tests and require zero failures.**
- [ ] **Step 5: Commit domain tests/rules.**

### Task 2: Source metadata, defaults and idempotency

**Files:**
- Create: `supabase/migrations/20260917210000_finance_source_integrations.sql`
- Create: `supabase/tests/finance_source_integrations.sql`

**Interfaces:**
- Adds `financial_entries.source_details jsonb not null default '{}'`.
- Adds unique partial index on `(organization_id, origin_type, origin_reference)` for `service_order` and `inventory_purchase`.
- Ensures one active revenue category `Serviços` and one active expense category `Compras de estoque` per organization with Finance enabled; fills missing defaults in `financial_settings` without replacing configured values.
- Produces private helper `private.create_integrated_financial_entry(...) returns uuid` validating source uniqueness, installments, allocation/default category, approval snapshot and audit event.

- [ ] **Step 1: Verify source metadata/index/helper are absent before migration.**
- [ ] **Step 2: Apply migration through Supabase.**
- [ ] **Step 3: Run rollback-only cases for approved OS source, pending inventory source and duplicate origin rejection.**
- [ ] **Step 4: Verify RLS/grants unchanged and no DELETE grant/policy is introduced.**
- [ ] **Step 5: Commit migration/test.**

### Task 3: Atomic OS completion + Accounts Receivable

**Files:**
- Add to migration from Task 2 or create: `supabase/migrations/20260917211000_service_order_finance_integration.sql`
- Modify: `src/features/orders/infrastructure/orders.repository.ts`
- Modify: `src/features/orders/application/useOrderCompletion.ts`

**Interfaces:**
- Produces RPC `public.get_order_completion_finance_options(p_organization_id uuid) returns jsonb`, gated by `orders.complete`.
- Produces RPC `public.complete_service_order(p_service_order_id uuid, p_discount_percentage numeric, p_finance_payload jsonb) returns jsonb`.
- `p_finance_payload` accepts `installments[]` and `payments[]`; payment rows contain `principal_amount`, `payment_method_id`, `financial_account_id`, `occurred_at`.
- Response includes existing OS totals plus `financial_entry_id`, `open_amount`, and created settlement ids.
- Keep two-argument compatibility wrapper only if needed by existing callers.

- [ ] **Step 1: Write rollback test that concludes an eligible OS and asserts one approved receivable with origin `service_order`.**
- [ ] **Step 2: Add mixed immediate payments and assert settlements/movements plus remaining installment balance.**
- [ ] **Step 3: Retry same OS/source and assert duplicate completion/financial title is refused.**
- [ ] **Step 4: Update repository/hook payload types and propagate real backend errors.**
- [ ] **Step 5: Commit OS backend/application integration.**

### Task 4: OS completion payment UI

**Files:**
- Create: `src/features/orders/presentation/OrderCompletionPaymentSection.tsx`
- Modify: `src/features/orders/presentation/OrderCompletionModal.tsx`
- Modify: `src/features/orders/application/useOrderCompletion.ts`

**Behavior:**
- Modes: `Receber agora`, `Receber parcialmente`, `Deixar em aberto`.
- Allow multiple payment rows (mixed payment) with method + destination account + principal amount.
- Remaining amount generates one or more open installments with due dates; default one installment when left open.
- Show gross OS total, total received now and open balance.
- Payment options load through the dedicated order-completion RPC, not direct Finance table reads.

- [ ] **Step 1: Add payment state and validation in the hook.**
- [ ] **Step 2: Render payment section in the existing modal after summary.**
- [ ] **Step 3: Disable conclusion when payment rows exceed final total or an immediate payment lacks method/account.**
- [ ] **Step 4: Submit the finance payload atomically with OS completion.**
- [ ] **Step 5: Commit UI integration.**

### Task 5: Atomic inventory purchase + pending Accounts Payable

**Files:**
- Create: `supabase/migrations/20260917212000_inventory_purchase_finance_integration.sql`
- Modify: `src/features/inventory/infrastructure/inventory.repository.ts`
- Modify: `src/features/inventory/presentation/TabInventoryV2.tsx`

**Interfaces:**
- Produces RPC `public.record_inventory_purchase_with_finance(...) returns jsonb`.
- The RPC calls the existing stock movement semantics in the same transaction and creates exactly one `financial_entries` payable with origin `inventory_purchase` and reference = inventory movement id.
- Finance payload includes `discount`, `freight`, `other_costs`, `document_reference`, `installments[]`; title total = purchase item subtotal - discount + freight + other costs.
- Payable status is `pending`, approval requirement is snapshotted from `financial_settings.second_approval_threshold`.

- [ ] **Step 1: Rollback test purchase movement + finance pre-entry and assert stock quantity/cost + pending payable.**
- [ ] **Step 2: Test threshold above/below for `required_approvals` 1/2.**
- [ ] **Step 3: Test duplicate source protection and verify rejecting Finance does not reverse stock.**
- [ ] **Step 4: Extend inventory movement form with discount, freight, other costs, document/reference, installment count/first due date.**
- [ ] **Step 5: Repository chooses purchase+finance RPC only for IN/purchase; OUT/ADJUST keep existing RPC.**
- [ ] **Step 6: Commit inventory integration.**

### Task 6: Finance origin presentation and verification

**Files:**
- Modify: `src/features/finance/domain/finance.types.ts`
- Modify: `src/features/finance/infrastructure/finance-entries.repository.ts`
- Modify: `src/features/finance/presentation/FinanceEntryDetail.tsx`
- Modify: `src/features/finance/presentation/FinanceEntriesSection.tsx`

**Behavior:**
- Show origin labels `OS #...` and `Compra de estoque` from `source_details`/`origin_reference`.
- Inventory pre-entry shows supplier, item, quantity/cost, subtotal, discount, freight, other costs and document reference.
- OS receivable shows OS number, service/parts subtotal and OS discount snapshot.

- [ ] **Step 1: Load `source_details` in list/detail repository columns.**
- [ ] **Step 2: Add compact origin badges/list text and source block in details.**
- [ ] **Step 3: Run all finance domain tests and require zero failures.**
- [ ] **Step 4: Run rollback-only DB acceptance tests for OS + inventory integrations and assert zero residue.**
- [ ] **Step 5: Verify no anon grants, no direct writes added for integration tables, and no DELETE policy/grant.**
- [ ] **Step 6: Commit verification/presentation changes.**
