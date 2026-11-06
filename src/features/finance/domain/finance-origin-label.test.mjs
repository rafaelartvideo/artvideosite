import test from "node:test";
import assert from "node:assert/strict";
import { formatFinanceOriginLabel, financeServiceOrderLabel } from "./finance-origin-label.mjs";

test("referências de OS não usam # nem zeros à esquerda", () => {
  assert.equal(formatFinanceOriginLabel("OS #000001"), "OS 1");
  assert.equal(formatFinanceOriginLabel("OS#000"), "OS 0");
  assert.equal(formatFinanceOriginLabel("OS 00042"), "OS 42");
  assert.equal(formatFinanceOriginLabel("Ordem de Serviço #00123"), "OS 123");
  assert.equal(financeServiceOrderLabel("00012"), "OS 12");
});
test("labels sem OS não são alterados e número ausente mantém fallback", () => {
  assert.equal(formatFinanceOriginLabel("Compra de estoque"), "Compra de estoque");
  assert.equal(formatFinanceOriginLabel("OS Externa 090"), "OS Externa 090");
  assert.equal(financeServiceOrderLabel(""), "Ordem de Serviço");
});
