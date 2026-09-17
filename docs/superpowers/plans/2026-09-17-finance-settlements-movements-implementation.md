# Finance Settlements and Movements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Etapa 4 do Financeiro com baixas parciais/totais, juros/multa/desconto/acréscimos, taxas e liquidação futura, saldos derivados de movimentações, transferências e estornos auditáveis.

**Architecture:** `financial_settlements` registra a liquidação do título/parcela e seus ajustes sem sobrescrever o valor original. `financial_movements` é o livro-caixa imutável por conta: saldos são derivados da soma de créditos e débitos posted. Liquidações futuras podem ficar `scheduled` até confirmação; transferências e estornos criam movimentos pareados/inversos via RPC transacional.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase/PostgreSQL, RLS, PL/pgSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-financeiro-design.md`

## Global Constraints

- Somente títulos `approved` podem receber baixas.
- Baixa parcial nunca altera `original_amount`; atualiza somente `settled_amount` da parcela.
- O principal aplicado não pode superar o saldo da parcela.
- Juros, multa, outros acréscimos e desconto ficam armazenados separadamente.
- Valor da baixa = principal + juros + multa + outros acréscimos - desconto e deve ser positivo.
- Taxa da forma de pagamento é snapshot da configuração no momento da baixa.
- Saldo da conta deriva exclusivamente de `financial_movements` posted; não existe campo editável de saldo.
- Liquidação futura (`creates_future_settlement=true`) baixa o título, mas só afeta saldo após confirmação da liquidação.
- Movimentos não são apagados nem editados; estorno cria movimentos inversos.
- Transferência entre contas não é receita/despesa e deve gerar débito + crédito pareados.
- Não implementar integração OS/Estoque, recorrência, caixa físico, documentos, cobranças ou relatórios nesta etapa.

---

### Task 1: Regras puras de baixa

**Files:**
- Create: `src/features/finance/domain/finance-settlement.mjs`
- Create: `src/features/finance/domain/finance-settlement.test.mjs`
- Modify: `src/features/finance/domain/finance.types.ts`
- Modify: `src/features/finance/domain/finance-foundation.mjs` (somente rota `movements`)

**Interfaces:**
- `settlementCashAmount({ principal, interest, penalty, additions, discount })`
- `paymentMethodFee(gross, percentageFee, fixedFee)`
- `settlementNetAmount(gross, fee)`
- `validatePrincipalAgainstRemaining(principal, remaining)`
- tipos `FinancialSettlement`, `FinancialMovement`, `FinancialTransfer`, `FinancialSettlementDraft`.

- [ ] Write tests first for partial principal, adjustments, fee/net and overpayment rejection.
- [ ] Confirm RED before implementation.
- [ ] Implement using integer cents for money comparisons.
- [ ] Run tests and confirm GREEN.

### Task 2: Schema e RPCs transacionais

**Files:**
- Create: `supabase/migrations/20260917_finance_settlements_movements.sql`
- Create: `supabase/tests/finance_settlements_movements.sql`

**Tables:**
- `financial_settlements`
- `financial_movements`
- `financial_transfers`

**RPCs:**
- `register_financial_settlement(...)`
- `confirm_financial_settlement(...)`
- `reverse_financial_settlement(...)`
- `transfer_financial_funds(...)`
- `reverse_financial_transfer(...)`
- `get_financial_account_balances(...)`

**Security:**
- RLS em todas as tabelas.
- Authenticated recebe SELECT quando possui permissão correspondente; nenhuma escrita direta.
- `anon` sem grants e sem execução de RPCs.
- RPCs usam `FOR UPDATE`, validam empresa ativa, permissão, estado, conta/forma de pagamento e concorrência.

- [ ] Apply migration.
- [ ] Run rollback-only acceptance scenarios for partial/full settlement, overpayment rejection, scheduled settlement confirmation, settlement reversal, transfer and transfer reversal.
- [ ] Verify RLS/grants/no DELETE.

### Task 3: Repository e query state

**Files:**
- Create: `src/features/finance/infrastructure/finance-movements.repository.ts`
- Create: `src/features/finance/application/useFinanceMovements.ts`
- Modify: `src/features/finance/infrastructure/finance-entries.repository.ts`
- Modify: `src/features/finance/application/useFinanceEntries.ts`
- Modify: `src/infrastructure/query/query-keys.ts`

**Interfaces:**
- list settlements by entry/detail;
- register/confirm/reverse settlement;
- list account movements and balances;
- create/reverse transfer.

- [ ] Add query keys.
- [ ] Detail loads settlements.
- [ ] Mutations invalidate detail/list/balances/movements.

### Task 4: Baixas no detalhe do título

**Files:**
- Create: `src/features/finance/presentation/FinanceSettlementPanel.tsx`
- Create: `src/features/finance/presentation/FinanceSettlementDialog.tsx`
- Modify: `src/features/finance/presentation/FinanceEntryDetail.tsx`
- Modify: `src/features/finance/presentation/FinanceEntriesSection.tsx`

**Behavior:**
- mostrar baixas existentes e status posted/scheduled/reversed;
- botão Receber/Pagar somente em título aprovado com saldo aberto e permissão;
- seleção da parcela e principal até o saldo;
- juros, multa, desconto, outros acréscimos;
- forma de pagamento e conta;
- preview bruto/taxa/líquido/data prevista;
- confirmar liquidação futura e estornar com motivo.

### Task 5: Movimentações, transferências e saldos

**Files:**
- Create: `src/features/finance/presentation/FinanceMovementsSection.tsx`
- Create: `src/features/finance/presentation/FinanceTransferDialog.tsx`
- Modify: `src/features/finance/presentation/FinanceAccountsSection.tsx`
- Modify: `src/features/finance/presentation/FinanceSectionTabs.tsx`
- Modify: `src/features/finance/presentation/TabFinance.tsx`

**Behavior:**
- nova subseção interna `Movimentações`;
- lista de créditos/débitos com origem e status;
- transferência entre contas ativas;
- estorno de transferência com motivo;
- `Caixas e contas` exibe saldo calculado, nunca editável.

### Task 6: Verification

- [ ] Run finance settlement/domain tests with zero failures.
- [ ] Run database rollback scenarios with zero residue.
- [ ] Verify no anon grants, no direct authenticated writes, no DELETE policies.
- [ ] Verify account balance equals posted credits minus posted debits.
- [ ] Confirm this phase did not add OS/Estoque integrations, recurrence, cash-session, documents, collections or reports.
- [ ] Do not check deployment unless explicitly requested.
