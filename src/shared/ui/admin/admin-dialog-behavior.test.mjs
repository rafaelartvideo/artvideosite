import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dialogSizingClass,
  preventAdminDialogOutsideInteraction,
  resolveAdminBrowserBottomInset,
  resolveDialogModalMode,
  setDialogMinimizedState,
} from "./admin-dialog-behavior.mjs";

test("restoring one dialog returns any other restored dialog to the dock", () => {
  const tasks = [
    { id: "customer", minimized: false, order: 1 },
    { id: "equipment", minimized: true, order: 2 },
  ];

  assert.deepEqual(setDialogMinimizedState(tasks, "equipment", false), [
    { id: "customer", minimized: true, order: 1 },
    { id: "equipment", minimized: false, order: 2 },
  ]);
});

test("mobile bottom inset keeps a minimum browser-bar clearance when measurement is zero", () => {
  assert.equal(resolveAdminBrowserBottomInset(0, true), 64);
  assert.equal(resolveAdminBrowserBottomInset(28, true), 64);
  assert.equal(resolveAdminBrowserBottomInset(92, true), 92);
  assert.equal(resolveAdminBrowserBottomInset(28, false), 28);
});

test("restored dialogs preserve Radix modal mode, backdrop and body scroll lock", () => {
  // undefined means the Radix default (modal=true).
  assert.equal(resolveDialogModalMode(true, true), true);
  assert.equal(resolveDialogModalMode(true, undefined), undefined);
  assert.equal(resolveDialogModalMode(false, true), true);
  assert.equal(resolveDialogModalMode(false, undefined), undefined);
  // Explicit non-modal calls remain opt-in.
  assert.equal(resolveDialogModalMode(true, false), false);
});

test("admin dialogs do not receive the primitive desktop max-width cap", () => {
  assert.equal(dialogSizingClass(true), "w-[calc(100%-2rem)] max-w-none");
  assert.equal(dialogSizingClass(false), "w-full max-w-[calc(100%-2rem)] sm:max-w-lg");
});

test("outside interaction is prevented instead of dismissing an admin dialog", () => {
  let prevented = false;
  preventAdminDialogOutsideInteraction({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});

test("CRM dialogs use fade only, avoiding the competing zoom/slide/size animations", () => {
  const dialog = readFileSync("src/shared/ui/primitives/dialog.tsx", "utf8");
  const layout = readFileSync("src/shared/ui/admin/AdminLayout.tsx", "utf8");
  const editor = readFileSync("src/features/orders/presentation/OrderEditorPage.tsx", "utf8");

  assert.match(dialog, /isAdminDialog\s*\? "data-\[state=open\]:animate-in data-\[state=closed\]:animate-out data-\[state=closed\]:fade-out-0 data-\[state=open\]:fade-in-0"/);
  assert.match(dialog, /: "data-\[state=open\]:animate-in[^"\n]*zoom-in-95/);
  assert.doesNotMatch(layout, /transition-\[max-width,height\]/);
  assert.match(editor, /fullPage=\{Boolean\(editingOS\)\} smoothMotion=\{false\}/);
});


test("um único modal mantém o cabeçalho e expande o próprio conteúdo após o carregamento", () => {
  const layout = readFileSync("src/shared/ui/admin/AdminLayout.tsx", "utf8");
  const component = layout.split("export function AdminDialog({")[1].split("export function AdminPage(")[0];
  assert.equal((component.match(/<DialogContent\b/g) || []).length, 1);
  assert.equal((component.match(/<Dialog open=\{open\}/g) || []).length, 1);
  assert.match(component, /ref=\{contentRef\}/);
  assert.match(component, /node\.animate\(\[/);
  assert.match(component, /preparedSizeRef\.current/);
  assert.match(component, /height: .*before\.height/);
  assert.match(component, /height: .*after\.height/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /data-admin-dialog-preparing=\{showPreparation/);
  assert.match(component, /data-admin-dialog-ready=\{!showPreparation/);
  assert.match(component, /<DialogTitle className="break-words/);
  assert.match(component, /showPreparation \? "hidden" : "contents"/);
  assert.match(component, /!showPreparation && footer/);
  assert.match(component, /onRetryPreparing && <BtnPrimary/);
  assert.doesNotMatch(component, /h-16 w-16 shrink-0 items-center justify-center rounded-2xl/);
});

test("modais de dados somente revelam formulários e ações depois da preparação real", () => {
  const sources = [
    ["src/features/sales/presentation/SalesOrderDetailDialog.tsx", "Preparando pedido"],
    ["src/features/pdv/presentation/PdvSalesHistory.tsx", "Preparando venda"],
    ["src/features/pdv/presentation/PdvCashReports.tsx", "Preparando relatório de caixa"],
    ["src/features/orders/presentation/OrderSettingsDialog.tsx", "Preparando configurações da OS"],
    ["src/features/finance/presentation/FinanceSettingsSection.tsx", "Preparando configurações financeiras"],
  ];
  for (const [path, label] of sources) {
    const contents = readFileSync(path, "utf8");
    assert.match(contents, /preparing=\{/);
    assert.ok(contents.includes(label), path);
    assert.match(contents, /preparingError=\{/);
    assert.match(contents, /onRetryPreparing=\{/);
  }
});


test("modal de preparação é usado em estoque, comercial, financeiro e operações de auditoria", () => {
  const files = [
    "src/features/products/presentation/InventoryCatalogSettingsDialog.tsx",
    "src/features/sales/presentation/SalesPaymentTermsDialog.tsx",
    "src/features/sales/presentation/SalesReturnsDialog.tsx",
    "src/features/sales/presentation/SalesDeliveryDialog.tsx",
    "src/features/sales/presentation/SalesProposalDetailDialog.tsx",
    "src/features/audit/presentation/TabAuditLog.tsx",
    "src/features/management/presentation/ManagementTrashDialog.tsx",
    "src/features/technician-panel/presentation/TechnicianOrderHistoryDialog.tsx",
    "src/features/platform-providers/presentation/ProviderDetailsDialog.tsx",
    "src/features/sales/presentation/SalesProductDetailsDialog.tsx",
    "src/features/sales/presentation/SalesCheckoutDialog.tsx",
  ];
  for (const path of files) {
    const contents = readFileSync(path, "utf8");
    assert.match(contents, /preparing=\{/);
    assert.match(contents, /preparingText="Preparando /);
  }
});


test("Financeiro aguarda dados de extratos, contas e recibos na primeira abertura", () => {
  const paths = [
    "src/features/finance/presentation/FinanceEntriesSection.tsx",
    "src/features/finance/presentation/FinanceAccountsSection.tsx",
    "src/features/finance/presentation/FinanceReceiptHistoryDialog.tsx",
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /preparing=\{/);
    assert.match(source, /preparingText="Preparando /);
    assert.match(source, /onRetryPreparing=\{/);
  }
  const entries = readFileSync(paths[0], "utf8");
  const accounts = readFileSync(paths[1], "utf8");
  assert.match(entries, /preparingKey=\{selectedEntryId\}/);
  assert.match(accounts, /preparingKey=\{selectedAccount.id\}/);
});
