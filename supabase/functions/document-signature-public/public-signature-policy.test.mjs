import test from "node:test";
import assert from "node:assert/strict";

let policy = null;
try {
  policy = await import("./public-signature-policy.mjs");
} catch {
  // RED: production policy module is created after this test fails.
}

test("accepts only six numeric digits as OTP", () => {
  assert.ok(policy, "public signature policy module must exist");
  assert.equal(policy.normalizeOtp(" 123456 "), "123456");
  assert.equal(policy.isOtpFormat("123456"), true);
  assert.equal(policy.isOtpFormat("12345"), false);
  assert.equal(policy.isOtpFormat("12345a"), false);
});

test("builds a short proof bound to request, token hash and challenge", async () => {
  assert.ok(policy, "public signature policy module must exist");
  const now = 1_800_000_000_000;
  const proof = await policy.buildOtpProof("secret-key-with-enough-length", {
    requestId: "11111111-1111-4111-8111-111111111111",
    tokenHash: "a".repeat(64),
    challengeId: "22222222-2222-4222-8222-222222222222",
  }, now, 15 * 60 * 1000);

  const verified = await policy.verifyOtpProof("secret-key-with-enough-length", proof, {
    requestId: "11111111-1111-4111-8111-111111111111",
    tokenHash: "a".repeat(64),
  }, now + 1_000);
  assert.equal(verified.challengeId, "22222222-2222-4222-8222-222222222222");

  await assert.rejects(
    () => policy.verifyOtpProof("secret-key-with-enough-length", proof, {
      requestId: "11111111-1111-4111-8111-111111111111",
      tokenHash: "b".repeat(64),
    }, now + 1_000),
    /prova/i,
  );

  await assert.rejects(
    () => policy.verifyOtpProof("secret-key-with-enough-length", proof, {
      requestId: "11111111-1111-4111-8111-111111111111",
      tokenHash: "a".repeat(64),
    }, now + 16 * 60 * 1000),
    /expirou/i,
  );
});

test("decodes only PNG data URLs up to one megabyte", () => {
  assert.ok(policy, "public signature policy module must exist");
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  assert.deepEqual(Array.from(policy.decodePngDataUrl(dataUrl)), Array.from(png));
  assert.throws(() => policy.decodePngDataUrl("data:image/jpeg;base64,/9j/"), /PNG/i);
  const tooLarge = `data:image/png;base64,${Buffer.alloc(1024 * 1024 + 1).toString("base64")}`;
  assert.throws(() => policy.decodePngDataUrl(tooLarge), /1 MB/i);
});

test("classifies expired and terminal requests as not signable", () => {
  assert.ok(policy, "public signature policy module must exist");
  const now = Date.parse("2026-09-16T18:00:00Z");
  assert.equal(policy.publicRequestState({ status: "pending", expires_at: "2026-09-16T18:10:00Z" }, now), "pending");
  assert.equal(policy.publicRequestState({ status: "viewed", expires_at: "2026-09-16T17:59:59Z" }, now), "expired");
  assert.equal(policy.publicRequestState({ status: "cancelled", expires_at: "2026-09-17T18:00:00Z" }, now), "cancelled");
  assert.equal(policy.publicRequestState({ status: "signed", expires_at: "2026-09-17T18:00:00Z" }, now), "signed");
});

test("enforces otp cooldown and hourly send limit", () => {
  assert.ok(policy, "public signature policy module must exist");
  const now = Date.parse("2026-09-16T18:00:00Z");
  assert.deepEqual(policy.otpSendPolicy({ now, lastSentAt: null, sendsLastHour: 0 }), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(policy.otpSendPolicy({ now, lastSentAt: "2026-09-16T17:59:30Z", sendsLastHour: 1 }), { allowed: false, retryAfterSeconds: 30, reason: "cooldown" });
  assert.deepEqual(policy.otpSendPolicy({ now, lastSentAt: "2026-09-16T17:58:00Z", sendsLastHour: 5 }), { allowed: false, retryAfterSeconds: 3600, reason: "hourly_limit" });
});
