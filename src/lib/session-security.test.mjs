import test from "node:test";
import assert from "node:assert/strict";

let security = null;
try {
  security = await import("./session-security.ts");
} catch {
  // RED: the session policy module does not exist until the feature is implemented.
}

test("expires a session after exactly twenty minutes without activity", () => {
  assert.ok(security, "session-security module must exist");
  assert.equal(security.INACTIVITY_TIMEOUT_MS, 20 * 60 * 1000);
  assert.equal(security.isSessionInactive(1_000, 1_000 + security.INACTIVITY_TIMEOUT_MS - 1), false);
  assert.equal(security.isSessionInactive(1_000, 1_000 + security.INACTIVITY_TIMEOUT_MS), true);
});

test("computes the remaining inactivity time without returning negatives", () => {
  assert.ok(security, "session-security module must exist");
  assert.equal(security.remainingSessionTime(1_000, 1_500, 1_000), 500);
  assert.equal(security.remainingSessionTime(1_000, 2_500, 1_000), 0);
});
