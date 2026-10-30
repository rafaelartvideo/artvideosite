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
  assert.match(entries, /min-h-52 w-full items-center justify-center text-center/);
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
