import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEmployeeIds, normalizeTechnicalValues, sanitizeMobileOrderPatch } from "./order-mobile-edit-policy.mjs";

test("mobile OS patch keeps only fields allowed for temporary editing", () => {
  assert.deepEqual(sanitizeMobileOrderPatch({
    situation_id: " aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa ",
    serial_number: "must-not-change",
    os_number: "999",
    internal_notes: "  teste  ",
    estimated_price: "1.250,50",
    order_type: "external",
    service_state: " se ",
  }), {
    situation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    internal_notes: "teste",
    estimated_price: 1250.5,
    order_type: "external",
    service_state: "SE",
  });
});

test("mobile OS relation inputs are deduplicated and technical values are bounded", () => {
  assert.deepEqual(normalizeEmployeeIds(["a", "a", " b ", ""]), ["a", "b"]);
  assert.deepEqual(normalizeTechnicalValues({ " field-1 ": "  valor  ", "": "ignorar" }), { "field-1": "valor" });
});
