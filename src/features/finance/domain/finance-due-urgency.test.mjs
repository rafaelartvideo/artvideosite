import test from "node:test";
import assert from "node:assert/strict";
import { financialDueUrgency } from "./finance-due-urgency.mjs";

const today = new Date(2026, 10, 6, 12);
test("vencimento hoje e vencido são vermelhos", () => {
  assert.equal(financialDueUrgency("2026-11-06", today), "today");
  assert.equal(financialDueUrgency("2026-11-05", today), "overdue");
});
test("próximos três dias alerta laranja, até sete dias amarelo", () => {
  assert.equal(financialDueUrgency("2026-11-07", today), "urgent");
  assert.equal(financialDueUrgency("2026-11-09", today), "urgent");
  assert.equal(financialDueUrgency("2026-11-10", today), "soon");
  assert.equal(financialDueUrgency("2026-11-13", today), "soon");
});
test("vencimento distante e ausente não exibem alerta incorreto", () => {
  assert.equal(financialDueUrgency("2026-12-01", today), "normal");
  assert.equal(financialDueUrgency("", today), "none");
});
