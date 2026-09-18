import test from "node:test";
import assert from "node:assert/strict";
import {
  cashClosingDifference,
  nextRecurringDate,
  validateRecurringWindow,
} from "./finance-advanced.mjs";

test("avança recorrência semanal pelo intervalo informado", () => {
  assert.equal(nextRecurringDate("2026-09-18", "weekly", 2), "2026-10-02");
});

test("avança recorrência mensal preservando dia quando possível", () => {
  assert.equal(nextRecurringDate("2026-01-31", "monthly", 1), "2026-02-28");
  assert.equal(nextRecurringDate("2026-02-28", "monthly", 1), "2026-03-28");
});

test("avança recorrência anual respeitando ano bissexto", () => {
  assert.equal(nextRecurringDate("2024-02-29", "yearly", 1), "2025-02-28");
});

test("calcula diferença de fechamento em centavos", () => {
  assert.equal(cashClosingDifference(100.10, 99.99), -0.11);
  assert.equal(cashClosingDifference(100, 100), 0);
});

test("valida próxima ocorrência dentro da janela", () => {
  assert.equal(validateRecurringWindow("2026-09-18", "2026-10-18", null), true);
  assert.equal(validateRecurringWindow("2026-09-18", "2026-10-18", "2026-10-17"), false);
  assert.equal(validateRecurringWindow("2026-09-18", "2026-09-17", null), false);
});
