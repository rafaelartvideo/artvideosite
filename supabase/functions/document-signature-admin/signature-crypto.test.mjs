import test from "node:test";
import assert from "node:assert/strict";

let cryptoModule = null;
try {
  cryptoModule = await import("./signature-crypto.mjs");
} catch {
  // RED: helper is created by the implementation step.
}

test("canonical stringify is stable across object key order", () => {
  assert.ok(cryptoModule, "signature-crypto module must exist");
  assert.equal(
    cryptoModule.canonicalStringify({ z: 1, a: { y: 2, b: 3 } }),
    cryptoModule.canonicalStringify({ a: { b: 3, y: 2 }, z: 1 }),
  );
});

test("token encryption round trips without exposing plaintext", async () => {
  assert.ok(cryptoModule, "signature-crypto module must exist");
  const token = cryptoModule.randomToken(32);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  const encrypted = await cryptoModule.encryptSecret("test-key", token);
  assert.notEqual(encrypted.ciphertext, token);
  assert.equal(await cryptoModule.decryptSecret("test-key", encrypted.ciphertext, encrypted.iv), token);
  assert.match(await cryptoModule.sha256Hex(token), /^[0-9a-f]{64}$/);
});

test("normalizes and masks Brazilian documents without persisting full value", () => {
  assert.ok(cryptoModule, "signature-crypto module must exist");
  assert.equal(cryptoModule.normalizeDocument("123.456.789-09"), "12345678909");
  assert.equal(cryptoModule.maskDocument("123.456.789-09"), "***.***.***-09");
  assert.equal(cryptoModule.maskDocument("12.345.678/0001-95"), "**.***.***/****-95");
});
