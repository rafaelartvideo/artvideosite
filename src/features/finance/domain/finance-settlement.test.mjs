import test from "node:test";
import assert from "node:assert/strict";
import {
  settlementCashAmount,
  paymentMethodFee,
  settlementNetAmount,
  validatePrincipalAgainstRemaining,
  expectedSettlementDate,
} from "./finance-settlement.mjs";

test("calcula valor da baixa sem alterar o principal", () => {
  assert.equal(settlementCashAmount({ principal: 100, interest: 10, penalty: 5, additions: 2, discount: 20 }), 97);
});

test("calcula taxa percentual e fixa e valor líquido", () => {
  assert.equal(paymentMethodFee(1000, 3.5, 1.5), 36.5);
  assert.equal(settlementNetAmount(1000, 36.5), 963.5);
});

test("impede principal acima do saldo da parcela", () => {
  assert.deepEqual(validatePrincipalAgainstRemaining(400, 500), { ok: true, principal: 400, remaining: 500 });
  assert.equal(validatePrincipalAgainstRemaining(500.01, 500).ok, false);
  assert.equal(validatePrincipalAgainstRemaining(0, 500).ok, false);
});

test("calcula data prevista de liquidação em dias corridos", () => {
  assert.equal(expectedSettlementDate("2026-09-17", 0), "2026-09-17");
  assert.equal(expectedSettlementDate("2026-09-17", 30), "2026-10-17");
});
