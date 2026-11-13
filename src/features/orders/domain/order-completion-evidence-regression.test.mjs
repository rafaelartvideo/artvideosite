import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("tipos de atendimento habilitam as duas evidências separadamente", async () => {
  const panel = read("src/features/service-types/presentation/ServiceTypesAdminPanel.tsx");
  const config = read("src/features/orders/presentation/OrderSettingsDialog.tsx");
  const repository = read("src/features/settings/infrastructure/company-settings.repository.ts");
  assert.ok((await transformWithEsbuild(panel, "ServiceTypesAdminPanel.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(config, "OrderSettingsDialog.tsx", { loader: "tsx" })).code);
  assert.match(panel, /Habilitar comprovante de pagamento/);
  assert.match(panel, /Habilitar evidência de entrega/);
  assert.match(panel, /enable_payment_proof_on_completion: form\.enable_payment_proof_on_completion/);
  assert.match(panel, /enable_delivery_evidence_on_completion: form\.enable_delivery_evidence_on_completion/);
  assert.match(config, /Exigir evidência de entrega para concluir a OS/);
  assert.match(config, /require_delivery_evidence_on_completion: requireDeliveryEvidence/);
  assert.match(repository, /require_delivery_evidence_on_completion: settings\.require_delivery_evidence_on_completion/);
});

test("conclusão valida e envia dois anexos distintos, exibidos lado a lado", async () => {
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const payment = read("src/features/orders/presentation/OrderCompletionPaymentSection.tsx");
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const documents = read("src/features/orders/infrastructure/order-documents.repository.ts");
  for (const [name, source] of [
    ["OrderCompletionModal.tsx", modal],
    ["OrderCompletionPaymentSection.tsx", payment],
    ["useOrderCompletion.ts", hook],
  ]) assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code.length > 200);
  assert.match(payment, /md:grid-cols-2/);
  assert.match(payment, /kind="payment"/);
  assert.match(payment, /kind="delivery"/);
  assert.equal((payment.match(/<OrderChecklistMobileBridge/g) || []).length, 1);
  assert.match(modal, /OrderCompletionEvidenceSection/);
  assert.match(modal, /<Section title="Evidências de conclusão">/);
  assert.doesNotMatch(payment, /JPG, PNG, WebP ou PDF\. Fotos comprimidas com qualidade adequada para leitura; PDF sem alterações\./);
  assert.doesNotMatch(payment, /<p className="text-sm font-bold text-foreground">Evidências de conclusão<\/p>/);
  assert.match(modal, /completion\.deliveryEvidenceRequired && !completion\.deliveryEvidenceFile/);
  assert.match(hook, /Anexe a evidência de entrega antes de concluir a OS/);
  assert.match(hook, /attachmentTypeId: deliveryEvidenceAttachmentTypeId/);
  assert.match(hook, /setDeliveryEvidenceAttached\(true\)/);
  assert.match(documents, /get_order_completion_evidence_config_v1/);
  assert.match(documents, /delivery_attachment_type_id: string \| null/);
  assert.match(hook, /setDeliveryEvidenceAttachmentTypeId\(config\.delivery_attachment_type_id \|\| ""\)/);
  assert.doesNotMatch(hook, /listAttachmentTypes/);
});

test("tipos ativos são resolvidos pela configuração da OS e não pelo cache de Documentos", () => {
  const migration = read("supabase/migrations/20261113123500_fix_os_evidence_type_resolution.sql");
  assert.match(migration, /private\.can_access_shared_organization_resource\(p_organization_id,'orders','read'\)/);
  assert.match(migration, /private\.has_effective_organization_permission\(p_organization_id,'orders.complete'\)/);
  assert.match(migration, /'payment_attachment_type_id',v_payment_type_id/);
  assert.match(migration, /'delivery_attachment_type_id',v_delivery_type_id/);
  assert.match(migration, /'payment_attached',v_payment_attached/);
  assert.match(migration, /'delivery_attached',v_delivery_attached/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_order_completion_evidence_config_v1/);
});

test("um único QR de conclusão recebe apenas tipos autorizados", async () => {
  const bridge = read("src/features/checklists/presentation/OrderChecklistMobileBridge.tsx");
  const mobile = read("src/features/checklists/presentation/MobileOrderDocumentsSection.tsx");
  const edge = read("supabase/functions/order-mobile-checklist/index.ts");
  assert.ok((await transformWithEsbuild(mobile, "MobileOrderDocumentsSection.tsx", { loader: "tsx" })).code);
  assert.match(bridge, /Registrar comprovante e evidência de entrega pelo celular/);
  assert.match(mobile, /completion_evidence\?\.delivery_enabled/);
  assert.match(mobile, /files\.slice\(0, 1\)/);
  assert.match(edge, /Esta sessão aceita somente comprovante de pagamento e evidência de entrega/);
  assert.match(edge, /enable_delivery_evidence_on_completion/);
});

test("migração protege exigência e classificação com banco de dados por empresa", () => {
  const migration = read("supabase/migrations/20261113114500_order_completion_evidence_by_type.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS require_delivery_evidence_on_completion/);
  assert.match(migration, /get_order_completion_evidence_config_v1/);
  assert.match(migration, /new\.service_type_id/);
  assert.match(migration, /classification\.organization_id=new\.organization_id/);
  assert.match(migration, /Anexe a evidência de entrega antes de concluir a OS/);
});
