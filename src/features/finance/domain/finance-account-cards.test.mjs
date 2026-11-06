import test from "node:test";
import assert from "node:assert/strict";
import { parsePinnedFinanceAccounts, prioritizePinnedFinanceAccounts } from "./finance-account-cards.mjs";

test("pin inválido ou armazenamento malformado não quebra cartões", () => {
  assert.deepEqual(parsePinnedFinanceAccounts("{invalid"), []);
  assert.deepEqual(parsePinnedFinanceAccounts('{"x":1}'), []);
  assert.deepEqual(parsePinnedFinanceAccounts('["c","c","a",null]'), ["c","a"]);
});
test("fixadas aparecem primeiro e demais mantêm ordem anterior", () => {
  const accounts = [{id:"a"},{id:"b"},{id:"c"},{id:"d"}];
  assert.deepEqual(prioritizePinnedFinanceAccounts(accounts, ["c","a"]).map(x=>x.id), ["a","c","b","d"]);
  assert.deepEqual(accounts.map(x=>x.id),["a","b","c","d"]);
});
