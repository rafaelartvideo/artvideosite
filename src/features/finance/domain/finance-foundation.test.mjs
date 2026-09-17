import test from "node:test";
import assert from "node:assert/strict";
import {
  financeRoute,
  paymentMethodNetAmount,
  validateSecondApprovalThreshold,
} from "./finance-foundation.mjs";

test("normalizes finance foundation routes", () => {
  assert.deepEqual(financeRoute(null, null), { section: "overview", registry: null });
  assert.deepEqual(financeRoute("accounts", null), { section: "accounts", registry: null });
  assert.deepEqual(financeRoute("registries", "categories"), { section: "registries", registry: "categories" });
  assert.deepEqual(financeRoute("unknown", "anything"), { section: "overview", registry: null });
});

test("preserves finance title id inside payable and receivable sections", () => {
  assert.deepEqual(financeRoute("receivables", "abc"), { section: "receivables", registry: null, entryId: "abc" });
  assert.deepEqual(financeRoute("payables", "def"), { section: "payables", registry: null, entryId: "def" });
  assert.deepEqual(financeRoute("payables", null), { section: "payables", registry: null, entryId: null });
});

test("calculates net value after percentage and fixed fees", () => {
  assert.equal(paymentMethodNetAmount(1000, 3.5, 1.5), 963.5);
  assert.equal(paymentMethodNetAmount(100, 0, 0), 100);
  assert.equal(paymentMethodNetAmount(1, 100, 5), 0);
});

test("accepts nullable non-negative second approval threshold", () => {
  assert.deepEqual(validateSecondApprovalThreshold(""), { ok: true, value: null });
  assert.deepEqual(validateSecondApprovalThreshold("2.000,50"), { ok: true, value: 2000.5 });
  assert.deepEqual(validateSecondApprovalThreshold("2000.50"), { ok: true, value: 2000.5 });
  assert.equal(validateSecondApprovalThreshold("-1").ok, false);
  assert.equal(validateSecondApprovalThreshold("abc").ok, false);
});
