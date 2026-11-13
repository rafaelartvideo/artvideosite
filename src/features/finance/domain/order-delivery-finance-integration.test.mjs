import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("evidência da OS é referenciada no A receber sem copiar mídia nem misturar comprovante", () => {
  const migration = read("supabase/migrations/20261113121000_link_order_delivery_evidence_to_finance.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS source_document_kind/);
  assert.match(migration, /'delivery_evidence'/);
  assert.match(migration, /'payment_proof'/);
  assert.match(migration, /source_doc\.service_order_id::text=entry\.origin_reference/);
  assert.match(migration, /entry\.entry_type='receivable'/);
  assert.match(migration, /entry\.organization_id=p_organization_id/);
  assert.match(migration, /'service-images',media_file\.id,'delivery_evidence'/);
  assert.match(migration, /ON CONFLICT \(storage_path\) DO NOTHING/);
  assert.match(migration, /finance_proof_on_os_attachment_added_v1/);
  assert.match(migration, /finance_proof_on_entry_created_v1/);
  assert.match(migration, /finance_linked_order_proof_select/);
  assert.match(migration, /private\.can_view_financial_entry/);
  assert.match(migration, /comprovante de entrega do equipamento/);
  assert.doesNotMatch(migration, /\.upload\(/);
});

test("Contas a Receber mostra foto da entrega no resumo e nos documentos", async () => {
  const details = read("src/features/finance/presentation/FinanceEntryDetail.tsx");
  const documents = read("src/features/finance/presentation/FinanceDocumentsPanel.tsx");
  const gallery = read("src/features/finance/presentation/FinanceOrderEvidenceGallery.tsx");
  const repository = read("src/features/finance/infrastructure/finance-documents.repository.ts");
  const types = read("src/features/finance/domain/finance.types.ts");
  for (const [filename, source] of [
    ["FinanceEntryDetail.tsx", details],
    ["FinanceDocumentsPanel.tsx", documents],
    ["FinanceOrderEvidenceGallery.tsx", gallery],
  ]) assert.ok((await transformWithEsbuild(source, filename, { loader: "tsx" })).code.length > 200);
  assert.match(details, /isReceivable && detail\.origin_type === "service_order"/);
  assert.match(details, /kind="delivery_evidence"/);
  assert.match(documents, /Evidência de entrega/);
  assert.match(documents, /typeLabel\(item\.attachment_type, item\.source_document_kind\)/);
  assert.match(repository, /source_document_kind/);
  assert.match(types, /"payment_proof" \| "delivery_evidence"/);
  assert.match(gallery, /src=\{url\}/);
  assert.match(gallery, /createFinancialAttachmentSignedUrl\(/);
  assert.match(gallery, /finance\.documents\.view/);
});

test("Extrato resolve o título sem fazer uma busca por movimento e mostra comprovante", async () => {
  const movements = read("src/features/finance/infrastructure/finance-movements.repository.ts");
  const display = read("src/features/finance/presentation/FinanceMovementsSection.tsx");
  const gallery = read("src/features/finance/presentation/FinanceOrderEvidenceGallery.tsx");
  assert.ok((await transformWithEsbuild(display, "FinanceMovementsSection.tsx", { loader: "tsx" })).code.length > 200);
  assert.match(movements, /entryIdBySettlement\.set\(settlement\.id, entry\.id\)/);
  assert.match(movements, /origin_entry_id: entryIdBySettlement\.get\(item\.source_id\)/);
  assert.match(display, /selectedMovement\.movement_type === "receipt"/);
  assert.match(display, /kind="payment_proof"/);
  assert.match(gallery, /listFinancialAttachments\(organizationId, entryId\)/);
  assert.match(gallery, /enabled: Boolean\(canView && organizationId && entryId\)/);
});
