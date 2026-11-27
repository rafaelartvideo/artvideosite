import test from "node:test";
import assert from "node:assert/strict";
import { checkFiscalAccountCapacity, checkFiscalBinding, resolveFiscalScope } from "./account-policy.mjs";

const account = { id: "account-a", active: true, cnpjLimit: 6, inventoryVerified: true };
const cnpj = i => String(i).padStart(14, "0");
const inventory = Array.from({ length: 6 }, (_, i) => ({ accountId: account.id, cnpj: cnpj(i + 1) }));
const binding = { tenantId: "tenant-a", accountId: account.id, cnpj: cnpj(1), externalCompanyId: 123, enabled: true };
const authorized = { tenantId: binding.tenantId, binding, account, tenantFiscalEnabled: true, membershipVerified: true, permissionGranted: true };

test("six is an account configuration, not a global CRM tenant limit", () => {
  assert.equal(checkFiscalAccountCapacity({ account, inventory, candidateCnpj: cnpj(7) }).code, "ACCOUNT_CNPJ_LIMIT");
  assert.equal(checkFiscalAccountCapacity({ account, inventory, candidateCnpj: cnpj(6) }).allowed, true);
  assert.equal(checkFiscalAccountCapacity({ account: { ...account, cnpjLimit: 12 }, inventory, candidateCnpj: cnpj(7) }).available, 5);
  assert.equal(checkFiscalAccountCapacity({ account: { ...account, id: "account-b" }, inventory: [], candidateCnpj: cnpj(7) }).available, 5);
});
test("provider-side reservations count once and disabling tenant access does not free capacity", () => {
  const duplicate = [...inventory, { ...inventory[0], enabled: false }];
  assert.equal(checkFiscalAccountCapacity({ account, inventory: duplicate, candidateCnpj: cnpj(7) }).used, 6);
  assert.equal(checkFiscalAccountCapacity({ account, inventory: duplicate, candidateCnpj: cnpj(7) }).allowed, false);
});
test("unverified or foreign inventory fails closed", () => {
  assert.equal(checkFiscalAccountCapacity({ account: { ...account, inventoryVerified: false }, inventory, candidateCnpj: cnpj(7) }).allowed, false);
  assert.equal(checkFiscalAccountCapacity({ account, inventory: [{ ...inventory[0], accountId: "other" }], candidateCnpj: cnpj(7) }).allowed, false);
});
test("other tenants cannot take a reserved CNPJ or external company ID", () => {
  for (const candidate of [
    { ...binding, tenantId: "tenant-b" },
    { ...binding, tenantId: "tenant-b", cnpj: cnpj(2) },
    { ...binding, tenantId: "tenant-b", accountId: "account-b" },
  ]) assert.equal(checkFiscalBinding({ account, bindings: [{ ...binding, enabled: false }], inventory, candidate }).allowed, false);
  assert.equal(checkFiscalBinding({ account, bindings: [binding], inventory, candidate: binding }).allowed, true);
});
test("only a verified, entitled tenant with enabled binding and granted permission receives scope", () => {
  assert.deepEqual(resolveFiscalScope(authorized), { allowed: true, scope: { tenantId: "tenant-a", accountId: "account-a", cnpj: cnpj(1), externalCompanyId: 123 } });
  for (const patch of [
    { tenantId: "tenant-b" }, { tenantFiscalEnabled: false }, { tenantFiscalEnabled: undefined },
    { membershipVerified: false }, { permissionGranted: false },
    { binding: { ...binding, enabled: false } }, { account: { ...account, active: false } },
    { account: { ...account, id: "account-b" } },
  ]) assert.equal(resolveFiscalScope({ ...authorized, ...patch }).allowed, false);
});
