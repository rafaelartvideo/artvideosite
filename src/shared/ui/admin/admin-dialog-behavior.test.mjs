import test from "node:test";
import assert from "node:assert/strict";
import {
  dialogSizingClass,
  preventAdminDialogOutsideInteraction,
  resolveDialogModalMode,
  setDialogMinimizedState,
} from "./admin-dialog-behavior.mjs";

test("restoring one dialog does not minimize another restored dialog", () => {
  const tasks = [
    { id: "customer", minimized: false, order: 1 },
    { id: "equipment", minimized: true, order: 2 },
  ];

  assert.deepEqual(setDialogMinimizedState(tasks, "equipment", false), [
    { id: "customer", minimized: false, order: 1 },
    { id: "equipment", minimized: false, order: 2 },
  ]);
});

test("managed dialogs are non-modal so multiple restored windows can coexist", () => {
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
