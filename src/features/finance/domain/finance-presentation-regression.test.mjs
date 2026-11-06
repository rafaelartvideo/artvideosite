import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const presentation = new URL("../presentation/", import.meta.url);
const source = name => readFileSync(new URL(name, presentation), "utf8");

test("finance header owns the context-specific new action", () => {
  const tab = source("TabFinance.tsx");
  assert.match(tab, /const canCreateInSection =/);
  assert.match(tab, /setNewEntrySignal\(current => current \+ 1\)/);
  assert.match(tab, /<Plus size=\{17\} \/> Novo/);
  assert.match(tab, /Gerar recibo/);
  assert.match(tab, /Histórico/);
  assert.match(tab, /admin-action-blue-outline/);
  assert.match(tab, /bg-primary\/25/);
  assert.doesNotMatch(tab, /section === "recurring"/);
});

test("payables retain exactly three desktop filter columns and no OS field", () => {
  const entries = source("FinanceEntriesSection.tsx");
  assert.match(entries, /isReceivable \? "md:grid-cols-4" : "md:grid-cols-3"/);
  assert.match(entries, /max-h-\[176px\]/);
  assert.match(entries, /label="Origem" value=\{originSearch\}/);
  assert.doesNotMatch(entries, /\{!isReceivable && <div[^\n]*label="OS"/);
  assert.match(entries, /value=\{operationalFilter\} options=/);
  assert.match(entries, /<th className="text-right">Pendente<\/th>/);
  assert.doesNotMatch(entries, /AdminStickyToolbar/);
});

test("payables support supplier quick registration and recurring type", () => {
  const editor = source("FinanceEntryEditorDialog.tsx");
  assert.match(editor, /role="combobox"/);
  assert.match(editor, /FinanceQuickSupplierDialog/);
  assert.match(editor, /finance\.recurring\.manage/);
  assert.match(editor, /setAccountType\(event\.target\.value\)/);
  assert.match(editor, /recurring\.saveMutation\.mutateAsync/);
  assert.match(editor, /FinanceModalDropdown/);
  assert.match(source("FinanceModalDropdown.tsx"), /createPortal/);
  assert.doesNotMatch(editor, /onRecurringSelected/);
  assert.match(source("FinanceQuickSupplierDialog.tsx"), /roles: \["supplier"\]/);
});

test("finance amounts, summaries and loading retain requested styles", () => {
  const entries = source("FinanceEntriesSection.tsx");
  const detail = source("FinanceEntryDetail.tsx");
  assert.match(entries, /text-emerald-600 dark:text-emerald-400/);
  assert.match(entries, /text-foreground"\>\{formatCurrency\(entry\.original_amount\)\}/);
  assert.match(entries, /<LoadingState text="Carregando extrato" \/>/);
  assert.match(entries, /text-amber-600 dark:text-amber-400/);
  assert.match(detail, /px-5 py-4 text-center/);
});

test("financial sections use header creation and no sticky toolbars", () => {
  for (const name of ["FinanceRecurringSection.tsx", "FinanceAccountsSection.tsx", "FinanceMovementsSection.tsx", "FinanceCategoriesSection.tsx", "FinancePaymentMethodsSection.tsx"]) {
    assert.doesNotMatch(source(name), /AdminStickyToolbar/, name);
    assert.match(source(name), /createSignal/, name);
  }
});

test("recurrence uses ordinary payable rows with cancellation from account actions", () => {
  const tabs = source("FinanceSectionTabs.tsx");
  const entries = source("FinanceEntriesSection.tsx");
  const hook = readFileSync(new URL("../application/useFinanceRecurring.ts", import.meta.url), "utf8");
  const repo = readFileSync(new URL("../infrastructure/finance-recurring.repository.ts", import.meta.url), "utf8");
  assert.doesNotMatch(tabs, /Recorrências/);
  assert.doesNotMatch(entries, /Gerenciar recorrências|FinanceRecurringSection/);
  assert.match(entries, /entries\.map\(entry =>/);
  assert.match(entries, /Assinatura cancelada/);
  assert.match(entries, /Cancelar recorrência/);
  assert.match(entries, /Confirmar cancelamento/);
  assert.match(hook, /cancelMutation/);
  assert.match(repo, /cancel_financial_recurring_rule/);
});

test("receivable responsible dropdown binds outside-click to browser document, never CPF search text", () => {
  const entries = source("FinanceEntriesSection.tsx");
  assert.match(entries, /const \[documentSearch, setDocumentSearch\] = useState\(""\)/);
  assert.doesNotMatch(entries, /const \[document, setDocument\]/);
  assert.match(entries, /window\.document\.addEventListener\("pointerdown", closeOnOutside\)/);
  assert.match(entries, /window\.document\.removeEventListener\("pointerdown", closeOnOutside\)/);
  assert.match(entries, /useDebouncedValue\(documentSearch\)/);
  assert.match(entries, /value=\{documentSearch\}/);
});

test("finance submenus show permission-scoped totals without duplicated table counters", () => {
  const tab = source("TabFinance.tsx");
  const tabs = source("FinanceSectionTabs.tsx");
  const entries = source("FinanceEntriesSection.tsx");
  const accounts = source("FinanceAccountsSection.tsx");
  assert.match(tab, /count: "exact", head: true/);
  assert.match(tab, /counts=\{tabCounts\}/);
  assert.match(tabs, /Contas e caixas/);
  assert.match(tabs, /counts\?\.\[id\]/);
  assert.doesNotMatch(entries, /contas cadastradas/);
  assert.doesNotMatch(accounts, /contas cadastradas/);
});

test("accounts and cash share one table with vault balances and account statements", () => {
  const accounts = source("FinanceAccountsSection.tsx");
  const cash = source("FinanceCashSection.tsx");
  assert.match(accounts, /Saldo total/);
  assert.match(accounts, /Bancos e PIX/);
  assert.match(accounts, /Caixa físico/);
  assert.match(accounts, /<Vault/);
  assert.match(accounts, /setSelectedAccountId\(account\.id\)/);
  assert.match(accounts, /Extrato da conta/);
  assert.match(accounts, /max-h-\[264px\].*overflow-y-auto/);
  assert.match(accounts, /movementPageSize: 60/);
  assert.match(accounts, /Abrir caixa/);
  assert.match(accounts, /Suprimento/);
  assert.match(accounts, /Sangria/);
  assert.match(accounts, /Fechar caixa/);
  assert.doesNotMatch(accounts, /<FinanceCashSection/);
  assert.match(cash, /openMutation\.mutateAsync/);
  assert.match(cash, /adjustmentMutation\.mutateAsync/);
  assert.match(cash, /closeMutation\.mutateAsync/);
  assert.doesNotMatch(cash, /Caixa físico<\/h3>/);
});


test("statement search filters by dates before pagination and exposes settlement origin", () => {
  const movements = source("FinanceMovementsSection.tsx");
  const hook = readFileSync(new URL("../application/useFinanceMovements.ts", import.meta.url), "utf8");
  const repo = readFileSync(new URL("../infrastructure/finance-movements.repository.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../../supabase/migrations/20261106140000_finance_movement_period_search.sql", import.meta.url), "utf8");
  assert.match(movements, /AdminSearchPanel title="Buscar movimentações"/);
  assert.match(movements, /label="Data inicial"/);
  assert.match(movements, /label="Data final"/);
  assert.match(movements, /item\.origin_label/);
  assert.match(movements, /text-emerald-600 dark:text-emerald-400/);
  assert.match(hook, /movementStartAt/);
  assert.match(repo, /search_financial_movement_page_ids_v2/);
  assert.match(repo, /from\("financial_settlements"\)/);
  assert.match(repo, /from\("financial_entries"\)/);
  assert.match(migration, /movement\.occurred_at >= p_start_at/);
  assert.match(migration, /movement\.occurred_at < p_end_at/);
});

test("receivables can settle all installments as a single financial movement", () => {
  const dialog = source("FinanceSettlementDialog.tsx");
  const repository = readFileSync(new URL("../infrastructure/finance-movements.repository.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../../supabase/migrations/20261106151000_finance_bulk_settlement_and_amount_adjustment.sql", import.meta.url), "utf8");
  assert.match(dialog, /Quitar todo o saldo em aberto/);
  assert.match(dialog, /settle_all: settlementScope === "all"/);
  assert.match(dialog, /label=\{detail.entry_type === "payable" \? "Valor a pagar" : "Valor a receber"\} required/);
  assert.doesNotMatch(dialog, /label="Valor principal"/);
  assert.match(repository, /register_financial_bulk_settlement/);
  assert.match(migration, /create table if not exists public\.financial_settlement_allocations/);
  assert.match(migration, /perform private\.finance_post_settlement_movements\(v_settlement_id/);
  assert.match(migration, /financial_settlement_allocations a/);
  assert.match(migration, /finance\.settlements\.create/);
  assert.match(migration, /finance\.settlements\.reverse/);
});

test("forecast adjustments change only payable installments with a recorded reason", () => {
  const detail = source("FinanceEntryDetail.tsx");
  const repository = readFileSync(new URL("../infrastructure/finance-movements.repository.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../../supabase/migrations/20261106151000_finance_bulk_settlement_and_amount_adjustment.sql", import.meta.url), "utf8");
  assert.match(detail, /Ajustar previsão da parcela/);
  assert.doesNotMatch(detail, /Motivo da alteração/);
  assert.match(detail, /installment_amount_adjusted/);
  assert.match(repository, /adjust_financial_installment_forecast/);
  assert.match(migration, /v_e\.origin_type not in \('manual','recurring'\)/);
  assert.match(migration, /v_i\.settled_amount >= v_i\.original_amount/);
  assert.match(migration, /'installment_amount_adjusted'/);
  assert.match(migration, /finance\.payables\.edit/);
});

test("settlement supports inline payable installment adjustment with back navigation", () => {
  const dialog = source("FinanceSettlementDialog.tsx");
  const entries = source("FinanceEntriesSection.tsx");
  assert.match(dialog, /ariaLabel="Editar valor da parcela"/);
  assert.match(dialog, /<Pencil size=\{16\} \/>/);
  assert.match(dialog, /Salvar ajuste/);
  assert.doesNotMatch(dialog, /forecastEdit\.reason/);
  assert.match(dialog, /Valor atualizado durante a baixa financeira/);
  assert.match(dialog, /<ArrowLeft size=\{16\} \/> Voltar/);
  assert.match(dialog, /disabled=\{saving \|\| forecastPending \|\| Boolean\(forecastEdit\)\}/);
  assert.match(entries, /finance\.adjustInstallmentMutation\.mutateAsync/);
  assert.match(entries, /await finance\.detailQuery\.refetch\(\)/);
});
test("editing an existing finance entry happens in the current details modal", () => {
  const entries = source("FinanceEntriesSection.tsx");
  const editor = source("FinanceEntryEditorDialog.tsx");
  assert.match(entries, /editingSelectedEntry/);
  assert.match(entries, /<FinanceEntryEditorDialog\s+open embedded/);
  assert.match(entries, /open=\{editorOpen && !editingSelectedEntry\}/);
  assert.match(editor, /\{embedded \? <section aria-label="Editar lançamento"/);
  assert.match(editor, /<ArrowLeft size=\{16\} \/> Voltar/);
  assert.match(editor, /onClick=\{\(\) => void save\(\)\}/);
});
test("open amounts are orange, paid green and next due tag is inline with title", () => {
  const detail = source("FinanceEntryDetail.tsx");
  assert.match(detail, /Próximo vencimento: \{formatDate\(due\.due_date\)\}/);
  assert.match(detail, /financialDueUrgency\(due\?\.due_date\)/);
  assert.match(detail, /text-amber-600 dark:text-amber-400/);
  assert.match(detail, /text-emerald-600 dark:text-emerald-400/);
  assert.doesNotMatch(detail, /<p className="text-muted-foreground">Próximo vencimento<\/p>/);
});

test("details use icon actions and history stays inside the same modal", () => {
  const detail = source("FinanceEntryDetail.tsx");
  const tabs = source("FinanceSectionTabs.tsx");
  assert.match(detail, /AdminIconButton ariaLabel="Editar lançamento"/);
  assert.match(detail, /tab === "history"/);
  assert.match(detail, /ariaLabel=\{tab === "history" \? "Voltar ao resumo" : "Ver histórico"\}/);
  assert.match(detail, /\{tab === "history" && <div/);
  assert.doesNotMatch(detail, /<AdminCard><AdminCardHeader><h3 className="text-sm font-bold text-foreground">Origem/);
  assert.match(tabs, /className="mx-auto flex w-fit max-w-full justify-center overflow-x-auto"/);
  assert.match(detail, /bg-emerald-500\/10/);
  assert.match(detail, /bg-amber-500\/10/);
});
test("settlement editor removes duplicate headers, reason input and open balance summary", () => {
  const settlement = source("FinanceSettlementDialog.tsx");
  const editor = source("FinanceEntryEditorDialog.tsx");
  assert.doesNotMatch(settlement, /Informe os dados da baixa total ou parcial\./);
  assert.doesNotMatch(settlement, /Saldo em aberto da parcela:/);
  assert.doesNotMatch(settlement, />Principal<\/p>/);
  assert.doesNotMatch(settlement, /<FTextarea/);
  assert.doesNotMatch(editor, /Altere os dados e salve para voltar aos detalhes da conta\./);
  assert.match(settlement, /<AdminIconButton[\s\S]*?ariaLabel="Editar valor da parcela"/);
});
test("finance dialog loading is centered by the shared AdminDialog", () => {
  const entries = source("FinanceEntriesSection.tsx");
  const admin = readFileSync(new URL("../../../shared/ui/admin/AdminLayout.tsx", import.meta.url), "utf8");
  const loading = readFileSync(new URL("../../../shared/ui/admin/AdminFeedback.tsx", import.meta.url), "utf8");
  assert.match(entries, /\? <LoadingState text="Carregando extrato" \/>/);
  assert.match(admin, /\[data-admin-loading-state\]/);
  assert.match(loading, /data-admin-loading-state="true"/);
});

test("finance gear menu opens each registry directly in a permission-scoped modal", () => {
  const tabs = source("FinanceSectionTabs.tsx");
  const finance = source("TabFinance.tsx");
  assert.match(tabs, /onOpenRegistry\("categories"\)/);
  assert.match(tabs, /onOpenRegistry\("payment-methods"\)/);
  assert.match(tabs, /onOpenRegistry\("settings"\)/);
  assert.match(tabs, /availableRegistrySections\.includes\("categories"\)/);
  assert.match(tabs, /availableRegistrySections\.includes\("payment-methods"\)/);
  assert.match(tabs, /availableRegistrySections\.includes\("settings"\)/);
  assert.match(finance, /hasPermission\("finance\.categories\.manage"\)/);
  assert.match(finance, /hasPermission\("finance\.payment_methods\.manage"\)/);
  assert.match(finance, /hasPermission\("finance\.settings\.manage"\)/);
  assert.match(finance, /registryModal && availableRegistrySections\.includes\(registryModal\) && <AdminDialog/);
  assert.match(finance, /registryModal === "categories" && <FinanceCategoriesSection/);
  assert.match(finance, /registryModal === "payment-methods" && <FinancePaymentMethodsSection/);
  assert.match(finance, /registryModal === "settings" && <FinanceSettingsSection/);
  assert.match(finance, /setRegistryCreateSignal\(current => current \+ 1\)/);
  assert.doesNotMatch(finance, /section === "registries" && <FinanceRegistriesSection/);
});

test("legacy registry routes are redirected to the new modal workflow", () => {
  const finance = source("TabFinance.tsx");
  assert.match(finance, /if \(requested\.section !== "registries"\) return;/);
  assert.match(finance, /setRegistryModal\(registry\)/);
  assert.match(finance, /onRouteChange\?\.\(null, null\)/);
});
