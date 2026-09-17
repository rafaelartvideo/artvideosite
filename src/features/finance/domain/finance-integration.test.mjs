import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstallments,
  inventoryPurchaseTotal,
  normalizePaymentSplits,
} from "./finance-integration.mjs";

test("normaliza pagamentos mistos e calcula saldo aberto", () => {
  const result = normalizePaymentSplits(1200, [
    { principal_amount: 300, payment_method_id: "pix", financial_account_id: "bank" },
    { principal_amount: 200, payment_method_id: "cash", financial_account_id: "cashbox" },
  ]);
  assert.equal(result.totalPaid, 500);
  assert.equal(result.openAmount, 700);
  assert.equal(result.valid, true);
  assert.equal(result.payments.length, 2);
});

test("rejeita pagamentos imediatos acima do total", () => {
  const result = normalizePaymentSplits(100, [{ principal_amount: 100.01, payment_method_id: "pix", financial_account_id: "bank" }]);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "payments_exceed_total");
});

test("calcula total de compra com desconto, frete e outros custos", () => {
  assert.equal(inventoryPurchaseTotal({ quantity: 5, unitCost: 100, discount: 50, freight: 20, otherCosts: 10 }), 480);
});

test("gera parcelas mensais fechando centavos exatamente", () => {
  assert.deepEqual(buildInstallments(100, 3, "2026-10-10"), [
    { installment_number: 1, due_date: "2026-10-10", amount: 33.34 },
    { installment_number: 2, due_date: "2026-11-10", amount: 33.33 },
    { installment_number: 3, due_date: "2026-12-10", amount: 33.33 },
  ]);
});

test("gera parcela única para saldo em aberto", () => {
  assert.deepEqual(buildInstallments(700, 1, "2026-09-17"), [
    { installment_number: 1, due_date: "2026-09-17", amount: 700 },
  ]);
});
