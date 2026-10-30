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
});

test("payables retain exactly three desktop filter columns and no OS field", () => {
  const entries = source("FinanceEntriesSection.tsx");
  assert.match(entries, /md:grid md:grid-cols-3/);
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
  assert.match(editor, /onRecurringSelected\?\.\(\)/);
  assert.match(source("FinanceQuickSupplierDialog.tsx"), /roles: \["supplier"\]/);
});

test("finance amounts, summaries and loading retain requested styles", () => {
  const entries = source("FinanceEntriesSection.tsx");
  const detail = source("FinanceEntryDetail.tsx");
  assert.match(entries, /text-emerald-600 dark:text-emerald-400/);
  assert.match(entries, /text-foreground"\>\{formatCurrency\(entry\.original_amount\)\}/);
  assert.match(entries, /min-h-52 w-full items-center justify-center text-center/);
  assert.match(detail, /px-5 py-4 text-center/);
});

test("financial sections use header creation and no sticky toolbars", () => {
  for (const name of ["FinanceRecurringSection.tsx", "FinanceAccountsSection.tsx", "FinanceMovementsSection.tsx", "FinanceCategoriesSection.tsx", "FinancePaymentMethodsSection.tsx"]) {
    assert.doesNotMatch(source(name), /AdminStickyToolbar/, name);
    assert.match(source(name), /createSignal/, name);
  }
});
