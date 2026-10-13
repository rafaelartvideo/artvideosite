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

test("signature WhatsApp text shows sender's first name and removes expiration and smart quotes", () => {
  const url = ui.buildSignatureWhatsAppUrl("79999990000", "https://example.com/assinatura/token", {
    companyName: "Artvideo",
    documentName: "Ordem de Serviço de Entrada de Equipamento",
    signerName: "Mariana Souza",
    operatorName: "RAFAEL LIMA",
    expiresAt: "2026-10-14T18:00:00.000Z",
  });
  const message = new URL(url).searchParams.get("text") || "";
  assert.match(message, /^\*Rafael\*\n\nOlá, Mariana!/);
  assert.match(message, /Artvideo enviou o documento Ordem de Serviço de Entrada de Equipamento/);
  assert.match(message, /Acesse para revisar e assinar:\nhttps:\/\/example.com\/assinatura\/token/);
  assert.doesNotMatch(message, /Sistema|[“”]|\d{2}:\d{2}|válido até/);
});
