import test from "node:test";
import assert from "node:assert/strict";

let ipAccess = null;
try {
  ipAccess = await import("./ip-access.ts");
} catch {
  // RED: the IP form policy does not exist until the feature is implemented.
}

test("parses comma and line separated IPs without duplicates", () => {
  assert.ok(ipAccess, "ip-access module must exist");
  assert.deepEqual(
    ipAccess.parseAllowedIps("189.15.10.214, 203.0.113.8\n189.15.10.214"),
    ["189.15.10.214", "203.0.113.8"],
  );
});

test("validates IPv4 and IPv6 values and rejects malformed entries", () => {
  assert.ok(ipAccess, "ip-access module must exist");
  assert.equal(ipAccess.isValidIpAddress("189.15.10.214"), true);
  assert.equal(ipAccess.isValidIpAddress("2001:db8::1"), true);
  assert.equal(ipAccess.isValidIpAddress("999.15.10.214"), false);
  assert.equal(ipAccess.isValidIpAddress("not-an-ip"), false);
});
