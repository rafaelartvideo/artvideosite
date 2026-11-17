import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transform } from "esbuild";

test("drag keeps the full window inside every viewport edge", () => {
  const dimensions = {width:930,height:560,viewportWidth:1280,viewportHeight:720};
  for (const [left,top,expected] of [
    [-300,-100,{left:8,top:72}],
    [2000,2000,{left:342,top:152}],
    [175,111,{left:175,top:111}],
  ]) assert.deepEqual(clampAdminDialogPosition({...dimensions,left,top}), expected);
  const narrow = clampAdminDialogPosition({left:1500,top:900,width:768,height:620,viewportWidth:800,viewportHeight:700});
  assert.deepEqual(narrow,{left:24,top:72});
  assert.ok(narrow.left+768<=800 && narrow.top+620<=700);
});

test("clicking either floating window raises only that window", () => {
  const windows = [{style:{}},{style:{}}];
  const ownerDocument = {querySelectorAll: selector => {
    assert.equal(selector, '[data-admin-dialog-floating="true"]');
    return windows;
  }};
  windows.forEach(node=>node.ownerDocument=ownerDocument);
  activateAdminFloatingDialog(windows[0]);
  assert.deepEqual(windows.map(n=>n.style.zIndex),["150","149"]);
  activateAdminFloatingDialog(windows[1]);
  assert.deepEqual(windows.map(n=>n.style.zIndex),["149","150"]);
});

test("floating mode shares desktop focus, preserves mobile modality and removes drag latency", () => {
  const layout = readFileSync("src/shared/ui/admin/AdminLayout.tsx", "utf8");
  assert.match(layout,/floatingDesktop = floating && desktopWindow/);
  assert.match(layout,/modal=\{floatingDesktop \? false : modal\}/);
  assert.match(layout,/onPointerDownCapture=\{activateWindow\}/);
  assert.match(layout,/onFocusCapture=\{activateWindow\}/);
  assert.match(layout,/event\.target\.closest\('[^']+'\) === event\.currentTarget/);
  assert.match(layout,/node\.style\.setProperty\("transition", "none", "important"\)/);
  assert.match(layout,/const bounds = drag \?\? node\.getBoundingClientRect\(\)/);
  assert.match(layout,/md:cursor-grab md:active:cursor-grabbing/);
  assert.match(layout,/nestedScrollAssist && !floatingDesktop \? scrollNestedDialog : undefined/);
  assert.doesNotMatch(layout,/GripHorizontal|md:cursor-move/);
  const whatsapp = readFileSync("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx", "utf8");
  const editor = readFileSync("src/features/orders/presentation/OrderEditorPage.tsx", "utf8");
  assert.match(whatsapp,/title="Atendimento WhatsApp"\s+draggable\s+floating/);
  assert.match(editor,/draggable floating modal showOverlay=\{false\}/);
});
import {
  activateAdminFloatingDialog,
  clampAdminDialogPosition,
  dialogSizingClass,
  preventAdminDialogOutsideInteraction,
  resolveAdminBrowserBottomInset,
  resolveDialogModalMode,
  setDialogMinimizedState,
} from "./admin-dialog-behavior.mjs";

test("DialogContent forwards the React 18 ref to the actual Radix content", async () => {
  const source = readFileSync("src/shared/ui/primitives/dialog.tsx", "utf8");
  const start = source.indexOf("const DialogContent = React.forwardRef");
  assert.ok(start >= 0, "React 18 requires forwardRef for the content DOM ref");
  const component = source.slice(start, source.indexOf("function DialogHeader", start));
  const { code } = await transform(component + "\nreturn DialogContent;", { loader: "tsx" });
  const Content = new Function("React", "DialogRuntimeContext", "useOptionalAdminDialogManager", "useDialogMinimizeAction", "DialogPortal", "DialogOverlay", "DialogPrimitive", "cn", "dialogSizingClass", code)(
    { ...React, useContext: () => null }, {}, () => null, () => () => {},
    "portal", "overlay", { Content: "radix-content" }, () => "", () => "",
  );
  assert.equal(Content.$$typeof, Symbol.for("react.forward_ref"));
  const ref = React.createRef();
  const tree = Content.render({ children: "form", showClose: false }, ref);
  const radix = React.Children.toArray(tree.props.children).find(child => child.type === "radix-content");
  assert.equal(radix.ref, ref, "AdminDialog must receive the actual Radix DOM element");
});

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
  assert.match(component, /ref=\{attachDialogContent\}/);
  assert.match(component, /contentRef\.current = node/);
  assert.match(component, /\[open, draggable, dialogNode, floatingDesktop\]/);
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

