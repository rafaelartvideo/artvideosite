import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const financeSql = read("supabase/migrations/20261123091600_restore_return_finance_and_warranty.sql");
const costsSql = read("supabase/migrations/20261123091700_return_operational_costs.sql");
const evidenceSql = read("supabase/migrations/20261123091800_completion_evidence_by_identity.sql");

test("Recebimentos informados na OS são persistidos como declaração, nunca baixa automática", () => {
  assert.equal((financeSql.match(/CREATE OR REPLACE FUNCTION public\.complete_service_order_v2/g) || []).length, 1);
  assert.equal((financeSql.match(/\$function\$;/g) || []).length, 1);
  assert.match(financeSql, /v_reported_receipts jsonb := coalesce\(p_finance_payload->'reported_receipts'/);
  assert.match(financeSql, /'reported_receipts',v_reported_receipts/);
  assert.match(financeSql, /'payment_plan',v_payment_plan/);
  assert.match(financeSql, /'payment_preferences',v_payment_preferences/);
  assert.match(financeSql, /Uma OS sem cobrança não pode informar recebimento/);
  assert.match(financeSql, /não cria liquidação/i);
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  assert.match(hook, /reported_receipts, payment_plan, payment_preferences/);
  assert.match(hook, /payments: \[\] as \[\]/);
  const repository = read("src/features/orders/infrastructure/order-finance.repository.ts");
  assert.match(repository, /A conclusão da OS apenas informa recebimentos/);
  assert.match(repository, /complete_service_order_v2/);
});

test("Retorno coberto mantém vigência do certificado original e identifica a OS de origem", async () => {
  assert.match(financeSql, /v_order.return_classification <> 'covered'/);
  assert.match(financeSql, /NEW\.starts_at:=v_original\.starts_at/);
  assert.match(financeSql, /NEW\.expires_at:=v_original\.expires_at/);
  assert.match(financeSql, /'original_os_number',v_root\.os_number/);
  const warranty = read("src/features/orders/application/order-warranty.ts");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  assert.match(warranty, /isCoveredReturn/);
  assert.match(warranty, /A emissão deste documento não reinicia o prazo de garantia/);
  assert.match(warranty, /PRAZO<br>ENCERRADO/);
  assert.match(modal, /mantendo o prazo de garantia do certificado original/);
  for (const [file, source, loader] of [
    ["order-warranty.ts", warranty, "ts"],
    ["OrderCompletionModal.tsx", modal, "tsx"],
  ]) assert.ok((await transformWithEsbuild(source, file, { loader })).code.length > 200);
});

test("Custos dos retornos são segregados do caixa e têm autorização e trilha de alterações", async () => {
  assert.match(costsSql, /CREATE TABLE IF NOT EXISTS public\.service_order_return_costs/);
  assert.match(costsSql, /CREATE TABLE IF NOT EXISTS public\.service_order_return_cost_audit/);
  assert.match(costsSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(costsSql, /finance\.receivables\.view/);
  assert.match(costsSql, /finance\.receivables\.edit/);
  assert.match(costsSql, /movement_origin='service_order'/);
  assert.match(costsSql, /movement_origin='return'/);
  const component = read("src/features/orders/presentation/OrderReturnFinancialSummary.tsx");
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.match(component, /get_service_order_return_financial_summary_v1/);
  assert.match(component, /set_service_order_return_cost_v1/);
  assert.match(component, /não significa pagamento recebido/i);
  assert.match(details, /<OrderReturnFinancialSummary order=\{detail\}/);
  for (const [file, source] of [
    ["OrderReturnFinancialSummary.tsx", component],
    ["OrderDetailsPage.tsx", details],
  ]) assert.ok((await transformWithEsbuild(source, file, { loader: "tsx" })).code.length > 200);
});

test("Comprovantes e evidências usam identificação semântica, com suporte a anexos antigos", async () => {
  assert.match(evidenceSql, /completion_evidence_kind='payment_proof'/);
  assert.match(evidenceSql, /completion_evidence_kind='delivery_evidence'/);
  assert.match(evidenceSql, /completion_evidence_kind IS NULL AND lower/);
  assert.match(evidenceSql, /mark_order_completion_evidence_v1/);
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  assert.match(hook, /paymentProofPendingMediaId/);
  assert.match(hook, /deliveryEvidencePendingMediaId/);
  assert.match(hook, /mark_order_completion_evidence_v1/);
  assert.match(hook, /sem enviar o arquivo de novo/);
  assert.ok((await transformWithEsbuild(hook, "useOrderCompletion.ts", { loader: "ts" })).code.length > 200);
});

test("Dashboard não confunde cobertura de retorno com desconto comercial", () => {
  const dashboard = read("supabase/migrations/20261123091900_dashboard_exclude_warranty_coverage_from_discounts.sql");
  assert.match(dashboard, /'discount_amount', CASE WHEN service_order\.return_root_id IS NOT NULL/);
  assert.match(dashboard, /service_order\.return_classification IN \('covered','courtesy'\)/);
  assert.match(dashboard, /THEN 0 ELSE service_order\.discount_amount END/);
});
