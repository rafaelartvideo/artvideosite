import test from "node:test";
import assert from "node:assert/strict";
import { createFiscalDocumentService } from "./document-service.mjs";

const context = { actorId: "user-a", organizationId: "org-a", bindingId: "binding-a" };
const binding = { id: "binding-a", tenantId: "org-a", accountId: "account-a", cnpj: "00000000000001", externalCompanyId: 123, enabled: true };
const access = { binding, account: { id: "account-a", active: true }, verifiedCnpj: binding.cnpj, verifiedExternalCompanyId: 123, inventoryVerified: true, tenantFiscalEnabled: true, membershipVerified: true, permissionGranted: true };
function fixture(patch = {}, denyDownload = false) {
  const calls = [];
  const permissions = [];
  const service = createFiscalDocumentService({
    loadAccess: async input => {
      permissions.push(input.permission);
      return { ...access, ...patch, ...(denyDownload && input.permission === "fiscal.documents.download" ? { permissionGranted: false } : {}) };
    },
    loadProvider: async input => {
      calls.push(["provider", input]);
      return { listDocuments: async args => { calls.push(["list", args]); return []; }, getXml: async args => { calls.push(["xml", args]); return "xml"; } };
    }
  });
  return { service, calls, permissions };
}
test("listing derives CNPJ and provider account from trusted binding, not request payload", async () => {
  const { service, calls } = fixture();
  await service.listDocuments(context, { type: "nfe", cnpj: "99999999999999", accountId: "other", cursor: 1 });
  assert.deepEqual(calls, [["provider", { accountId: "account-a" }], ["list", { type: "nfe", cnpj: binding.cnpj, cursor: 1, limit: 50, filters: {} }]]);
});
test("tenant disabled, mismatched identity, wrong binding or unverified inventory denies calls", async () => {
  for (const patch of [{ tenantFiscalEnabled: false }, { membershipVerified: false }, { permissionGranted: false }, { inventoryVerified: false }, { verifiedCnpj: "99999999999999" }, { verifiedExternalCompanyId: 456 }, { binding: { ...binding, tenantId: "org-b" } }, { binding: { ...binding, id: "binding-b" } }]) {
    const { service, calls } = fixture(patch);
    await assert.rejects(service.listDocuments(context, { type: "nfe" }));
    assert.equal(calls.length, 0);
  }
});
test("download requires independent permission and uses scoped CNPJ", async () => {
  const denied = fixture({}, true);
  await assert.rejects(denied.service.getXml(context, { type: "nfe", id: 42 }));
  assert.deepEqual(denied.permissions, ["fiscal.documents.view", "fiscal.documents.download"]);
  assert.equal(denied.calls.some(([kind]) => kind === "xml"), false);
  const allowed = fixture();
  await allowed.service.getXml(context, { type: "nfe", id: 42, cnpj: "99999999999999" });
  assert.deepEqual(allowed.calls.at(-1), ["xml", { type: "nfe", id: 42, cnpj: binding.cnpj }]);
});
