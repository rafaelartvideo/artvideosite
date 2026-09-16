import test from "node:test";
import assert from "node:assert/strict";

let cryptoHelpers = null;
try {
  cryptoHelpers = await import("./public-signature-crypto.mjs");
} catch {
  // RED until production helper exists.
}

test("normalizes documents and masks email without exposing full identity", () => {
  assert.ok(cryptoHelpers, "public signature crypto module must exist");
  assert.equal(cryptoHelpers.normalizeDocument("123.456.789-01"), "12345678901");
  assert.equal(cryptoHelpers.maskEmail("rafael@example.com"), "ra****@example.com");
});

test("generates exactly six numeric OTP digits", () => {
  assert.ok(cryptoHelpers, "public signature crypto module must exist");
  for (let index = 0; index < 50; index += 1) assert.match(cryptoHelpers.randomOtp(), /^\d{6}$/);
});

test("sha256 and hmac are stable lowercase hexadecimal", async () => {
  assert.ok(cryptoHelpers, "public signature crypto module must exist");
  assert.equal(await cryptoHelpers.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const first = await cryptoHelpers.hmacHex("secret", "value");
  const second = await cryptoHelpers.hmacHex("secret", "value");
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});
