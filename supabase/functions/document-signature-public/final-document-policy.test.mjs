import test from "node:test";
import assert from "node:assert/strict";

let policy = null;
try {
  policy = await import("./final-document-policy.mjs");
} catch {
  // RED until the production module exists.
}

test("builds encoded public verification path", () => {
  assert.ok(policy, "final document policy module must exist");
  assert.equal(policy.buildVerificationPath("ABC_def-123"), "/verificar-documento/ABC_def-123");
  assert.throws(() => policy.buildVerificationPath(""), /código/i);
});

test("selects exactly the signatures required by the frozen request", () => {
  assert.ok(policy, "final document policy module must exist");
  assert.deepEqual(policy.requiredSignatureKinds({ require_external_signature: true, require_employee_signature: true }), ["employee", "external"]);
  assert.deepEqual(policy.requiredSignatureKinds({ require_external_signature: true, require_employee_signature: false }), ["external"]);
  assert.deepEqual(policy.requiredSignatureKinds({ require_external_signature: false, require_employee_signature: true }), ["employee"]);
});

test("builds a minimal public verification payload without sensitive fields", () => {
  assert.ok(policy, "final document policy module must exist");
  const payload = policy.minimalVerificationPayload({
    verification_code: "ABC123",
    template_name_snapshot: "Ordem de Serviço",
    order_number_snapshot: "42",
    signed_at: "2026-09-16T20:00:00Z",
    snapshot_hash: "a".repeat(64),
    final_pdf_hash: "b".repeat(64),
    external_signer_email: "secret@example.com",
    external_document_hmac: "never-expose",
  }, [
    { signer_type: "employee", signer_name: "Funcionário Teste", signer_document_masked: "***.***.***-11", validation_method: "stored_employee_signature", signed_at: "2026-09-16T19:00:00Z" },
    { signer_type: "external", signer_name: "Cliente Teste", signer_document_masked: "***.***.***-22", validation_method: "cpf_cnpj", signed_at: "2026-09-16T20:00:00Z" },
  ], { name: "Eletrônica ArtVideo" });

  assert.equal(payload.valid, true);
  assert.equal(payload.company_name, "Eletrônica ArtVideo");
  assert.equal(payload.verification_code, "ABC123");
  assert.equal(payload.signers.length, 2);
  assert.equal(payload.signers[1].validation_method, "cpf_cnpj");
  assert.equal(payload.final_pdf_hash, "b".repeat(64));
  assert.equal("external_signer_email" in payload, false);
  assert.equal("external_document_hmac" in payload, false);
  assert.equal(JSON.stringify(payload).includes("secret@example.com"), false);
  assert.equal(JSON.stringify(payload).includes("never-expose"), false);
});
