import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSessionPurpose, sanitizeOrderEditPatch } from "./device-capture-policy.mjs";

test("normalizes capture and order_edit purposes only", () => {
  assert.equal(normalizeSessionPurpose("order_edit"), "order_edit");
  assert.equal(normalizeSessionPurpose("capture"), "capture");
  assert.equal(normalizeSessionPurpose("anything"), "capture");
});

test("keeps only editable service-order fields and normalizes empty values", () => {
  const patch = sanitizeOrderEditPatch({
    situation_id: " 11111111-1111-4111-8111-111111111111 ",
    service_type_id: "",
    serial_number: "SHOULD-NOT-CHANGE",
    os_number: "999",
    internal_notes: "  teste  ",
    estimated_price: "150,50",
    order_type: "external",
    service_state: " se ",
  });
  assert.deepEqual(patch, {
    situation_id: "11111111-1111-4111-8111-111111111111",
    service_type_id: null,
    internal_notes: "teste",
    estimated_price: 150.5,
    order_type: "external",
    service_state: "SE",
  });
});
