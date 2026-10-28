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
