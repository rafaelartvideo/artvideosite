import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("comprovante da OS gera vínculo no Financeiro, sem duplicar objeto no Storage", () => {
  const sql = read("supabase/migrations/20261103183000_link_order_payment_proofs_financial_documents.sql");
  assert.match(sql, /add column if not exists source_media_id uuid/);
  assert.match(sql, /add column if not exists storage_bucket text/);
  assert.match(sql, /source_doc\.service_order_id::text = entry\.origin_reference/);
  assert.match(sql, /lower\(btrim\(type_of_doc\.name\)\)='comprovante de pagamento'/);
  assert.match(sql, /media_file\.bucket_id='service-images'/);
  assert.match(sql, /'service-images', media_file\.id/);
  assert.match(sql, /on conflict \(storage_path\) do nothing/);
  assert.match(sql, /finance_link_order_proof_on_entry_created/);
  assert.match(sql, /finance_link_order_proof_on_attachment_added/);
  assert.match(sql, /finance_linked_order_proof_select/);
  assert.match(sql, /private\.can_view_financial_entry/);
  assert.match(sql, /Retroativo|anteriores à migração/);
  assert.doesNotMatch(sql, /storage\.from\([^)]*\)\.upload\(/);
});

test("documentos do Financeiro abrem arquivo no bucket correto", async () => {
  const repo = read("src/features/finance/infrastructure/finance-documents.repository.ts");
  const documents = read("src/features/finance/presentation/FinanceDocumentsPanel.tsx");
  const domain = read("src/features/finance/domain/finance.types.ts");
  assert.ok((await transformWithEsbuild(documents, "FinanceDocumentsPanel.tsx", { loader: "tsx" })).code.length > 0);
  assert.match(domain, /source_media_id\?: string \| null/);
  assert.match(repo, /storage_bucket,source_media_id/);
  assert.match(repo, /supabase\.storage\.from\(storageBucket\)\.createSignedUrl/);
  assert.match(documents, /attachment\.storage_bucket \|\| "financial-documents"/);
  assert.match(documents, /Vinculado à OS/);
  assert.match(documents, /!item\.source_media_id/);
});

test("ação rápida Comprovante está somente no Financeiro desktop e mobile", async () => {
  const entries = read("src/features/finance/presentation/FinanceEntriesSection.tsx");
  const repo = read("src/features/finance/infrastructure/finance-documents.repository.ts");
  assert.ok((await transformWithEsbuild(entries, "FinanceEntriesSection.tsx", { loader: "tsx" })).code.length > 0);
  assert.equal(entries.split("<FileCheck2 size={15} /> Comprovante").length - 1, 2);
  assert.match(entries, /canViewFinancialDocuments/);
  assert.match(entries, /getFinancialEntryProofUrl\(activeOrganizationId, entry\.id\)/);
  assert.match(entries, /window\.open\("", "_blank"\)/);
  assert.match(repo, /listFinancialAttachments\(organizationId, entryId\)/);
  assert.match(repo, /attachment\.attachment_type === "proof"/);
});
