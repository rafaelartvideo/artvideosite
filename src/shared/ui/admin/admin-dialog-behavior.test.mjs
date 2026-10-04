import test from "node:test";
import assert from "node:assert/strict";
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

test("managed dialogs are non-modal so a restored window does not dismiss on portal focus changes", () => {
  assert.equal(resolveDialogModalMode(true, true), false);
  assert.equal(resolveDialogModalMode(true, undefined), false);
  assert.equal(resolveDialogModalMode(false, true), true);
  assert.equal(resolveDialogModalMode(false, undefined), undefined);
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
