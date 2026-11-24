import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = path => readFileSync(path, "utf8");
test("nome de novo contato usa resultado atual de verificação, sem sobrescrever nomes manuais", async () => {
  const verification=read("src/features/whatsapp-channels/presentation/WhatsAppNumberVerification.tsx");
  const dialog=read("src/features/whatsapp-channels/presentation/CrmAdditionalContactDialog.tsx");
  const contacts=read("src/features/registrations/presentation/RegistrationContactsPage.tsx");
  for (const [name, source] of [["verification", verification], ["dialog", dialog], ["contacts", contacts]]) {
    assert.ok((await transformWithEsbuild(source,name+".tsx",{loader:"tsx"})).code);
  }
  assert.ok(verification.includes("response.contact_name || response.verified_name"));
  assert.ok(verification.includes("state?.key === key ? state.result : null"));
  assert.ok(verification.includes('verificationMode === "create" && verificationEnabled) onVerifiedName?.(suggestedName)'));
  assert.equal(verification.split('"check_number"').length - 1, 1);
  assert.ok(dialog.includes("const name = manualName ?? suggestedName"));
  assert.ok(dialog.includes("onVerifiedName={setSuggestedName}"));
  assert.ok(dialog.includes("setManualName(event.target.value)"));
  assert.ok(dialog.includes("brazilianWhatsAppNumber(event.target.value) !== brazilianWhatsAppNumber(whatsapp)"));
  assert.ok(contacts.includes("onVerifiedName={onVerifiedContactName}"));
  assert.ok(contacts.includes("!formOpen || editing || saving || contactNameEdited.current"));
  assert.ok(contacts.includes("contactNameEdited.current = false"));
  assert.ok(contacts.includes("contactNameEdited.current = true"));
});
