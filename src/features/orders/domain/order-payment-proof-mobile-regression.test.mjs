import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Concluir OS exibe Usar celular após o selo obrigatório/opcional", async () => {
  const proof = read("src/features/orders/presentation/OrderCompletionPaymentSection.tsx");
  const badge = proof.indexOf("completion.paymentProofRequired ? \"(obrigatório)\"");
  const mobile = proof.indexOf("<OrderChecklistMobileBridge", badge);
  assert.ok(badge > 0 && mobile > badge && mobile < proof.indexOf("</div>", mobile));
  assert.match(proof, /scope="payment-proof"/);
  assert.match(proof, /disabled=\{saving \|\| completion\.paymentProofAttached \|\| completion\.paymentProofAlreadyOnOrder\}/);
  assert.match(proof, /onDocumentsUpdated=\{completion\.refreshPaymentProofFromMobile\}/);
  assert.ok((await transformWithEsbuild(proof,"OrderCompletionPaymentSection.tsx",{loader:"tsx"})).code.length > 200);
});

test("QR e código reutilizam sessão temporária de documentos e enviam comprovante de pagamento", async () => {
  const bridge = read("src/features/checklists/presentation/OrderChecklistMobileBridge.tsx");
  const capture = read("src/features/device-capture/presentation/MobileDeviceCapturePage.tsx");
  const gateway = read("src/features/checklists/infrastructure/order-mobile-checklist.gateway.ts");
  const mobile = read("src/features/checklists/presentation/MobileOrderChecklistPage.tsx");
  const docs = read("src/features/checklists/presentation/MobileOrderDocumentsSection.tsx");
  for(const [file, source] of [
    ["OrderChecklistMobileBridge.tsx",bridge],
    ["MobileDeviceCapturePage.tsx",capture],
    ["MobileOrderChecklistPage.tsx",mobile],
    ["MobileOrderDocumentsSection.tsx",docs],
  ]) assert.ok((await transformWithEsbuild(source,file,{loader:"tsx"})).code.length > 200,file);
  assert.match(bridge,/scope\?: "checklist" \| "documents" \| "payment-proof"/);
  assert.match(bridge,/&mode=payment-proof/);
  assert.match(bridge,/onDocumentsUpdated\?\.\(\)/);
  assert.match(capture,/mode: session\.mode/);
  assert.match(gateway,/mode: data\.session\.mode === "payment-proof"/);
  assert.match(mobile,/mobile_flow === "payment-proof"/);
  assert.match(docs,/paymentProofOnly=\s*false/);
  assert.match(docs,/effectiveTypeId = paymentProofOnly/);
  assert.match(docs,/comprovante de pagamento/);
});

test("Edge Function mantém autorização, tipo de comprovante e contexto na sessão, sem ampliar escopo", () => {
  const edge = read("supabase/functions/order-mobile-checklist/index.ts");
  const sql = read("supabase/migrations/20261103170142_order_mobile_payment_proof_capture_context.sql");
  assert.match(sql,/add column if not exists mobile_flow/);
  assert.match(sql,/mobile_flow in \('','payment_proof'\)/);
  assert.match(edge,/authenticatedUser\(request, supabaseUrl, anonKey\)/);
  assert.match(edge,/memberHasPermission\(admin, organizationId, user\.id, "orders\.section\.images"\)/);
  assert.match(edge,/session\.mobile_flow === "payment_proof" && kind !== "attachment"/);
  assert.match(edge,/session\.mobile_flow === "payment_proof" && data\.name\.trim/);
  assert.match(edge,/Comprovantes devem ser JPG, PNG, WebP ou PDF/);
  assert.match(edge,/mode: data\.mobile_flow === "payment_proof"/);
  assert.match(edge,/mobile_flow: session\.mobile_flow === "payment_proof"/);
});

test("upload móvel valida existência do arquivo e atualiza a conclusão em tempo real", async () => {
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const bridge = read("src/features/checklists/presentation/OrderChecklistMobileBridge.tsx");
  assert.match(hook,/const refreshPaymentProofFromMobile = useCallback/);
  assert.match(hook,/hasOrderPaymentProof\(organizationId, String\(detail\.id\), receiptTypeIds\)/);
  assert.match(hook,/setPaymentProofAlreadyOnOrder\(true\)/);
  assert.match(hook,/setPaymentProofFile\(null\)/);
  assert.match(hook,/paymentProofRequired && !paymentProofFile && !paymentProofAttached && !paymentProofAlreadyOnOrder/);
  assert.match(bridge,/row\.order_updated_at/);
  assert.match(bridge,/queryClient\.invalidateQueries/);
  assert.ok((await transformWithEsbuild(hook,"useOrderCompletion.ts",{loader:"ts"})).code.length > 200);
});