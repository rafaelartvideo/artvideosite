import test from "node:test";
import assert from "node:assert/strict";
import { approvalProgress, canUserApprove } from "./finance-approval.mjs";

test("single approval completes a one-approval title", () => {
  assert.deepEqual(approvalProgress(1, []), { count: 0, required: 1, status: "pending" });
  assert.deepEqual(approvalProgress(1, [{ action: "approve", approver_user_id: "u1" }]), { count: 1, required: 1, status: "approved" });
});

test("two-approval title stays pending after first distinct approval", () => {
  assert.deepEqual(approvalProgress(2, [{ action: "approve", approver_user_id: "u1" }]), { count: 1, required: 2, status: "pending" });
  assert.deepEqual(approvalProgress(2, [{ action: "approve", approver_user_id: "u1" }, { action: "approve", approver_user_id: "u2" }]), { count: 2, required: 2, status: "approved" });
});

test("same user cannot approve twice", () => {
  assert.deepEqual(canUserApprove({ requiredApprovals: 2, approvals: [{ action: "approve", approver_user_id: "u1" }], userId: "u1", creatorId: "creator" }), { ok: false, reason: "duplicate_approver" });
});

test("creator cannot be the second approver", () => {
  assert.deepEqual(canUserApprove({ requiredApprovals: 2, approvals: [{ action: "approve", approver_user_id: "u1" }], userId: "creator", creatorId: "creator" }), { ok: false, reason: "creator_cannot_be_second" });
});

test("creator may be first approver and another user may finish", () => {
  assert.deepEqual(canUserApprove({ requiredApprovals: 2, approvals: [], userId: "creator", creatorId: "creator" }), { ok: true, reason: null });
  assert.deepEqual(canUserApprove({ requiredApprovals: 2, approvals: [{ action: "approve", approver_user_id: "creator" }], userId: "u2", creatorId: "creator" }), { ok: true, reason: null });
});
