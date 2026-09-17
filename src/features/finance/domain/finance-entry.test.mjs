import test from "node:test";
import assert from "node:assert/strict";
import {
  splitInstallmentAmounts,
  buildMonthlyInstallments,
  allocationAmount,
  validateAllocationTotal,
  deriveEntryStatus,
} from "./finance-entry.mjs";

test("divide centavos sem perder o total", () => {
  assert.deepEqual(splitInstallmentAmounts(100, 3), [33.34, 33.33, 33.33]);
});

test("gera parcelas mensais mantendo soma e vencimentos", () => {
  const rows = buildMonthlyInstallments(1200, 3, "2026-09-20");
  assert.deepEqual(rows.map(row => row.amount), [400, 400, 400]);
  assert.deepEqual(rows.map(row => row.due_date), ["2026-09-20", "2026-10-20", "2026-11-20"]);
});

test("ajusta vencimento ao último dia do mês", () => {
  const rows = buildMonthlyInstallments(200, 2, "2026-01-31");
  assert.deepEqual(rows.map(row => row.due_date), ["2026-01-31", "2026-02-28"]);
});

test("calcula rateio em percentual e exige fechamento exato", () => {
  assert.equal(allocationAmount(1000, "percentage", 60), 600);
  assert.equal(validateAllocationTotal(1000, [{ amount: 600 }, { amount: 400 }]).ok, true);
  assert.equal(validateAllocationTotal(1000, [{ amount: 600 }, { amount: 399.99 }]).ok, false);
});

test("deriva situação por saldo e vencimento", () => {
  assert.equal(deriveEntryStatus([{ due_date: "2026-09-01", original_amount: 100, settled_amount: 0 }], "2026-09-17"), "overdue");
  assert.equal(deriveEntryStatus([{ due_date: "2026-10-01", original_amount: 100, settled_amount: 0 }], "2026-09-17"), "open");
  assert.equal(deriveEntryStatus([{ due_date: "2026-10-01", original_amount: 100, settled_amount: 20 }], "2026-09-17"), "partial");
  assert.equal(deriveEntryStatus([{ due_date: "2026-10-01", original_amount: 100, settled_amount: 100 }], "2026-09-17"), "settled");
});
