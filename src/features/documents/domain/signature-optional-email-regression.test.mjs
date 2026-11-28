import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(p, "utf8");
test("external signatures do not require an email in any template", () => {
  const dialog = read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  const admin = read("supabase/functions/document-signature-admin/main.ts");
  const migration = read("supabase/migrations/20261128113000_document_signature_email_optional.sql");
  assert.doesNotMatch(dialog, /cliente precisa ter um e-mail/);
  assert.ok(dialog.includes("contactEmail.trim() && !isValidEmail(contactEmail.trim())"));
  assert.ok(admin.includes("if (signer.email && !EMAIL_PATTERN.test"));
  assert.ok(admin.includes("if (externalSigner.email) try"));
  assert.doesNotMatch(migration, /external_signer_email/);
  assert.match(migration, /external_document_hmac/);
  assert.match(migration, /external_signer_name/);
});
