import test from "node:test";
import assert from "node:assert/strict";
import { signatureRequestCreationFeedback } from "./document-signature-feedback.mjs";

test("falha no e-mail não transforma assinatura gerada em erro", () => {
  const feedback = signatureRequestCreationFeedback({
    link: "https://example.com/assinatura/token",
    email_warning: "Configure RESEND_API_KEY e DOCUMENT_SIGNATURE_EMAIL_FROM/ORDER_DOCUMENT_EMAIL_FROM na Edge Function.",
    request: { status: "pending" },
  });
  assert.equal(feedback.type, "success");
  assert.match(feedback.message, /e-mail não foi enviado/i);
  assert.match(feedback.message, /QR Code/);
  assert.doesNotMatch(feedback.message, /RESEND_API_KEY|DOCUMENT_SIGNATURE_EMAIL_FROM|Edge Function/);
});

test("falha do WhatsApp continua sendo erro mesmo quando e-mail também falha", () => {
  const feedback = signatureRequestCreationFeedback({
    link: "https://example.com/assinatura/token",
    email_warning: "Provedor de e-mail não configurado",
    whatsapp_warning: "Integração SAC Digital indisponível",
  });
  assert.equal(feedback.type, "error");
  assert.match(feedback.message, /WhatsApp falhou/i);
});

test("falha na finalização do PDF continua sendo erro", () => {
  const feedback = signatureRequestCreationFeedback({
    link: "https://example.com/assinatura/token",
    finalization_warning: "PDF indisponível",
  });
  assert.equal(feedback.type, "error");
  assert.match(feedback.message, /PDF indisponível/);
});

test("solicitação sem link e ainda pendente é informada como erro", () => {
  const feedback = signatureRequestCreationFeedback({ request: { status: "pending" } });
  assert.equal(feedback.type, "error");
});

test("assinatura já concluída não exige link externo", () => {
  const feedback = signatureRequestCreationFeedback({ request: { status: "signed" } });
  assert.equal(feedback.type, "success");
  assert.match(feedback.message, /assinado/);
});
