import test from "node:test";
import assert from "node:assert/strict";
import { changedServiceTypeSituationLinks } from "./service-type-links.mjs";

test("does not rewrite SLA links when only their derived order differs", () => {
  const desired = [{ organization_id: "org", service_type_id: "type", situation_id: "s1", use_default_hours: true, sla_hours: null, sort_order: 0 }];
  const existing = [{ situation_id: "s1", use_default_hours: true, sla_hours: null, sort_order: 5 }];
  assert.deepEqual(changedServiceTypeSituationLinks(desired, existing), []);
});

test("updates a real SLA change while preserving the existing order", () => {
  const desired = [{ organization_id: "org", service_type_id: "type", situation_id: "s1", use_default_hours: false, sla_hours: 24, sort_order: 0 }];
  const existing = [{ situation_id: "s1", use_default_hours: true, sla_hours: null, sort_order: 5 }];
  assert.deepEqual(changedServiceTypeSituationLinks(desired, existing), [{ ...desired[0], sort_order: 5 }]);
});

test("inserts a newly selected situation", () => {
  const desired = [{ organization_id: "org", service_type_id: "type", situation_id: "s2", use_default_hours: true, sla_hours: null, sort_order: 1 }];
  assert.deepEqual(changedServiceTypeSituationLinks(desired, []), desired);
});
