import test from "node:test";
import assert from "node:assert/strict";

let policy = null;
try { policy = await import("./base-pdf-policy.mjs"); } catch {}

test("discovers external and employee signature kinds from frozen snapshot", () => {
  assert.ok(policy, "base pdf policy module must exist");
  const snapshot = { sections: [{ key: "signatures", fields: [
    { key: "signatures.customer", kind: "signature" },
    { key: "signatures.employee", kind: "signature" },
  ]}] };
  assert.deepEqual(policy.signatureKindsFromSnapshot(snapshot), ["external", "employee"]);
});

test("builds deterministic request base pdf path", () => {
  assert.ok(policy);
  assert.equal(policy.requestBasePdfPath({ organization_id: "org", service_order_id: "os", id: "req" }), "org/os/req/original.pdf");
});

test("builds deterministic preview path from snapshot hash", () => {
  assert.ok(policy);
  assert.equal(policy.previewPdfPath({ organizationId: "org", serviceOrderId: "os", templateId: "tpl", snapshotHash: "a".repeat(64) }), `org/os/print-previews/tpl/${"a".repeat(64)}.pdf`);
});
