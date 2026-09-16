import test from "node:test";
import assert from "node:assert/strict";

let policy = null;
try {
  policy = await import("./access-policy.mjs");
} catch {
  // RED: the policy module does not exist until the feature is implemented.
}

test("extracts the public client IP from trusted proxy headers", () => {
  assert.ok(policy, "access-policy module must exist");
  assert.equal(policy.extractClientIp(new Headers({ "x-forwarded-for": "189.15.10.214, 10.0.0.2" })), "189.15.10.214");
  assert.equal(policy.extractClientIp(new Headers({ "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
});

test("normalizes IPv4-mapped addresses before comparison", () => {
  assert.ok(policy, "access-policy module must exist");
  assert.equal(policy.normalizeClientIp("::ffff:189.15.10.214"), "189.15.10.214");
  assert.equal(policy.normalizeClientIp(" 189.15.10.214 "), "189.15.10.214");
});

test("allows unrestricted profiles and blocks unlisted IPs", () => {
  assert.ok(policy, "access-policy module must exist");
  assert.equal(policy.isIpAllowed(false, [], "203.0.113.10"), true);
  assert.equal(policy.isIpAllowed(true, ["189.15.10.214"], "189.15.10.214"), true);
  assert.equal(policy.isIpAllowed(true, ["189.15.10.214"], "203.0.113.10"), false);
  assert.equal(policy.isIpAllowed(true, [], "189.15.10.214"), false);
  assert.equal(policy.isIpAllowed(true, ["189.15.10.214"], null), false);
});
