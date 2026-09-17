import test from "node:test";
import assert from "node:assert/strict";
import { basePdfPath, isPdfBytes, normalizeSignatureSlots } from "./base-pdf-ingest-policy.mjs";

test("accepts only real pdf bytes", () => {
  assert.equal(isPdfBytes(new TextEncoder().encode("%PDF-1.7\nabc")), true);
  assert.equal(isPdfBytes(new TextEncoder().encode("not-a-pdf")), false);
});

test("builds immutable original pdf path", () => {
  assert.equal(
    basePdfPath({ organization_id: "org", service_order_id: "os", id: "req" }),
    "org/os/req/original.pdf",
  );
});

test("normalizes and validates signature slots", () => {
  assert.deepEqual(normalizeSignatureSlots([
    { signer_type: "external", page_index: 0, x_mm: 20.1, y_mm: 210.2, width_mm: 70, height_mm: 18 },
    { signer_type: "employee", page_index: 1, x_mm: 110, y_mm: 120, width_mm: 70, height_mm: 18 },
  ], 2), [
    { signer_type: "external", page_index: 0, x_mm: 20.1, y_mm: 210.2, width_mm: 70, height_mm: 18 },
    { signer_type: "employee", page_index: 1, x_mm: 110, y_mm: 120, width_mm: 70, height_mm: 18 },
  ]);
  assert.throws(() => normalizeSignatureSlots([
    { signer_type: "external", page_index: 2, x_mm: 1, y_mm: 1, width_mm: 10, height_mm: 10 },
  ], 2));
  assert.throws(() => normalizeSignatureSlots([
    { signer_type: "external", page_index: 0, x_mm: 1, y_mm: 1, width_mm: 10, height_mm: 10 },
    { signer_type: "external", page_index: 0, x_mm: 1, y_mm: 1, width_mm: 10, height_mm: 10 },
  ], 2));
});
