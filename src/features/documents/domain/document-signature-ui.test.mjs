import test from "node:test";
import assert from "node:assert/strict";

let ui = null;
try {
  ui = await import("./document-signature-ui.mjs");
} catch {
  // RED until helper exists.
}

test("only pending and viewed requests have active signing actions", () => {
  assert.ok(ui, "document-signature-ui module must exist");
  assert.equal(ui.isActiveSignatureStatus("pending"), true);
  assert.equal(ui.isActiveSignatureStatus("viewed"), true);
  assert.equal(ui.isActiveSignatureStatus("signed"), false);
  assert.equal(ui.isActiveSignatureStatus("expired"), false);
  assert.equal(ui.isActiveSignatureStatus("cancelled"), false);
});

test("builds a Brazil WhatsApp link with encoded signature message", () => {
  assert.ok(ui, "document-signature-ui module must exist");
  const url = ui.buildSignatureWhatsAppUrl("(79) 99999-0000", "https://artvideo.example/assinatura/token", {
    companyName: "ArtVideo",
    documentName: "Ordem de Serviço",
    expiresAt: "2026-09-19T17:00:00.000Z",
  });
  assert.match(url, /^https:\/\/wa\.me\/5579999990000\?text=/);
  assert.match(decodeURIComponent(url.split("text=")[1]), /https:\/\/artvideo\.example\/assinatura\/token/);
});
