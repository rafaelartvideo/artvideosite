import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("configuração por empresa aparece em Dados da Empresa e é persistida", async () => {
  const settings = read("src/features/settings/presentation/TabSettings.tsx");
  const repository = read("src/features/settings/infrastructure/company-settings.repository.ts");
  const cache = read("src/features/settings/presentation/useCompanySettingsQuery.ts");
  assert.ok((await transformWithEsbuild(settings, "TabSettings.tsx", { loader: "tsx" })).code);
  assert.match(settings, /Exigir comprovante de pagamento para concluir a OS/);
  assert.match(settings, /checked=\{form\.require_payment_proof_on_completion\}/);
  assert.match(repository, /require_payment_proof_on_completion: row\.require_payment_proof_on_completion === true/);
  assert.match(repository, /completionPayload/);
  assert.match(cache, /"payment-proof-required"/);
});

test("Artvideo exige comprovante e outras empresas podem alterar sem mudar regras globais", () => {
  const migration = read("supabase/migrations/20261103180000_require_order_payment_proof_per_company.sql");
  assert.match(migration, /default false/);
  assert.match(migration, /organization\.slug = 'artvideo'/);
  assert.match(migration, /require_payment_proof_on_completion = true/);
  assert.match(migration, /service_orders_require_payment_proof/);
  assert.match(migration, /attachment\.service_order_id = new\.id/);
  assert.match(migration, /comprovante de pagamento/);
  assert.match(migration, /raise exception 'Anexe o comprovante de pagamento/);
  assert.match(migration, /orders\.complete/);
  const ensureType = read("supabase/migrations/20261103181000_ensure_payment_receipt_type_when_required.sql");
  assert.match(ensureType, /organization_company_settings_ensure_payment_proof_type/);
  assert.match(ensureType, /new.require_payment_proof_on_completion/);
  assert.match(ensureType, /on conflict do nothing/);
});

test("conclusão bloqueia apenas quando obrigatório e não existe comprovante", async () => {
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const payment = read("src/features/orders/presentation/OrderCompletionPaymentSection.tsx");
  const repository = read("src/features/orders/infrastructure/order-documents.repository.ts");

  for (const [file, source] of [
    ["useOrderCompletion.ts", hook],
    ["OrderCompletionModal.tsx", modal],
    ["OrderCompletionPaymentSection.tsx", payment],
  ]) {
    assert.ok((await transformWithEsbuild(source, file, { loader: "tsx" })).code);
  }
  assert.match(hook, /getOrderPaymentProofRequirement\(organizationId\)/);
  assert.match(hook, /hasOrderPaymentProof\(organizationId, serviceOrderId/);
  assert.match(hook, /paymentProofRequired && !paymentProofFile && !paymentProofAttached && !paymentProofAlreadyOnOrder/);
  assert.match(modal, /completion\.paymentProofRequired && !completion\.paymentProofFile/);
  assert.match(payment, /\(obrigatório\)/);
  assert.match(payment, /paymentProofAlreadyOnOrder/);
  assert.match(repository, /get_order_payment_proof_requirement_v1/);
  assert.match(repository, /attachmentTypeIds/);
});

test("compressão de fotos e preservação de PDF continuam intactas", () => {
  const repository = read("src/features/orders/infrastructure/order-documents.repository.ts");
  const optimizer = read("src/shared/application/upload-file-optimizer.ts");
  const completion = read("src/features/orders/application/useOrderCompletion.ts");
  assert.match(repository, /optimizePhoto && file\.type\.startsWith\("image\/"\) \? "service-label" : "document-image"/);
  assert.match(optimizer, /"service-label": \{ maxDimension: 2200/);
  assert.match(optimizer, /if \(preset === "document-image" \|\| !file\.type\.startsWith\("image\/"\)\)/);
  assert.match(completion, /optimizePhoto: true/);
});
